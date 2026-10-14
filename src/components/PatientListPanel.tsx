/**
 * PatientListPanel — Doctor view
 * Shows every patient with their submitted test results and consultation history.
 * Uses simple queries (no composite indexes needed) and sorts in JS.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, getDocs, where } from 'firebase/firestore';
import { db } from '@/integrations/firebase/config';
import { toDate } from '@/integrations/firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Users, TestTube, FileText, Search, Calendar,
  CheckCircle2, AlertCircle, Eye, Play, Clock, ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Patient   { id: string; fullName: string; email: string; phone?: string; createdAt?: any }
interface MedTest   { id: string; testName: string; testType: string; department: string; scheduledDate: any; scheduledTime?: string; priority: string; status: string; notes?: string; createdAt: any }
interface TestRes   { id: string; testId: string; resultFileUrl?: string; aiAnalysis?: string; doctorRemarks?: string; createdAt: any }
interface Consult   { id: string; diagnosis: string; symptoms: string[]; aiConfidence?: number; createdAt: any }
interface PatientData extends Patient {
  tests: MedTest[]; results: TestRes[]; consultations: Consult[];
  pendingCount: number; submittedCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const priorityColor: Record<string, string> = {
  emergency: 'bg-red-100 text-red-700 border-red-200',
  urgent:    'bg-orange-100 text-orange-700 border-orange-200',
  normal:    'bg-blue-100 text-blue-700 border-blue-200',
};
const statusColor: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-700',
  submitted: 'bg-green-100 text-green-700',
  reviewed:  'bg-purple-100 text-purple-700',
  completed: 'bg-gray-100 text-gray-500',
};

// Strip markdown bold/italic syntax for clean display
const stripMd = (text: string) =>
  text.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1').replace(/_{1,2}([^_]+)_{1,2}/g, '$1').trim();

export default function PatientListPanel() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<PatientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const buildPatientData = async (patientDocs: Patient[]): Promise<PatientData[]> => {
    return Promise.all(patientDocs.map(async (pd) => {
      try {
        const pid = pd.id;
        // Simple where-only queries — no composite index needed
        const [testsSnap, resultsSnap, consultSnap] = await Promise.all([
          getDocs(query(collection(db, 'medical_tests'), where('patientId', '==', pid))),
          getDocs(query(collection(db, 'test_results'),  where('patientId', '==', pid))),
          getDocs(query(collection(db, 'consultations'), where('patientId', '==', pid))),
        ]);

        // Sort in JS (no Firestore index required)
        const tests: MedTest[] = testsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as MedTest))
          .sort((a, b) => toDate(a.scheduledDate).getTime() - toDate(b.scheduledDate).getTime());

        const results: TestRes[] = resultsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as TestRes))
          .sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());

        const consultations: Consult[] = consultSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Consult))
          .sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());

        return {
          ...pd,
          tests,
          results,
          consultations,
          pendingCount:   tests.filter((t) => t.status === 'pending').length,
          submittedCount: tests.filter((t) => t.status === 'submitted').length,
        };
      } catch (err) {
        console.error('Error loading data for patient', pd.id, err);
        return { ...pd, tests: [], results: [], consultations: [], pendingCount: 0, submittedCount: 0 };
      }
    }));
  };

  useEffect(() => {
    let patientDocs: Patient[] = [];

    // Initial load
    getDocs(collection(db, 'patients'))
      .then(async (snap) => {
        patientDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Patient));
        const data = await buildPatientData(patientDocs);
        setPatients(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load patients:', err);
        setError(err.message ?? 'Failed to load patients');
        setLoading(false);
      });

    // Realtime refresh when any test_result changes
    const unsub = onSnapshot(
      query(collection(db, 'test_results')),
      async () => {
        if (!patientDocs.length) return;
        const data = await buildPatientData(patientDocs);
        setPatients(data);
      },
      (err) => console.error('test_results snapshot error:', err)
    );

    return () => unsub();
  }, []);

  const filtered = patients
    .filter((p) => {
      const s = search.toLowerCase();
      return !s || p.fullName?.toLowerCase().includes(s) || p.email?.toLowerCase().includes(s);
    })
    .sort((a, b) => b.submittedCount - a.submittedCount); // patients with pending results first

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
      <div className="w-10 h-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
      <p className="text-sm">Loading patients…</p>
    </div>
  );

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="py-10 text-center">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-destructive" />
        <p className="font-semibold text-destructive">Failed to load patients</p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      {/* Search + summary bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative w-72">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search patients…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="w-4 h-4" /> {patients.length} patients
          </span>
          {patients.reduce((s, p) => s + p.submittedCount, 0) > 0 && (
            <span className="flex items-center gap-1.5 font-semibold text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
              <CheckCircle2 className="w-4 h-4" />
              {patients.reduce((s, p) => s + p.submittedCount, 0)} awaiting review
            </span>
          )}
        </div>
      </div>

      {/* Patient list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>{search ? 'No patients match your search.' : 'No patients registered yet.'}</p>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-3">
          {filtered.map((patient) => (
            <AccordionItem
              key={patient.id}
              value={patient.id}
              className={`border rounded-xl bg-card shadow-sm overflow-hidden transition-shadow hover:shadow-md ${
                patient.submittedCount > 0 ? 'border-green-300' : 'border-border'
              }`}
            >
              {/* ── Patient row header ── */}
              <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-accent/20 [&>svg]:shrink-0">
                <div className="flex items-center gap-4 flex-1 min-w-0 mr-3">
                  {/* Avatar */}
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                    patient.submittedCount > 0
                      ? 'bg-gradient-to-br from-green-400 to-emerald-600'
                      : 'bg-gradient-to-br from-cyan-400 to-teal-600'
                  }`}>
                    {patient.fullName?.charAt(0)?.toUpperCase() ?? '?'}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{patient.fullName}</span>
                      {patient.submittedCount > 0 && (
                        <span className="text-[10px] font-semibold bg-green-500 text-white rounded-full px-2 py-0.5">
                          {patient.submittedCount} result{patient.submittedCount > 1 ? 's' : ''} to review
                        </span>
                      )}
                      {patient.pendingCount > 0 && (
                        <span className="text-[10px] font-medium border border-yellow-300 text-yellow-600 rounded-full px-2 py-0.5">
                          {patient.pendingCount} pending upload
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{patient.email}</p>
                  </div>

                  <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                    <span className="flex items-center gap-1"><TestTube className="w-3.5 h-3.5" />{patient.tests.length} tests</span>
                    <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{patient.consultations.length} visits</span>
                  </div>
                </div>
              </AccordionTrigger>

              {/* ── Expanded content ── */}
              <AccordionContent className="border-t border-border bg-gray-50/50">
                <div className="px-5 py-5 space-y-6">

                  {/* Action */}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => navigate(`/dashboard/consultation?patientId=${patient.id}`)} className="gap-1.5">
                      <Play className="w-3.5 h-3.5" />New Consultation
                    </Button>
                  </div>

                  {/* ── Submitted Results ── */}
                  {patient.results.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />Submitted Results ({patient.results.length})
                      </h4>
                      <div className="space-y-2">
                        {patient.results.map((result) => {
                          const test = patient.tests.find((t) => t.id === result.testId);
                          const reviewed = !!result.doctorRemarks;
                          return (
                            <div key={result.id} className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${
                              reviewed ? 'border-purple-200 bg-purple-50' : 'border-green-200 bg-green-50'
                            }`}>
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                  reviewed ? 'bg-purple-100' : 'bg-green-100'
                                }`}>
                                  <TestTube className={`w-4 h-4 ${reviewed ? 'text-purple-600' : 'text-green-600'}`} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold truncate">{test?.testName ?? 'Test Result'}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {format(toDate(result.createdAt), 'MMM d, yyyy · h:mm a')}
                                    {test?.department ? ` · ${test.department}` : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${reviewed ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                                  {reviewed ? 'Reviewed' : 'New'}
                                </span>
                                <Button
                                  size="sm"
                                  variant={reviewed ? 'outline' : 'default'}
                                  className="gap-1 h-8 text-xs"
                                  onClick={() => navigate(`/test-result/${result.id}`)}
                                >
                                  <Eye className="w-3 h-3" />{reviewed ? 'View' : 'Review'}
                                  <ChevronRight className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Assigned Tests ── */}
                  {patient.tests.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <TestTube className="w-3.5 h-3.5 text-primary" />Assigned Tests ({patient.tests.length})
                      </h4>
                      <div className="space-y-1.5">
                        {patient.tests.map((test) => (
                          <div key={test.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border bg-white">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${priorityColor[test.priority] ?? priorityColor.normal}`}>
                                {test.priority}
                              </span>
                              <p className="text-sm font-medium truncate">{test.testName}</p>
                              <span className="text-xs text-muted-foreground hidden sm:inline shrink-0">· {test.department}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {test.scheduledDate && (
                                <span className="text-xs text-muted-foreground hidden md:flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />{format(toDate(test.scheduledDate), 'MMM d')}
                                </span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[test.status] ?? statusColor.pending}`}>
                                {test.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Consultation History ── */}
                  {patient.consultations.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-secondary" />Consultation History ({patient.consultations.length})
                      </h4>
                      <div className="space-y-2">
                        {patient.consultations.map((c) => (
                          <div key={c.id} className="px-4 py-3 rounded-xl border border-border bg-white space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />{format(toDate(c.createdAt), 'MMM d, yyyy · h:mm a')}
                              </span>
                              {c.aiConfidence != null && (
                                <span className="text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                                  {c.aiConfidence}% confidence
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-700 leading-snug line-clamp-2">
                              {stripMd(c.diagnosis ?? '').slice(0, 180)}{stripMd(c.diagnosis ?? '').length > 180 ? '…' : ''}
                            </p>
                            {c.symptoms?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {c.symptoms.map((s) => (
                                  <span key={s} className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{s}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {patient.tests.length === 0 && patient.consultations.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <AlertCircle className="w-6 h-6 mx-auto mb-1 opacity-30" />
                      No tests or consultations yet for this patient.
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
