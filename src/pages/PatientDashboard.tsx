import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Activity, FileText, Calendar, Clock, TestTube, Stethoscope, LogOut, Bell } from 'lucide-react';
import { format, isToday, isFuture } from 'date-fns';
import PatientTests from '@/components/PatientTests';
import { useAuth } from '@/integrations/firebase/auth-context';
import {
  subscribeMedicalTests,
  getAppointmentsForPatient,
  getConsultationsForPatient,
  getMedicalTestsForPatient,
  toDate,
} from '@/integrations/firebase/firestore';
import { Button } from '@/components/ui/button';
import NotificationBell from '@/components/NotificationBell';

type Tab = 'tests' | 'appointments' | 'history';

const cleanDiagnosisText = (text?: string) => {
  if (!text) return 'No diagnosis summary available.';

  let cleaned = text
    .replace(/###?\s*\d+\.\s*Possible Diagnoses.*$/gim, '')
    .replace(/###?\s*\d+\.\s*Possible Diagnoses \(Ranked by Likelihood\).*$/gim, '')
    .replace(/\*\*?\s*\d+\.\s*Possible Diagnoses.*$/gim, '')
    .replace(/\bPossible Diagnoses.*$/gim, '')
    .replace(/\bRanked by Likelihood\b.*$/gim, '')
    .replace(/\bRanked by likelihood\b.*$/gim, '')
    .replace(/\bPossible diagnosis.*$/gim, '')
    .replace(/\bDiagnosis Summary\b.*$/gim, '')
    .replace(/\bClinical Summary\b.*$/gim, '')
    .replace(/\bAssessment\b.*$/gim, '')
    .replace(/\bRecommendations?\b.*$/gim, '')
    .replace(/\bFollow-up\b.*$/gim, '')
    .replace(/^\s*[-*+]\s*/gm, '')
    .replace(/^\s*\d+[.)]\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/[*_`]/g, '')
    .replace(/^\s*#+\s*/gm, '')
    .replace(/\b(?:headache|dizziness|light sensitivity|sensitivity to light|fatigue|nausea|blurred vision|symptoms)\b\s*(?:\n|,|\.|$)/gi, '')
    .replace(/\n\s*\n+/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();

  cleaned = cleaned
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-•]*/, '').trim())
    .filter((line) => {
      if (!line) return false;
      const lowered = line.toLowerCase();
      return ![
        'possible diagnoses',
        'ranked by likelihood',
        'diagnosis summary',
        'assessment',
        'recommendations',
        'follow-up',
        'symptoms',
        'patient symptoms',
        'overall assessment',
      ].includes(lowered);
    })
    .join('\n');

  return cleaned || 'No diagnosis summary available.';
};

const getDiagnosisPreview = (text?: string) => {
  const cleaned = cleanDiagnosisText(text);
  const plainText = cleaned.replace(/\s+/g, ' ').trim();
  return plainText.length > 90 ? `${plainText.slice(0, 90).trimEnd()}…` : plainText;
};

export default function PatientDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('tests');
  const [tests, setTests] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const patientId = user?.uid ?? '';
  const patientName = user?.displayName ?? 'Patient';
  const doctorEmail = import.meta.env.VITE_DOCTOR_EMAIL as string || '';

  // ── Realtime tests subscription ──────────────────────────────────────────────
  useEffect(() => {
    if (!patientId) return;
    const unsub = subscribeMedicalTests(patientId, (allTests) => {
      // Filter today + future
      const upcoming = allTests.filter((t) => {
        try {
          const d = toDate(t.scheduledDate);
          return isToday(d) || isFuture(d);
        } catch { return true; }
      });
      setTests(upcoming);
    });
    return () => unsub();
  }, [patientId]);

  // ── Appointments + consultation history ──────────────────────────────────────
  useEffect(() => {
    if (!patientId) return;
    (async () => {
      try {
        const [appts, consultations] = await Promise.all([
          getAppointmentsForPatient(patientId),
          getConsultationsForPatient(patientId),
        ]);
        setAppointments(appts);
        // For each consultation, attach medical tests
        const historyWithTests = await Promise.all(
          consultations.map(async (c: any) => {
            const tests = await getMedicalTestsForPatient(patientId);
            // Filter tests belonging to this consultation
            const related = tests.filter((t: any) => t.consultationId === c.id);
            return { ...c, medical_tests: related };
          })
        );
        setHistory(historyWithTests);
      } catch (err) {
        console.error('Error loading patient data:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [patientId]);

  const pendingCount = tests.filter((t) => t.status === 'pending').length;

  const handleTestUploaded = (testId: string) => {
    // Realtime listener will auto-update, but also update locally for instant feedback
    setTests((prev) => prev.map((t) => (t.id === testId ? { ...t, status: 'submitted' } : t)));
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const tabs: { key: Tab; label: string; icon: any; count: number; badge?: number | null }[] = [
    { key: 'tests',        label: 'My Tests',     icon: TestTube, count: tests.length,        badge: pendingCount > 0 ? pendingCount : null },
    { key: 'appointments', label: 'Appointments', icon: Calendar, count: appointments.length  },
    { key: 'history',      label: 'History',      icon: FileText, count: history.length       },
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-cyan-900 to-teal-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          {/* Brand + patient */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 backdrop-blur-sm flex items-center justify-center shadow-sm shrink-0">
              <Activity className="w-5 h-5 text-cyan-200" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/80 leading-none mb-1">Patient Portal</p>
              <p className="text-sm font-semibold text-white leading-none truncate">{patientName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user && <NotificationBell userId={user.uid} />}

            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-white hover:bg-white/10 hover:text-white border border-white/10">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-4xl mx-auto px-5 pb-3">
          <div className="flex gap-2 bg-white/5 border border-white/10 rounded-2xl p-1 backdrop-blur-sm">
            {tabs.map(({ key, label, icon: Icon, count, badge }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`relative flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-xl transition-all ${
                  activeTab === key
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-200 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {count > 0 && (
                  <span className={`text-[11px] rounded-full px-1.5 py-0.5 font-medium ${
                    activeTab === key ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-slate-100'
                  }`}>{count}</span>
                )}
                {badge != null && (
                  <span className="absolute -top-1 -right-1 w-[14px] h-[14px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-4xl mx-auto px-5 py-6 space-y-5">
        {/* MY TESTS */}
        {activeTab === 'tests' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Assigned Tests</h2>
                <p className="text-xs text-slate-500 mt-0.5">Tests scheduled for today and upcoming dates</p>
              </div>
              {pendingCount > 0 && (
                <span className="text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-3 py-1.5">
                  {pendingCount} pending upload
                </span>
              )}
            </div>
            {loading ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm text-center py-12 text-slate-500">Loading your tests...</div>
            ) : (
              <PatientTests
                tests={tests}
                doctorEmail={doctorEmail}
                patientName={patientName}
                patientId={patientId}
                onTestUploaded={handleTestUploaded}
              />
            )}
          </div>
        )}

        {/* APPOINTMENTS */}
        {activeTab === 'appointments' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Upcoming Appointments</h2>
              <p className="text-xs text-slate-500 mt-0.5">Your scheduled visits with the doctor</p>
            </div>
            {appointments.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm text-center py-12 text-slate-500">No appointments scheduled yet.</div>
            ) : (
              <div className="space-y-3">
                {appointments.map((a: any) => (
                  <Card key={a.id} className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-white rounded-2xl overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center shrink-0">
                            <Stethoscope className="w-4 h-4 text-cyan-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-slate-800">{a.department}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{a.reason}</p>
                            <div className="flex gap-3 mt-2 text-xs text-slate-400 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(toDate(a.preferredDate), 'MMM d, yyyy')}
                              </span>
                              {a.preferredTime && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {format(new Date(`2000-01-01T${a.preferredTime}`), 'h:mm a')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant={a.status === 'confirmed' ? 'default' : 'secondary'}
                          className={a.status === 'confirmed' ? 'text-xs shrink-0 bg-emerald-100 text-emerald-700 border border-emerald-200' : 'text-xs shrink-0 bg-slate-100 text-slate-600 border border-slate-200'}
                        >
                          {a.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Consultation History</h2>
              <p className="text-xs text-slate-500 mt-0.5">Past visits and AI diagnoses</p>
            </div>
            {history.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm text-center py-12 text-slate-500">No consultation history yet.</div>
            ) : (
              <Accordion type="multiple" className="space-y-3">
                {history.map((v: any) => (
                  <AccordionItem
                    key={v.id}
                    value={v.id}
                    className="border border-slate-200 rounded-2xl bg-white shadow-sm px-4 overflow-hidden"
                  >
                    <AccordionTrigger className="hover:no-underline py-4 gap-3">
                      <div className="flex flex-col items-start text-left gap-1 flex-1">
                        <span className="text-[11px] text-slate-400">
                          {format(toDate(v.createdAt), 'EEEE, MMM d yyyy · h:mm a')}
                        </span>
                        <span className="text-sm font-semibold text-slate-800 leading-snug">
                          {getDiagnosisPreview(v.diagnosis)}
                        </span>
                        <div className="flex gap-1.5 flex-wrap mt-0.5">
                          {(v.symptoms || []).slice(0, 3).map((s: string) => (
                            <span key={s} className="text-[10px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{s}</span>
                          ))}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pb-4">
                      <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-cyan-600 uppercase tracking-wider mb-1">AI Diagnosis</p>
                        <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{cleanDiagnosisText(v.diagnosis)}</p>
                      </div>
                      {v.medical_tests?.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ordered Tests</p>
                          {v.medical_tests.map((m: any) => (
                            <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                              <div className="flex items-center gap-2 min-w-0">
                                <TestTube className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                                <span className="text-xs font-medium text-slate-700 truncate">{m.testName}</span>
                                <span className="text-[10px] text-slate-400">· {m.department}</span>
                              </div>
                              <Badge
                                variant={m.status === 'submitted' ? 'default' : 'secondary'}
                                className="text-[10px] px-2"
                              >
                                {m.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
