import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symptoms, transcript } = await req.json();
    console.log('Processing diagnosis request:', { symptoms, hasTranscript: !!transcript });

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const systemInstruction = `You are an AI medical assistant. Analyze patient symptoms and provide:
1. Possible diagnoses (ranked by likelihood)
2. Confidence level (percentage)
3. Recommended medical tests
4. Urgency assessment

IMPORTANT: This is for medical professional assistance only. Always recommend consulting with a healthcare provider.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Patient consultation transcript: ${transcript}\n\nSymptoms: ${symptoms.join(', ')}\n\nProvide a structured diagnosis analysis.`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.3 },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Diagnosis generated successfully');

    // Extract confidence percentage
    const confidenceMatch = analysis.match(/(\d+)%/);
    const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 75;

    return new Response(
      JSON.stringify({
        diagnosis: analysis,
        confidence,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in ai-diagnosis:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during diagnosis';
    const errorDetails = error instanceof Error ? error.toString() : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage, details: errorDetails }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
