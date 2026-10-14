import { useState } from 'react';
import { updateMedicalTest, createTestResult, createNotification } from '@/integrations/firebase/firestore';
import { notifyDoctorTestUploaded } from '@/integrations/firebase/email';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  TestTube, Calendar, Clock, Upload, CheckCircle2,
  Loader2, FileText, Bell, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { toDate } from '@/integrations/firebase/firestore';

interface MedicalTest {
  id: string;
  testName: string;
  testType: string;
  department: string;
  scheduledDate: any;
  scheduledTime: string;
  priority: string;
  status: string;
  notes: string;
  createdAt: any;
  doctorId?: string;
}

interface PatientTestsProps {
  tests: MedicalTest[];
  doctorEmail: string;
  patientName: string;
  patientId: string;
  onTestUploaded: (testId: string) => void;
}

const priorityColors: Record<string, string> = {
  emergency: 'bg-red-100 text-red-700 border-red-300',
  urgent:    'bg-orange-100 text-orange-700 border-orange-300',
  normal:    'bg-blue-100 text-blue-700 border-blue-300',
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pending Upload', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  submitted: { label: 'Submitted',      color: 'bg-green-100 text-green-700 border-green-300' },
  reviewed:  { label: 'Reviewed',       color: 'bg-purple-100 text-purple-700 border-purple-300' },
  completed: { label: 'Completed',      color: 'bg-gray-100 text-gray-600 border-gray-300' },
};

