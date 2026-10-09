const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_BYTES = 20 * 1024 * 1024; // Gemini inline limit ~20 MB

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return json({ error: 'GEMINI_API_KEY is not configured' }, 500);

    const len = Number(req.headers.get('content-length') || 0);
    if (len > MAX_BYTES) return json({ error: 'Audio too large (max 20 MB)' }, 413);

    const form = await req.formData();
    const file = form.get('file');
    const lang = String(form.get('language') || '');
    if (!(file instanceof File) || !file.size || file.size > MAX_BYTES)
      return json({ error: 'Invalid audio file' }, 400);

    // Convert audio blob to base64 for Gemini inline data
    const arrayBuffer = await file.arrayBuffer();
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    const langHint = lang.startsWith('ur')
      ? 'The audio may be in Urdu. Transcribe exactly as spoken.'
      : 'The audio may be in English. Transcribe exactly as spoken.';

    const prompt = `You are a medical transcription assistant. Transcribe the speech in this audio clip exactly as spoken, word for word. ${langHint} This is a doctor-patient medical consultation. Output only the transcript text, nothing else.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
              ],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
      }
    );

    if (!res.ok) {
      const details = await res.text();
      console.error('Gemini transcription failed', res.status, details);
      return json({ error: 'Transcription failed', status: res.status, details }, res.status);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    return json({ text });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
