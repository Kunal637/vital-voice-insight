import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, Image as ImageIcon, AlertCircle, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`;

const geminiPost = (body: unknown) =>
  fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

export default function XRayAnalysis() {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setAnalysis(null);
    }
  };

  const analyzeImage = async () => {
    if (!selectedFile) {
      toast({
        title: "No image selected",
        description: "Please select an X-ray image first",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const dataUri = reader.result as string;
          // Extract base64 data and mime type from data URI
          const [meta, base64Data] = dataUri.split(',');
          const mimeType = meta.replace('data:', '').replace(';base64', '');

          const res = await geminiPost({
              system_instruction: {
                parts: [{
                  text: `You are an AI radiologist assistant. Analyze medical imaging and provide findings.
Format your response as JSON with this exact structure:
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
}`
                }]
              },
              contents: [{
                role: 'user',
                parts: [
                  { text: 'Analyze this X-ray image and identify any abnormalities. Return only valid JSON.' },
                  { inlineData: { mimeType, data: base64Data } },
                ],
              }],
              generationConfig: { responseMimeType: 'application/json' },
            });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Gemini API error ${res.status}: ${errText}`);
          }

          const geminiData = await res.json();
          let raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

          // Strip markdown code fences if present
          if (raw.includes('```json')) raw = raw.split('```json')[1].split('```')[0].trim();
          else if (raw.includes('```')) raw = raw.split('```')[1].split('```')[0].trim();

          let parsed;
          try { parsed = JSON.parse(raw); }
          catch { parsed = { findings: raw, anomalies: [], recommendations: 'Consult with a radiologist for detailed analysis.' }; }

          setAnalysis(parsed);
          toast({ title: 'Analysis Complete', description: 'X-ray analyzed successfully' });
        } catch (err) {
          console.error('Analysis error:', err);
          toast({ title: 'Analysis Failed', description: err instanceof Error ? err.message : 'Failed to analyze X-ray', variant: 'destructive' });
        } finally {
          setIsAnalyzing(false);
        }
      };
      reader.readAsDataURL(selectedFile);
    } catch (error) {
      console.error('Analysis error:', error);
      toast({ title: 'Analysis Failed', description: error instanceof Error ? error.message : 'Failed to analyze X-ray', variant: 'destructive' });
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── Sticky header with breadcrumb ── */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <nav className="flex items-center gap-1.5 text-sm min-w-0">
            <button onClick={() => navigate('/dashboard')} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">Dashboard</button>
            <span className="text-muted-foreground/40">›</span>
            <span className="font-semibold text-foreground">X-Ray Analysis</span>
          </nav>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors border border-border rounded-lg px-3 py-1.5 hover:bg-accent shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />Back
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">X-Ray Analysis</h1>
          <p className="text-muted-foreground text-sm">Upload medical imaging for AI-powered anomaly detection</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Upload Section */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                Upload X-Ray
              </CardTitle>
              <CardDescription>
                Select an X-ray or medical imaging file for analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="xray-upload"
                />
                <label
                  htmlFor="xray-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <ImageIcon className="w-12 h-12 text-muted-foreground" />
                  <span className="text-sm font-medium">Click to upload X-ray image</span>
                  <span className="text-xs text-muted-foreground">PNG, JPG, or DICOM</span>
                </label>
              </div>

              {previewUrl && (
                <div className="space-y-4">
                  <div className="relative rounded-lg overflow-hidden border border-border bg-black">
                    <img
                      src={previewUrl}
                      alt="X-ray preview"
                      className="w-full h-auto"
                    />
                    
                    {analysis?.anomalies?.map((anomaly: any, index: number) => (
                      <div
                        key={index}
                        className="absolute border-2 border-red-500 bg-red-500/20"
                        style={{
                          left: `${anomaly.coordinates?.x || 0}%`,
                          top: `${anomaly.coordinates?.y || 0}%`,
                          width: `${anomaly.coordinates?.width || 10}%`,
                          height: `${anomaly.coordinates?.height || 10}%`,
                        }}
                      >
                        <div className="absolute -top-6 left-0 bg-red-500 text-white text-xs px-2 py-1 rounded">
                          {anomaly.description}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={analyzeImage}
                    disabled={isAnalyzing}
                    className="w-full"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      'Analyze X-Ray with AI'
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Analysis Results */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-secondary" />
                Analysis Results
              </CardTitle>
              <CardDescription>
                AI-detected anomalies and recommendations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analysis ? (
                <div className="space-y-6">
                  {/* Findings */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-primary">
                      Findings
                    </h3>
                    <p className="text-sm text-foreground leading-relaxed">
                      {analysis.findings}
                    </p>
                  </div>

                  {/* Anomalies */}
                  {analysis.anomalies && analysis.anomalies.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-sm uppercase tracking-wide text-primary">
                        Detected Anomalies
                      </h3>
                      {analysis.anomalies.map((anomaly: any, index: number) => (
                        <div
                          key={index}
                          className="p-4 bg-accent rounded-lg border border-border space-y-2"
                        >
                          <div className="flex items-start justify-between">
                            <p className="text-sm font-medium">{anomaly.description}</p>
                            <Badge
                              variant={
                                anomaly.severity === 'high'
                                  ? 'destructive'
                                  : anomaly.severity === 'medium'
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {anomaly.severity}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Location: {anomaly.location}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recommendations */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-primary">
                      Recommendations
                    </h3>
                    <p className="text-sm text-foreground leading-relaxed">
                      {analysis.recommendations}
                    </p>
                  </div>

                  <Button variant="secondary" className="w-full">
                    Generate Report
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-96 text-center">
                  <ImageIcon className="w-16 h-16 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Upload an X-ray image and click "Analyze" to see AI-powered results
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}