export default function PatientTests({ tests, doctorEmail, patientName, patientId, onTestUploaded }: PatientTestsProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [uploadedPreviews, setUploadedPreviews] = useState<Record<string, string>>({});

  const pendingCount = tests.filter((t) => t.status === 'pending').length;

  const handleFileSelect = (testId: string, file: File | null) => {
    setSelectedFiles((prev) => ({ ...prev, [testId]: file }));
  };

  const handleUpload = async (test: MedicalTest) => {
    const file = selectedFiles[test.id];
    if (!file) {
      toast({ title: 'No file selected', description: 'Please choose a file to upload.', variant: 'destructive' });
      return;
    }

    if (file.size > 900 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please use a file under 900 KB. Firebase Storage (for larger files) requires the Blaze plan.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(test.id);
    try {
      const fileUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      if (file.type.startsWith('image/')) {
        setUploadedPreviews((p) => ({ ...p, [test.id]: fileUrl }));
      }

      await createTestResult({
        testId: test.id,
        patientId,
        resultFileUrl: fileUrl,
        aiAnalysis: null,
        aiRemarks: null,
        doctorRemarks: null,
        doctorAdvice: null,
        anomaliesDetected: null,
      });

      await updateMedicalTest(test.id, { status: 'submitted' });
      notifyDoctorTestUploaded(doctorEmail, patientName, test.testName, test.testType, test.department, test.priority);

      if (test.doctorId) {
        await createNotification(test.doctorId, {
          title: 'Test Result Uploaded',
          message: `${patientName} uploaded results for "${test.testName}"`,
          type: 'test_uploaded',
        });
      }

      toast({
        title: '✅ Result submitted!',
        description: 'Your test result has been uploaded and the doctor has been notified.',
      });

      setSelectedFiles((prev) => ({ ...prev, [test.id]: null }));
      onTestUploaded(test.id);
    } catch (err: any) {
      console.error('Upload error:', err);
      toast({ title: 'Upload failed', description: err.message || 'Something went wrong.', variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  if (tests.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-10 text-center">
        <TestTube className="w-10 h-10 mx-auto mb-3 text-slate-300" />
        <p className="font-medium text-slate-700">No tests assigned yet.</p>
        <p className="text-sm mt-1 text-slate-500">Tests ordered by your doctor will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">
            You have <strong>{pendingCount}</strong> pending test{pendingCount > 1 ? 's' : ''} waiting for result upload.
          </p>
        </div>
      )}

      {tests.map((test) => {
        const isOpen = expanded === test.id;
        const st = statusConfig[test.status] ?? statusConfig.pending;
        const pc = priorityColors[test.priority] ?? priorityColors.normal;
        const file = selectedFiles[test.id];
        const isUploading = uploading === test.id;
        const preview = uploadedPreviews[test.id];

        return (
          <Card key={test.id} className="overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow rounded-2xl">
            <button type="button" className="w-full text-left" onClick={() => setExpanded(isOpen ? null : test.id)}>
              <CardHeader className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-cyan-50 flex items-center justify-center shrink-0 border border-cyan-100">
                      <TestTube className="w-5 h-5 text-cyan-600" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base leading-snug text-slate-800 line-clamp-2">{test.testName}</CardTitle>
                      <p className="text-xs text-slate-500 mt-1">{test.department}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <span className={`text-[10px] px-2 py-1 rounded-full border font-medium ${pc}`}>{test.priority}</span>
                    <span className={`text-[10px] px-2 py-1 rounded-full border font-medium ${st.color}`}>{st.label}</span>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  </div>
                </div>
              </CardHeader>
            </button>

            {isOpen && (
              <CardContent className="px-5 pb-5 pt-0 space-y-4 border-t border-slate-200">
                <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                  {test.scheduledDate && (
                    <div className="flex items-center gap-2 text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <Calendar className="w-4 h-4 text-cyan-600" />
                      {format(toDate(test.scheduledDate), 'PPP')}
                    </div>
                  )}
                  {test.scheduledTime && (
                    <div className="flex items-center gap-2 text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <Clock className="w-4 h-4 text-cyan-600" />
                      {format(new Date(`2000-01-01T${test.scheduledTime}`), 'h:mm a')}
                    </div>
                  )}
                  {test.testType && (
                    <div className="flex items-center gap-2 text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 col-span-2">
                      <FileText className="w-4 h-4 text-cyan-600" />
                      {test.testType}
                    </div>
                  )}
                </div>

                {test.notes && (
                  <div className="text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-600">
                    <span className="font-medium text-slate-800">Doctor's notes: </span>{test.notes}
                  </div>
                )}

                {test.status === 'pending' && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-800">Upload Your Test Result</p>
                    <label className={`flex flex-col items-center justify-center gap-2 w-full rounded-2xl border-2 border-dashed cursor-pointer transition-all ${file ? 'border-cyan-400 bg-cyan-50 py-4' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 py-8'}`}>
                      <input type="file" className="hidden" accept="image/*,.pdf,.doc,.docx" onChange={(e) => handleFileSelect(test.id, e.target.files?.[0] ?? null)} />
                      {file ? (
                        <>
                          <CheckCircle2 className="w-7 h-7 text-cyan-600" />
                          <span className="text-sm font-semibold text-cyan-700 max-w-[260px] truncate">{file.name}</span>
                          <span className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB · click to change</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-7 h-7 text-slate-400" />
                          <span className="text-sm font-medium text-slate-700">Click to select file</span>
                          <span className="text-xs text-slate-500">Supports: Image, PDF, Word (.doc/.docx)</span>
                        </>
                      )}
                    </label>
                    <Button className="w-full gap-2 h-11 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white" onClick={() => handleUpload(test)} disabled={!file || isUploading}>
                      {isUploading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />Submitting & notifying doctor...</>
                      ) : (
                        <><Bell className="w-4 h-4" />Submit Result & Notify Doctor</>
                      )}
                    </Button>
                  </div>
                )}

                {test.status === 'submitted' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      Result submitted — your doctor has been notified and will review it shortly.
                    </div>
                    {preview && (
                      <img src={preview} alt="Uploaded result" className="rounded-xl border border-slate-200 max-h-64 object-contain w-full bg-slate-50" />
                    )}
                  </div>
                )}

                {(test.status === 'reviewed' || test.status === 'completed') && (
                  <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-violet-50 border border-violet-200 text-sm text-violet-800">
                    <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0" />
                    Your doctor has reviewed this result. Check your consultation history for feedback.
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
