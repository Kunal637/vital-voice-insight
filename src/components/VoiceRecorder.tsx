import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Loader2, Upload, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface VoiceRecorderProps {
  onTranscriptComplete: (transcript: string, audioUrl?: string) => void;
}

// Audio is recorded in short segments so text appears while the patient is still talking.
const SEGMENT_MS = 8000;
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

export const VoiceRecorder = ({ onTranscriptComplete }: VoiceRecorderProps) => {
  const { i18n } = useTranslation();
  const { toast } = useToast();

  // recording state
  const [isRecording, setIsRecording] = useState(false);
  const [pending, setPending] = useState(0);
  const [text, setText] = useState('');

  // upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isTranscribingUpload, setIsTranscribingUpload] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const textRef = useRef('');
  const segIdRef = useRef(0);
  const partsRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cleanup = () => {
    activeRef.current = false;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => cleanup, []);

  // Safe base64 encoder — btoa(String.fromCharCode(...)) crashes on large buffers
  const toBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  };

  const transcribeBlob = async (blob: Blob, mimeType: string, idx: number) => {
    const arrayBuffer = await blob.arrayBuffer();
    const base64Audio = toBase64(arrayBuffer);
    const isUrdu = i18n.language?.startsWith('ur');
    const langHint = isUrdu
      ? 'The audio may be in Urdu. Transcribe exactly as spoken.'
      : 'The audio may be in English. Transcribe exactly as spoken.';

    // Retry up to 2 times on 429 rate limit with exponential backoff
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 10000));
      res = await geminiPost({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are a medical transcription assistant. Transcribe the speech in this audio clip exactly as spoken, word for word. ${langHint} This is a doctor-patient medical consultation. Output only the transcript text, nothing else. If there is no speech, output nothing.`,
              },
              { inlineData: { mimeType, data: base64Audio } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      });
      if (res.status !== 429) break;
      console.warn(`Rate limited, retrying in ${attempt * 10}s...`);
    }

    if (!res || !res.ok) {
      const details = await res?.text();
      console.error('Gemini transcription error:', res?.status, details);
      if (res?.status === 429) return null; // silently skip rate limit
      throw new Error(`Gemini error ${res?.status}: ${details}`);
    }

    const data = await res.json();
    const transcribed = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    console.log('Transcribed segment:', transcribed || '(empty)');

    // Skip silence / empty responses
    const isSilence =
      !transcribed ||
      /^\[.*\]$/.test(transcribed) ||
      /no speech/i.test(transcribed) ||
      /silence/i.test(transcribed) ||
      transcribed.length < 3;

    return isSilence ? null : transcribed;
  };

  // ── live recording ──────────────────────────────────────────────────────────
  const transcribeSegment = async (blob: Blob) => {
    if (blob.size < 1500) return;
    const idx = segIdRef.current++;
    setPending((p) => p + 1);
    try {
      const result = await transcribeBlob(blob, 'audio/webm', idx);
      if (result) {
        partsRef.current[idx] = result;
        textRef.current = partsRef.current.filter(Boolean).join(' ');
        setText(textRef.current);
        onTranscriptComplete(textRef.current);
      }
    } catch (e) {
      console.error('Transcription error', e);
      toast({ title: 'Transcription failed', description: 'Part of the recording could not be transcribed.', variant: 'destructive' });
    } finally {
      setPending((p) => p - 1);
    }
  };

  const recordSegment = () => {
    if (!activeRef.current || !streamRef.current) return;
    const rec = new MediaRecorder(streamRef.current);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      if (activeRef.current) recordSegment();
      transcribeSegment(new Blob(chunks, { type: 'audio/webm' }));
    };
    recorderRef.current = rec;
    rec.start();
    timerRef.current = window.setTimeout(() => rec.state === 'recording' && rec.stop(), SEGMENT_MS);
  };

  const startRecording = async () => {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast({ title: 'Microphone Error', description: 'Please allow microphone access.', variant: 'destructive' });
      return;
    }
    textRef.current = '';
    partsRef.current = [];
    segIdRef.current = 0;
    setText('');
    setUploadedFile(null);
    activeRef.current = true;
    setIsRecording(true);
    recordSegment();
  };

  const stopRecording = () => {
    setIsRecording(false);
    cleanup();
  };

  // ── file upload ─────────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setText('');
    // reset so same file can be re-selected
    e.target.value = '';
  };

  const transcribeUploadedFile = async () => {
    if (!uploadedFile) return;
    setIsTranscribingUpload(true);
    try {
      const result = await transcribeBlob(uploadedFile, uploadedFile.type || 'audio/mpeg', 0);
      if (result) {
        setText(result);
        onTranscriptComplete(result);
      } else {
        toast({ title: 'No speech detected', description: 'The uploaded audio file appears to contain no recognisable speech.', variant: 'destructive' });
      }
    } catch (e) {
      console.error('Upload transcription error', e);
      toast({ title: 'Transcription failed', description: e instanceof Error ? e.message : 'Could not transcribe the uploaded file.', variant: 'destructive' });
    } finally {
      setIsTranscribingUpload(false);
    }
  };

  const removeUploadedFile = () => {
    setUploadedFile(null);
    setText('');
  };

  const busy = pending > 0 || isTranscribingUpload;

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* ── tab-style switcher ── */}
      <div className="flex w-full rounded-lg border border-border overflow-hidden text-sm font-medium">
        <button
          type="button"
          className={`flex-1 py-2 flex items-center justify-center gap-2 transition-colors ${!uploadedFile && !isTranscribingUpload ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
          onClick={() => { setUploadedFile(null); setText(''); }}
        >
          <Mic className="w-4 h-4" /> Live Recording
        </button>
        <button
          type="button"
          className={`flex-1 py-2 flex items-center justify-center gap-2 transition-colors ${uploadedFile ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-4 h-4" /> Upload Audio
        </button>
      </div>

      {/* ── hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── upload mode ── */}
      {uploadedFile ? (
        <div className="flex flex-col items-center gap-3 w-full">
          <div className="flex items-center gap-2 w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate">{uploadedFile.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {(uploadedFile.size / 1024).toFixed(0)} KB
            </span>
            <button type="button" onClick={removeUploadedFile} className="text-muted-foreground hover:text-destructive">
              <X className="w-4 h-4" />
            </button>
          </div>
          <Button onClick={transcribeUploadedFile} disabled={isTranscribingUpload} className="w-full">
            {isTranscribingUpload ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Transcribing...</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" />Transcribe Audio</>
            )}
          </Button>
        </div>
      ) : (
        /* ── recording mode ── */
        <>
          <Button
            onClick={isRecording ? stopRecording : startRecording}
            size="lg"
            className={`w-24 h-24 rounded-full shadow-medical hover:scale-105 transition-transform ${isRecording ? 'animate-pulse' : ''}`}
            variant={isRecording ? 'destructive' : 'default'}
          >
            {isRecording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
          </Button>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            {isRecording
              ? busy ? 'Listening & transcribing... Click to stop' : 'Listening... Click to stop'
              : busy ? 'Finishing transcription...' : 'Click to start recording'}
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          </p>
        </>
      )}

      {/* ── transcript display ── */}
      {(isRecording || text || busy) && (
        <div className="w-full rounded-md border border-border bg-muted/40 p-3 text-sm min-h-16" dir="auto">
          {text || <span className="text-muted-foreground">Text will appear here...</span>}
        </div>
      )}
    </div>
  );
};
