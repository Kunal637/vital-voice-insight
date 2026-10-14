import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, FileText, LogOut, Shield, TestTube, Users } from 'lucide-react';
import TestResultsTable from '@/components/TestResultsTable';
import PatientListPanel from '@/components/PatientListPanel';
import { useToast } from '@/hooks/use-toast';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import DoctorAppointments from '@/components/DoctorAppointments';
import { useAuth } from '@/integrations/firebase/auth-context';
import { subscribeTestResults, getPatient, getAllMedicalTests } from '@/integrations/firebase/firestore';
import NotificationBell from '@/components/NotificationBell';

type Tab = 'overview' | 'patients' | 'results';

export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [testResults, setTestResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [submittedCount, setSubmittedCount] = useState(0);
  const { toast } = useToast();

  const isAdmin = user?.role === 'admin';

  // Subscribe to test results in realtime and join with patient/test data
  useEffect(() => {
    const unsub = subscribeTestResults(async (results) => {
      try {
        // Fetch all tests so we can join
        const allTests = await getAllMedicalTests();
        const testsMap = Object.fromEntries(allTests.map((t: any) => [t.id, t]));

        // Build enriched results
        const enriched = await Promise.all(
          results.map(async (r: any) => {
            const test = testsMap[r.testId];
            let patientName = test?.patientName;
            let patientEmail = test?.patientEmail;

            // Fallback: look up patient doc if not denormalized
            if (!patientName && test?.patientId) {
              const patient: any = await getPatient(test.patientId);
              patientName = patient?.fullName;
              patientEmail = patient?.email;
            }

            return {
              ...r,
              testName: test?.testName,
              testType: test?.testType,
              patientName,
              patientEmail,
            };
          })
        );
        setTestResults(enriched);
        setSubmittedCount(enriched.filter((r: any) => !r.doctorRemarks).length);
      } catch (err) {
        console.error('Error loading test results:', err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
    toast({ title: t('common.success'), description: 'You have been successfully signed out' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card shadow-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center shadow-medical">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">AI Health Assistant</h1>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            {user && <NotificationBell userId={user.uid} />}
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              {t('common.signOut')}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6 flex gap-0 border-t border-border">
          {([
            { key: 'overview' as Tab, label: 'Overview',     icon: Activity,  badge: null },
            { key: 'patients' as Tab, label: 'Patients',     icon: Users,     badge: submittedCount > 0 ? submittedCount : null },
            { key: 'results'  as Tab, label: 'Test Results', icon: TestTube,  badge: null },
          ] as { key: Tab; label: string; icon: any; badge: number | null }[]).map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {badge != null && (
                <span className="ml-0.5 bg-green-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <>
            {isAdmin && (
              <Card className="bg-gradient-card border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Shield className="w-8 h-8 text-primary" />
                      <div>
                        <h3 className="text-lg font-bold">Admin Panel</h3>
                        <p className="text-sm text-muted-foreground">View hospital statistics and manage system</p>
                      </div>
                    </div>
                    <Button onClick={() => navigate('/admin')}>{t('dashboard.admin.button')}</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <DoctorAppointments />

            <div className="grid md:grid-cols-2 gap-6">
              <Card
                className="shadow-card hover:shadow-medical transition-shadow cursor-pointer group"
                onClick={() => navigate('/dashboard/consultation')}
              >
                <CardHeader>
                  <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Activity className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle>{t('dashboard.consultation.title')}</CardTitle>
                  <CardDescription>{t('dashboard.consultation.description')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2"><span className="text-primary">•</span>{t('dashboard.consultation.features.voice')}</li>
                    <li className="flex items-start gap-2"><span className="text-primary">•</span>{t('dashboard.consultation.features.analysis')}</li>
                    <li className="flex items-start gap-2"><span className="text-primary">•</span>{t('dashboard.consultation.features.tests')}</li>
                  </ul>
                  <Button className="w-full mt-4">{t('dashboard.consultation.button')}</Button>
                </CardContent>
              </Card>

              {/* Quick jump to patients with pending results */}
              <Card
                className="shadow-card hover:shadow-medical transition-shadow cursor-pointer group"
                onClick={() => setActiveTab('patients')}
              >
                <CardHeader>
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-500 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle>Patient List</CardTitle>
                  <CardDescription>Review submitted test results and patient history</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2"><span className="text-green-500">•</span>See all submitted test results</li>
                    <li className="flex items-start gap-2"><span className="text-green-500">•</span>View consultation history per patient</li>
                    <li className="flex items-start gap-2"><span className="text-green-500">•</span>Start new consultations directly</li>
                  </ul>
                  <Button className="w-full mt-4 bg-green-600 hover:bg-green-700">
                    {submittedCount > 0 ? `Review ${submittedCount} Pending Result${submittedCount > 1 ? 's' : ''}` : 'View Patients'}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  {t('dashboard.about.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{t('dashboard.about.description')}</p>
                <ul className="space-y-1 ml-4">
                  <li>• Transcribe patient consultations in real-time</li>
                  <li>• Provide intelligent diagnosis suggestions based on symptoms</li>
                  <li>• Recommend appropriate medical tests</li>
                  <li>• Analyze medical imaging for anomalies</li>
                  <li>• Generate comprehensive reports</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  <strong>Important:</strong> {t('dashboard.about.disclaimer')}
                </p>
              </CardContent>
            </Card>
          </>
        )}

        {/* ── PATIENTS ── */}
        {activeTab === 'patients' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Users className="w-6 h-6 text-primary" />
                Patient List
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                Patients with submitted results appear at the top. Click any patient to expand their history.
              </p>
            </div>
            <PatientListPanel />
          </div>
        )}

        {/* ── TEST RESULTS ── */}
        {activeTab === 'results' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <TestTube className="w-6 h-6 text-accent" />
              Medical Test Analysis
            </h2>
            <TestResultsTable testResults={testResults} />
          </div>
        )}

      </main>
    </div>
  );
}
