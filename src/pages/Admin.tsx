import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, LogOut, Users, FileText, TestTube, Clock, CheckCircle, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/integrations/firebase/auth-context';
import { getAdminStats } from '@/integrations/firebase/firestore';

interface Stats {
  total_consultations: number;
  today_consultations: number;
  total_tests: number;
  pending_tests: number;
  completed_tests: number;
  total_patients: number;
}

export default function Admin() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const data = await getAdminStats();
        setStats(data);
      } catch (error: any) {
        toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p>{t('common.loading')}</p></div>;
  }

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">{t('admin.unauthorized')}</p>
            <Button onClick={() => navigate('/dashboard')} className="w-full mt-4">Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm min-w-0">
            <button onClick={() => navigate('/dashboard')} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">Dashboard</button>
            <span className="text-muted-foreground/40">›</span>
            <span className="font-semibold text-foreground">Admin Panel</span>
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors border border-border rounded-lg px-3 py-1.5 hover:bg-accent"
            >
              <ArrowLeft className="w-4 h-4" />Back
            </button>
            <LanguageSwitcher />
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />{t('common.signOut')}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="space-y-8">
          {/* Stats */}
          <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: t('admin.stats.totalConsultations'), value: stats?.total_consultations, icon: FileText },
              { label: t('admin.stats.todayConsultations'), value: stats?.today_consultations, icon: Activity },
              { label: t('admin.stats.totalTests'), value: stats?.total_tests, icon: TestTube },
              { label: t('admin.stats.pendingTests'), value: stats?.pending_tests, icon: Clock },
              { label: t('admin.stats.completedTests'), value: stats?.completed_tests, icon: CheckCircle },
              { label: t('admin.stats.totalPatients'), value: stats?.total_patients, icon: Users },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label} className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{label}</CardTitle>
                  <Icon className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent><div className="text-2xl font-bold">{value || 0}</div></CardContent>
              </Card>
            ))}
          </div>

          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="shadow-card">
              <CardHeader><CardTitle>{t('admin.charts.testStatus')}</CardTitle></CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    pending: { label: t('admin.stats.pendingTests'), color: 'hsl(var(--chart-1))' },
                    completed: { label: t('admin.stats.completedTests'), color: 'hsl(var(--chart-2))' },
                  }}
                  className="h-[300px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: t('admin.stats.pendingTests'), value: stats?.pending_tests || 0 },
                          { name: t('admin.stats.completedTests'), value: stats?.completed_tests || 0 },
                        ]}
                        cx="50%" cy="50%" outerRadius={80} dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        <Cell fill="hsl(var(--chart-1))" />
                        <Cell fill="hsl(var(--chart-2))" />
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader><CardTitle>{t('admin.charts.overview')}</CardTitle></CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    consultations: { label: t('admin.stats.totalConsultations'), color: 'hsl(var(--chart-3))' },
                    tests: { label: t('admin.stats.totalTests'), color: 'hsl(var(--chart-4))' },
                    patients: { label: t('admin.stats.totalPatients'), color: 'hsl(var(--chart-5))' },
                  }}
                  className="h-[300px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'Consultations', value: stats?.total_consultations || 0 },
                      { name: 'Tests', value: stats?.total_tests || 0 },
                      { name: 'Patients', value: stats?.total_patients || 0 },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="value" fill="hsl(var(--chart-3))" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

        </div>
      </main>
    </div>
  );
}
