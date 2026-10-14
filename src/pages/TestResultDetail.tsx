import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, AlertCircle, Eye, EyeOff, Save, User, FlaskConical,
  Calendar, Clock, Stethoscope, FileImage, Download, CheckCircle2,
  Activity, FileText, Loader2,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  getTestResult, updateTestResult, getPatient,
  getAllMedicalTests, toDate, createNotification,
} from '@/integrations/firebase/firestore';
import { useAuth } from '@/integrations/firebase/auth-context';
import { format } from 'date-fns';
import { notifyPatientResultReviewed } from '@/integrations/firebase/email';

const priorityColor: Record<string, string> = {
  emergency: 'bg-red-100 text-red-700 border-red-200',
  urgent:    'bg-orange-100 text-orange-700 border-orange-200',
  normal:    'bg-blue-100 text-blue-700 border-blue-200',
};

export default function TestResultDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { toast } = useToast();

  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [testResult, setTestResult]       = useState<any>(null);
  const [testInfo, setTestInfo]           = useState<any>(null);
  const [patient, setPatient]             = useState<any>(null);
  const [doctorRemarks, setDoctorRemarks] = useState('');
  const [doctorAdvice, setDoctorAdvice]   = useState('');
  const [showAiHighlight, setShowAiHighlight] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const result: any = await getTestResult(id);
        if (!result) throw new Error('Result not found');
        setTestResult(result);
        setDoctorRemarks(result.doctorRemarks || '');
        setDoctorAdvice(result.doctorAdvice   || '');

        const tests = await getAllMedicalTests();
        const test  = tests.find((t: any) => t.id === result.testId);
        setTestInfo(test);

        if (result.patientId) setPatient(await getPatient(result.patientId));
      } catch (e: any) {
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateTestResult(id, {
        doctorRemarks,
        doctorAdvice,
        reviewedAt: new Date().toISOString(),
        reviewedBy: user?.uid,
      });
      if (testInfo?.id) {
        const { updateMedicalTest } = await import('@/integrations/firebase/firestore');
        await updateMedicalTest(testInfo.id, { status: 'reviewed' });
      }

      if (patient?.email) {
        await notifyPatientResultReviewed(
          patient.email,
          patient.fullName,
          testInfo?.testName ?? 'Test Result',
          doctorRemarks,
          doctorAdvice
        );
      }
      toast({ title: 'Saved', description: 'Review saved and patient notified.' });
      setTestResult((prev: any) => ({ ...prev, doctorRemarks, doctorAdvice, reviewedAt: new Date().toISOString() }));

      // Create a notification for the result review
      if (patient?.id) {
        await createNotification(patient.id, {
          title: 'Test Result Reviewed',
          message: `Your test result for "${testInfo?.testName ?? 'your test'}" has been reviewed by Dr. ${user?.displayName ?? 'your doctor'}.`,
          type: 'result_reviewed',
        });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="w-10 h-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
        <p className="text-sm">Loading report…</p>
      </div>
    </div>
  );

  if (!testResult) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-muted-foreground">Test result not found.</p>
    </div>
  );

  const isXRay    = testInfo?.testType?.toLowerCase().includes('xray') || testInfo?.testType?.toLowerCase().includes('x-ray');
  const anomalies = testResult.anomaliesDetected;
  const reviewed  = !!testResult.reviewedAt;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top bar ── */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm min-w-0">
            <button onClick={() => navigate('/dashboard')} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">Dashboard</button>
            <span className="text-muted-foreground/40">›</span>
            <button onClick={() => navigate('/dashboard?tab=patients')} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">Patients</button>
            <span className="text-muted-foreground/40">›</span>
            <span className="font-semibold text-foreground truncate max-w-[200px]">
              {patient?.fullName ?? 'Test Result'}
            </span>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors border border-border rounded-lg px-3 py-1.5 hover:bg-accent"
            >
              <ArrowLeft className="w-4 h-4" />Back
            </button>
            {reviewed && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-full px-3 py-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Reviewed {format(new Date(testResult.reviewedAt), 'MMM d, yyyy')}
              </span>
            )}
            <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : 'Save Review'}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* ── Title strip ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {testInfo?.testName ?? 'Test Result'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Submitted {format(toDate(testResult.createdAt), 'EEEE, MMMM d yyyy · h:mm a')}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {testInfo?.priority && (
              <span className={`text-xs px-3 py-1 rounded-full border font-medium ${priorityColor[testInfo.priority] ?? priorityColor.normal}`}>
                {testInfo.priority} priority
              </span>
            )}
            <Badge variant={reviewed ? 'default' : 'secondary'} className={reviewed ? 'bg-purple-600' : 'bg-yellow-500 text-white'}>
              {reviewed ? 'Reviewed' : 'Pending Review'}
            </Badge>
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="grid lg:grid-cols-3 gap-6">

          {/* LEFT — patient + test meta */}
          <div className="space-y-4">

            {/* Patient card */}
            <div className="bg-white rounded-2xl border border-border shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-teal-600 flex items-center justify-center text-white font-bold text-lg">
                  {patient?.fullName?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{patient?.fullName ?? 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{patient?.email ?? '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Phone</p>
                  <p className="text-sm font-medium mt-0.5">{patient?.phone ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Patient ID</p>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">{patient?.id ?? '—'}</p>
                </div>
              </div>
            </div>

            {/* Test meta card */}
            <div className="bg-white rounded-2xl border border-border shadow-sm p-5 space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-primary" />Test Details
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Type</p>
                    <p className="text-sm font-medium">{testInfo?.testType ?? '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Department</p>
                    <p className="text-sm font-medium">{testInfo?.department ?? '—'}</p>
                  </div>
                </div>
                {testInfo?.scheduledDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Scheduled</p>
                      <p className="text-sm font-medium">{format(toDate(testInfo.scheduledDate), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                )}
                {testInfo?.scheduledTime && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Time</p>
                      <p className="text-sm font-medium">
                        {format(new Date(`2000-01-01T${testInfo.scheduledTime}`), 'h:mm a')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              {testInfo?.notes && (
                <div className="pt-3 border-t border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Doctor's Notes</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{testInfo.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — result file + AI + doctor review */}
          <div className="lg:col-span-2 space-y-5">

            {/* ── Uploaded Result ── */}
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <p className="font-semibold flex items-center gap-2">
                  <FileImage className="w-4 h-4 text-primary" />Uploaded Result
                </p>
                {testResult.resultFileUrl && (
                  <div className="flex items-center gap-2">
                    {isXRay && (
                      <div className="flex items-center gap-2">
                        <Switch id="ai-hl" checked={showAiHighlight} onCheckedChange={setShowAiHighlight} />
                        <Label htmlFor="ai-hl" className="text-xs flex items-center gap-1 cursor-pointer">
                          {showAiHighlight ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          AI Highlights
                        </Label>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        const url = testResult.resultFileUrl as string;
                        const a = document.createElement('a');
                        a.href = url;
                        // derive filename from mime type
                        const mime = url.split(';')[0].split(':')[1] ?? '';
                        const ext = mime.includes('pdf') ? 'pdf' : mime.includes('png') ? 'png' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'file';
                        a.download = `test-result-${id}.${ext}`;
                        a.click();
                      }}
                      className="flex items-center gap-1.5 text-xs border border-border rounded-md px-3 py-1.5 hover:bg-accent transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />Download
                    </button>
                  </div>
                )}
              </div>
              <div className="p-5">
                {testResult.resultFileUrl ? (
                  (() => {
                    const url = testResult.resultFileUrl as string;
                    const mime = url.startsWith('data:') ? url.split(';')[0].split(':')[1] : '';
                    const isImg = mime.startsWith('image/') || isXRay;
                    const isPdf = mime === 'application/pdf';

                    if (isImg) return (
                      <div className="relative rounded-xl overflow-hidden border border-border bg-black">
                        <img
                          src={url}
                          alt="Uploaded test result"
                          className="w-full h-auto max-h-[500px] object-contain"
                        />
                        {showAiHighlight && Array.isArray(anomalies) && anomalies.map((a: any, i: number) => (
                          <div key={i} className="absolute border-2 border-red-500 bg-red-500/20 rounded"
                            style={{ left: `${a.coordinates?.x ?? 0}%`, top: `${a.coordinates?.y ?? 0}%`, width: `${a.coordinates?.width ?? 10}%`, height: `${a.coordinates?.height ?? 10}%` }}>
                            <div className="absolute -top-6 left-0 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap">
                              {a.description}
                            </div>
                          </div>
                        ))}
                      </div>
                    );

                    if (isPdf) return (
                      <iframe
                        src={url}
                        title="Test result PDF"
                        className="w-full rounded-xl border border-border"
                        style={{ height: '600px' }}
                      />
                    );

                    // Unknown type — show download card
                    return (
                      <div className="flex items-center gap-4 p-5 rounded-xl border border-border bg-gray-50">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Result file uploaded</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Click Download to view the file</p>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <FileImage className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">No file uploaded yet.</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── AI Anomalies ── */}
            {Array.isArray(anomalies) && anomalies.length > 0 && (
              <div className="bg-red-50 rounded-2xl border border-red-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-red-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <p className="font-semibold text-red-700">AI Detected Abnormalities</p>
                </div>
                <div className="p-5 space-y-3">
                  {anomalies.map((a: any, i: number) => (
                    <div key={i} className="flex items-start justify-between gap-3 bg-white rounded-xl border border-red-200 p-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-gray-800">{a.description}</p>
                        {a.location && <p className="text-xs text-muted-foreground">Location: {a.location}</p>}
                      </div>
                      <Badge variant={a.severity === 'high' ? 'destructive' : a.severity === 'medium' ? 'default' : 'secondary'}>
                        {a.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── AI Analysis ── */}
            {(testResult.aiAnalysis || testResult.aiRemarks) && (
              <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  <p className="font-semibold">AI Analysis</p>
                </div>
                <div className="p-5 space-y-4">
                  {testResult.aiAnalysis && (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                      <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">Analysis</p>
                      <p className="text-sm leading-relaxed text-gray-700">{testResult.aiAnalysis}</p>
                    </div>
                  )}
                  {testResult.aiRemarks && (
                    <div className="bg-secondary/5 border border-secondary/20 rounded-xl p-4">
                      <p className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Recommendations</p>
                      <p className="text-sm leading-relaxed text-gray-700">{testResult.aiRemarks}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Doctor Review ── */}
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <p className="font-semibold">Doctor's Review</p>
                {reviewed && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Last saved {format(new Date(testResult.reviewedAt), 'MMM d, h:mm a')}
                  </span>
                )}
              </div>
              <div className="p-5 space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Observations & Remarks</Label>
                  <Textarea
                    placeholder="Enter your clinical observations, findings, and comments about the test result…"
                    value={doctorRemarks}
                    onChange={(e) => setDoctorRemarks(e.target.value)}
                    className="min-h-[130px] resize-none text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Advice & Recommendations</Label>
                  <Textarea
                    placeholder="Enter recommendations: medications, dosage, follow-up schedule, lifestyle changes…"
                    value={doctorAdvice}
                    onChange={(e) => setDoctorAdvice(e.target.value)}
                    className="min-h-[130px] resize-none text-sm"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-1">
                  <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
                  <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-[130px]">
                    {saving
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                      : <><Save className="w-4 h-4" />Save Review</>}
                  </Button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
