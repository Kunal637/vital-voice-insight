import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, Activity, Edit2, Save, X, HelpCircle, Volume2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import DiagnosisDisplay from '@/components/DiagnosisDisplay';
import TestScheduleDialog from '@/components/TestScheduleDialog';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useAuth } from '@/integrations/firebase/auth-context';
import {
  createConsultation,
  updateConsultation,
  updateAppointmentStatus,
} from '@/integrations/firebase/firestore';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '@/integrations/firebase/config';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`;

const geminiPost = (body: unknown) =>
  fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify(body),
  });

export default function Consultation() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [transcriptState, setTranscript] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [editedDiagnosis, setEditedDiagnosis] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [appointment, setAppointment] = useState<any>(null);
  const [patients, setPatients] = useState<{ id: string; fullName: string; email: string }[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const appointmentId = searchParams.get('appointment');
  const patientIdParam = searchParams.get('patientId');

  // Determine patient ID: URL param > manually selected > fallback
  const patientId = patientIdParam || selectedPatientId || '';

  // Load patient list for the selector (only when no patientId in URL)
  useEffect(() => {
    if (patientIdParam) return; // already have patient from URL
    getDocs(collection(db, 'patients')).then((snap) => {
      setPatients(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    }).catch(console.error);
  }, [patientIdParam]);

  const speak = (texts: string[]) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const isUrdu = texts.some((t) => /[\u0600-\u06FF]/.test(t)) || i18n.language?.startsWith('ur');
    const lang = isUrdu ? 'ur-PK' : 'en-US';
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(isUrdu ? 'ur' : 'en'));
    [isUrdu ? 'ڈاکٹر کو مزید معلومات درکار ہیں۔' : 'I have a few questions for you.', ...texts].forEach((t) => {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = lang; u.rate = 0.95;
      if (voice) u.voice = voice;
      window.speechSynthesis.speak(u);
    });
  };

  const submitAnswers = () => {
    const qa = questions.map((q, i) => `Q: ${q}\nA: ${answers[i]?.trim() || 'No answer'}`).join('\n');
    const updated = `${transcriptState}\n\nClarification answers:\n${qa}`;
    setTranscript(updated);
    setQuestions([]);
    setAnswers([]);
    analyzeSymptoms(updated);
  };

  // Load appointment details
  useEffect(() => {
    if (!appointmentId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'appointments', appointmentId));
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() };
          setAppointment(data);
          const s = (data as any).status;
          if (s === 'requested' || s === 'confirmed') {
            await updateAppointmentStatus(appointmentId, 'in_progress');
          }
        }
      } catch (err) {
        console.error('Error loading appointment:', err);
      }
    })();
  }, [appointmentId]);

  const handleTranscriptComplete = (text: string) => setTranscript(text);

  const analyzeSymptoms = async (override?: string | unknown) => {
    const transcript = typeof override === 'string' ? override : transcriptState;
    if (!transcript) {
      toast({ title: t('common.error'), description: 'Please record a consultation first', variant: 'destructive' });
      return;
    }
    if (!user) {
      toast({ title: 'Not authenticated', variant: 'destructive' });
      return;
    }

    setIsAnalyzing(true);
    try {
      const symptoms = transcript.toLowerCase().includes('headache')
        ? ['headache', 'dizziness', 'light sensitivity']
        : ['general discomfort'];

      const aiRes = await geminiPost({
        system_instruction: {
          parts: [{
            text: `You are an AI medical assistant. Analyze patient symptoms and provide:
1. Possible diagnoses (ranked by likelihood)
2. Confidence level (percentage)
3. Recommended medical tests
4. Urgency assessment

If important information is missing, end your answer with the questions only — list up to 3 short questions for the patient, each on its own line starting with "- ". Do NOT include any heading or label before the questions. Omit the questions entirely if no more info is needed. If the transcript is in Urdu, write the questions in Urdu.

