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
    const { imageUrl, imageBase64, testType } = await req.json();
    console.log('Processing X-ray analysis request:', { testType, hasUrl: !!imageUrl, hasBase64: !!imageBase64 });

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    // Resolve image: prefer URL, fall back to base64
    const imageSource = imageUrl || imageBase64;
    if (!imageSource) throw new Error('No image provided');

    // Build the inline image part for Gemini
    // If it's a base64 data URI (data:image/...;base64,...) extract the parts
    // If it's a plain URL, fetch and convert to base64
    let inlinePart: { inlineData: { mimeType: string; data: string } } | { fileData: { mimeType: string; fileUri: string } };

    if (imageSource.startsWith('data:')) {
      // data URI format: data:<mimeType>;base64,<data>
      const [meta, b64] = imageSource.split(',');
      const mimeType = meta.replace('data:', '').replace(';base64', '');
      inlinePart = { inlineData: { mimeType, data: b64 } };
    } else {
      // Remote URL — fetch and convert
      const imgRes = await fetch(imageSource);
      if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
      const contentType = imgRes.headers.get('content-type') || 'image/png';
      const arrayBuffer = await imgRes.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      inlinePart = { inlineData: { mimeType: contentType, data: b64 } };
    }

    const systemPrompt = `You are an AI radiologist assistant. Analyze medical imaging and provide:
1. Identification of any abnormalities or areas of concern
2. Description of findings with approximate locations (percentage from top/left)
3. Severity assessment
4. Recommendations for further investigation

Format your response as JSON with the following structure:
{
  "findings": "detailed description",
  "anomalies": [
    {
      "description": "what was found",
      "location": "approximate position",
      "coordinates": { "x": 0-100, "y": 0-100, "width": 0-100, "height": 0-100 },
      "severity": "low|medium|high"
    }
  ],
  "recommendations": "further steps"
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [
            {
              role: 'user',
              parts: [
                { text: `Analyze this ${testType || 'X-ray'} image and identify any abnormalities.` },
                inlinePart,
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const geminiData = await response.json();
    let analysis = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('X-ray analysis completed successfully');

    // Strip markdown code fences if present
    if (analysis.includes('```json')) {
      analysis = analysis.split('```json')[1].split('```')[0].trim();
    } else if (analysis.includes('```')) {
      analysis = analysis.split('```')[1].split('```')[0].trim();
    }

    let parsedAnalysis;
    try {
      parsedAnalysis = JSON.parse(analysis);
    } catch {
      parsedAnalysis = {
        findings: analysis,
        anomalies: [],
        recommendations: 'Consult with a radiologist for detailed analysis',
      };
    }

    return new Response(
      JSON.stringify({ analysis: parsedAnalysis, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in analyze-xray:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during X-ray analysis';
    const errorDetails = error instanceof Error ? error.toString() : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage, details: errorDetails }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
