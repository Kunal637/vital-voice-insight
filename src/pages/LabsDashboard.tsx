import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Activity, LogOut, TestTube, Clock, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/integrations/firebase/auth-context';
import { subscribeAllMedicalTests, updateMedicalTest, createTestResult } from '@/integrations/firebase/firestore';
import { toDate } from '@/integrations/firebase/firestore';

export default function LabsDashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingTest, setProcessingTest] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{ [key: string]: string }>({});

  // Realtime subscription to all tests
  useEffect(() => {
    const unsub = subscribeAllMedicalTests((allTests) => {
      setTests(allTests);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleCompleteTest = async (testId: string, patientId: string) => {
    if (!testResults[testId]) {
      toast({ title: t('common.error'), description: t('labs.enterResults'), variant: 'destructive' });
      return;
    }

    setProcessingTest(testId);
    try {
      await updateMedicalTest(testId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });

      await createTestResult({
        testId,
        patientId,
        aiAnalysis: testResults[testId],
        resultFileUrl: null,
      });

      toast({ title: t('common.success'), description: t('labs.testCompleted') });

      setTestResults((prev) => {
        const next = { ...prev };
        delete next[testId];
        return next;
      });
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setProcessingTest(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  const pendingTests = tests.filter((t) => t.status === 'pending');
  const completedTests = tests.filter((t) => t.status === 'completed');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card shadow-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center shadow-medical">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold">{t('labs.title')}</h1>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              {t('common.signOut')}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="space-y-8">
          {/* Pending Tests */}
          <div>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Clock className="w-6 h-6 text-primary" />
              {t('labs.upcomingTests')} ({pendingTests.length})
            </h2>
            <div className="grid gap-4">
              {pendingTests.length === 0 ? (
                <Card><CardContent className="pt-6"><p className="text-muted-foreground text-center">{t('labs.noPendingTests')}</p></CardContent></Card>
              ) : (
                pendingTests.map((test) => (
                  <Card key={test.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle>{test.testName}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {test.patientName} {test.patientEmail ? `(${test.patientEmail})` : ''}
                          </p>
                        </div>
                        <Badge variant={test.priority === 'urgent' ? 'destructive' : 'secondary'}>
                          {test.priority}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><p className="font-semibold">{t('labs.testType')}:</p><p className="text-muted-foreground">{test.testType}</p></div>
                        <div><p className="font-semibold">{t('labs.department')}:</p><p className="text-muted-foreground">{test.department}</p></div>
                        <div>
                          <p className="font-semibold">{t('labs.scheduledDate')}:</p>
                          <p className="text-muted-foreground">
                            {test.scheduledDate ? toDate(test.scheduledDate).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                        <div><p className="font-semibold">{t('labs.scheduledTime')}:</p><p className="text-muted-foreground">{test.scheduledTime || 'N/A'}</p></div>
                      </div>
                      {test.notes && (
                        <div><p className="font-semibold text-sm">{t('labs.notes')}:</p><p className="text-sm text-muted-foreground">{test.notes}</p></div>
                      )}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold">{t('labs.enterResults')}:</label>
                        <Textarea
                          placeholder={t('labs.resultsPlaceholder')}
                          value={testResults[test.id] || ''}
                          onChange={(e) => setTestResults({ ...testResults, [test.id]: e.target.value })}
                        />
                      </div>
                      <Button
                        onClick={() => handleCompleteTest(test.id, test.patientId)}
                        disabled={processingTest === test.id}
                        className="w-full"
                      >
                        {processingTest === test.id ? t('common.loading') : t('labs.markComplete')}
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Completed Tests */}
          <div>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-green-500" />
              {t('labs.completedTests')} ({completedTests.length})
            </h2>
            <div className="grid gap-4">
              {completedTests.length === 0 ? (
                <Card><CardContent className="pt-6"><p className="text-muted-foreground text-center">{t('labs.noCompletedTests')}</p></CardContent></Card>
              ) : (
                completedTests.map((test) => (
                  <Card key={test.id}>
                    <CardHeader>
                      <CardTitle>{test.testName}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {test.patientName} {test.patientEmail ? `(${test.patientEmail})` : ''}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {t('labs.completedOn')}: {test.completedAt ? new Date(test.completedAt).toLocaleString() : 'N/A'}
                      </p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