IMPORTANT: This is for medical professional assistance only. Always recommend consulting a healthcare provider.`,
          }],
        },
        contents: [{
          role: 'user',
          parts: [{ text: `Patient consultation transcript: ${transcript}\n\nSymptoms: ${symptoms.join(', ')}\n\nProvide a structured diagnosis analysis.` }],
        }],
        generationConfig: { temperature: 0.3 },
      });

      if (!aiRes.ok) throw new Error(`Gemini API error ${aiRes.status}: ${await aiRes.text()}`);

      const aiJson = await aiRes.json();
      const rawText: string = aiJson.candidates?.[0]?.content?.parts?.[0]?.text || '';

      const confidenceMatch = rawText.match(/(\d+)%/);
      const lines = rawText.split('\n');
      const questionLines: string[] = [];
      const diagnosisLines: string[] = [];
      let inQuestions = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (/^(\*{1,2})?(\d+\.\s*)?CLARIFYING QUESTIONS:?(\*{1,2})?$/i.test(trimmed)) {
          inQuestions = true; continue;
        }
        if (inQuestions && /^[-•*]\s+.+/.test(trimmed)) {
          questionLines.push(trimmed.replace(/^[-•*]\s+/, '').replace(/\*\*/g, '').trim());
        } else if (inQuestions && trimmed === '') {
          // allow blank lines
        } else {
          inQuestions = false;
          diagnosisLines.push(line);
        }
      }

      let clarifyingQs: string[] = [];
      let diagnosisText = rawText;

      if (questionLines.length === 0) {
        const reversed = [...lines].reverse();
        const trailingQs: string[] = [];
        for (const line of reversed) {
          const trimmed = line.trim();
          if (trimmed === '') continue;
          if (/^[-•*]\s+.{10,}/.test(trimmed)) {
            trailingQs.unshift(trimmed.replace(/^[-•*]\s+/, '').replace(/\*\*/g, '').trim());
          } else break;
        }
        if (trailingQs.length > 0 && trailingQs.length <= 3) {
          clarifyingQs = trailingQs;
          diagnosisText = lines.slice(0, lines.length - trailingQs.length).join('\n').trim();
        }
      } else {
        clarifyingQs = questionLines.slice(0, 3);
        diagnosisText = diagnosisLines.join('\n').trim();
      }

      const conf = confidenceMatch ? parseInt(confidenceMatch[1]) : 75;
      setQuestions(clarifyingQs);
      setAnswers(clarifyingQs.map(() => ''));
      if (clarifyingQs.length) speak(clarifyingQs);

      // Update existing consultation or create new one
      if (consultationId) {
        await updateConsultation(consultationId, { transcript, diagnosis: diagnosisText, aiConfidence: conf });
        setDiagnosis(diagnosisText);
        setEditedDiagnosis(diagnosisText);
        setConfidence(conf);
        setSelectedTests([]);
        toast({ title: t('common.success'), description: 'Diagnosis updated with new information' });
        return;
      }

      // Mark appointment completed
      if (appointmentId) {
        await updateAppointmentStatus(appointmentId, 'completed');
      }

      const newDoc = await createConsultation({
        doctorId: user.uid,
        patientId,
        transcript,
        diagnosis: diagnosisText,
        aiConfidence: conf,
        symptoms,
        appointmentId: appointmentId ?? null,
      });

      setConsultationId(newDoc.id);
      setDiagnosis(diagnosisText);
      setEditedDiagnosis(diagnosisText);
      setConfidence(conf);
      setSelectedTests([]);
      toast({ title: t('common.success'), description: 'AI diagnosis generated successfully' });

    } catch (error) {
      console.error('Analysis error:', error);
      const errMsg = error instanceof Error ? error.message : 'Failed to generate diagnosis';
      toast({
        title: t('common.error'),
        description: errMsg,
        variant: 'destructive',
      });

      // Provide a visible fallback so the diagnosis panel doesn't remain blank.
      // This gives the user immediate feedback while keeping the original error logged.
      try {
        const heuristic = transcript.toLowerCase().includes('headache')
          ? `1. Tension-type headache\n\nRecommendation: rest, hydration, consider OTC analgesics (e.g., paracetamol). If fever or worsening, seek medical attention.`
          : `1. General viral illness\n\nRecommendation: symptomatic care, fluids, rest. Seek medical attention if symptoms worsen or persist.`;
        const fallback = `AI diagnosis failed: ${errMsg}\n\nHeuristic analysis:\n${heuristic}`;
        setDiagnosis(fallback);
        setEditedDiagnosis(fallback);
        setConfidence(null);
      } catch (e) {
        // swallow fallback errors but keep original console output
        console.error('Fallback generation error:', e);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveDiagnosis = async () => {
    if (!consultationId) return;
    setIsSaving(true);
    try {
      await updateConsultation(consultationId, { diagnosis: editedDiagnosis });
      setDiagnosis(editedDiagnosis);
      setIsEditing(false);
      toast({ title: t('common.success'), description: 'Diagnosis updated successfully' });
    } catch (error) {
      toast({ title: t('common.error'), description: error instanceof Error ? error.message : 'Failed to update diagnosis', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── Sticky header with breadcrumb ── */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-border shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm min-w-0">
            <button
              onClick={() => navigate('/dashboard')}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              Dashboard
            </button>
            <span className="text-muted-foreground/40">›</span>
            <span className="font-semibold text-foreground truncate">
              {appointment
                ? `${appointment.patientName} — Consultation`
                : patientId
                  ? `Patient Consultation`
                  : 'New Consultation'}
            </span>
          </nav>

          {/* Back button */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 border border-border rounded-lg px-3 py-1.5 hover:bg-accent"
          >
            <ArrowLeft className="w-4 h-4" />Back
          </button>
        </div>

        {/* Patient context bar — shown when patient is known */}
        {(appointment || patientId) && (
          <div className="max-w-6xl mx-auto px-6 pb-2 flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-full px-3 py-1">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-400 to-teal-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                {(appointment?.patientName || 'P').charAt(0).toUpperCase()}
              </div>
              {appointment
                ? <><span className="font-medium text-foreground">{appointment.patientName}</span> · {appointment.department} · {appointment.reason}</>
                : <span className="font-medium text-foreground">Patient selected</span>
              }
            </div>
            <LanguageSwitcher />
          </div>
        )}
        {!appointment && !patientId && (
          <div className="max-w-6xl mx-auto px-6 pb-2 flex items-center justify-end">
            <LanguageSwitcher />
          </div>
        )}
      </header>

      <div className="max-w-6xl mx-auto p-6 space-y-6">

        <div className="grid md:grid-cols-2 gap-6">
          {/* Patient selector — shown only when no patientId in URL */}
          {!patientIdParam && patients.length > 0 && (
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 p-4 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/5 to-cyan-50">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Activity className="w-4 h-4 text-primary" />
                </div>
                <Label className="text-sm font-semibold shrink-0 text-foreground">Patient</Label>
                <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                  <SelectTrigger className="max-w-xs bg-white shadow-sm">
                    <SelectValue placeholder="Choose a patient…" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="font-medium">{p.fullName}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{p.email}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!patientId && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    ⚠ Select a patient before scheduling tests
                  </p>
                )}
                {patientId && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    ✓ Patient selected
                  </span>
                )}
              </div>
            </div>
          )}
          {/* Recording */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Voice Recording
              </CardTitle>
              <CardDescription>Record the patient's symptoms and medical history</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6">
              <VoiceRecorder onTranscriptComplete={handleTranscriptComplete} />

              {transcriptState && (
                <div className="w-full space-y-4">
                  <div className="p-4 bg-accent rounded-lg">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4" />Transcript
                    </h3>
                    <p className="text-sm text-muted-foreground">{transcriptState}</p>
                  </div>
                  <Button onClick={() => analyzeSymptoms()} disabled={isAnalyzing} className="w-full">
                    {isAnalyzing ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('common.loading')}</>
                    ) : t('consultation.analyzeButton')}
                  </Button>
                </div>
              )}

              {questions.length > 0 && (
                <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold flex items-center gap-2"><HelpCircle className="w-4 h-4 text-primary" />AI needs more information</p>
                    <Button size="sm" variant="outline" onClick={() => speak(questions)}>
                      <Volume2 className="w-4 h-4 mr-1" />Read aloud
                    </Button>
                  </div>
                  {questions.map((q, i) => (
                    <div key={i} className="space-y-1">
                      <p className="text-sm font-medium" dir="auto">{i + 1}. {q}</p>
                      <Textarea
                        dir="auto"
                        rows={2}
                        value={answers[i] || ''}
                        onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))}
                        placeholder="Patient's answer..."
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button onClick={submitAnswers} disabled={isAnalyzing} className="flex-1">
                      {isAnalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Re-analyze with answers
                    </Button>
                    <Button variant="ghost" onClick={() => { window.speechSynthesis?.cancel(); setQuestions([]); }}>Skip</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Diagnosis */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-secondary" />
                {t('consultation.diagnosis')}
              </CardTitle>
              <CardDescription>AI-powered analysis and recommendations</CardDescription>
            </CardHeader>
            <CardContent>
              {diagnosis ? (
                <div className="space-y-4">
                  <DiagnosisDisplay
                    key={diagnosis}
                    diagnosisText={diagnosis}
                    confidence={confidence}
                    onSelectedTestsChange={setSelectedTests}
                  />

                  <div className="flex gap-2">
                    {isEditing ? (
                      <>
                        <Button onClick={handleSaveDiagnosis} disabled={isSaving} className="flex-1">
                          {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('common.loading')}</> : <><Save className="w-4 h-4 mr-2" />{t('common.save')}</>}
                        </Button>
                        <Button onClick={() => { setEditedDiagnosis(diagnosis); setIsEditing(false); }} variant="outline" disabled={isSaving}>
                          <X className="w-4 h-4 mr-2" />{t('common.cancel')}
                        </Button>
                      </>
                    ) : (
                      <Button onClick={() => { setEditedDiagnosis(diagnosis); setIsEditing(true); }} variant="outline" className="flex-1">
                        <Edit2 className="w-4 h-4 mr-2" />{t('common.edit')}
                      </Button>
                    )}
                  </div>

                  {isEditing && (
                    <div className="p-3 bg-gradient-card rounded-lg border border-border">
                      <Textarea value={editedDiagnosis} onChange={(e) => setEditedDiagnosis(e.target.value)} className="min-h-[200px] text-foreground" placeholder="Edit diagnosis..." />
                    </div>
                  )}

                  {consultationId && (
                    <TestScheduleDialog
                      consultationId={consultationId}
                      patientId={patientId}
                      selectedTests={selectedTests}
                    />
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <Activity className="w-16 h-16 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Record a consultation and click "Generate AI Diagnosis" to see results here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
