import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import botLogo from '@/assets/boteye-health-bot.png';
import { useAuth, roleRoute, UserRole } from '@/integrations/firebase/auth-context';

const DEMO_USERS: { email: string; password: string; role: UserRole; displayName: string }[] = [
  { email: 'admin@example.com',   password: 'admin123', role: 'admin',   displayName: 'Demo Admin' },
  { email: 'doctor@example.com',  password: 'admin123', role: 'doctor',  displayName: 'Demo Doctor' },
  { email: 'patient@example.com', password: 'admin123', role: 'patient', displayName: 'Demo Patient' },
  { email: 'labs@example.com',    password: 'admin123', role: 'labs',    displayName: 'Demo Labs' },
];

const Index = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user, loading: authLoading, signIn, createUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [settingUpDemo, setSettingUpDemo] = useState(false);

  // Redirect already-authenticated users
  useEffect(() => {
    if (!authLoading && user) {
      navigate(roleRoute(user.role));
    }
  }, [user, authLoading, navigate]);

  const handleSetupDemo = async () => {
    setSettingUpDemo(true);
    let created = 0;
    let skipped = 0;
    for (const u of DEMO_USERS) {
      try {
        await createUser(u.email, u.password, u.role, u.displayName);
        created++;
      } catch (err: any) {
        // Firebase throws auth/email-already-in-use if the account exists
        if (err?.code === 'auth/email-already-in-use') {
          skipped++;
        } else {
          console.warn(`Could not create ${u.email}:`, err?.message);
        }
      }
    }
    setSettingUpDemo(false);
    toast({
      title: 'Demo users ready',
      description: `${created} created, ${skipped} already existed.\nLogin: doctor@example.com / admin123`,
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      // onAuthStateChanged fires → useEffect above handles redirect
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <img
              src={botLogo}
              alt="Health-AI Agent"
              className="w-32 h-32 object-contain"
            />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Health-AI Agent
          </h1>
          <p className="text-muted-foreground">{t('auth.subtitle')}</p>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>{t('auth.signIn')}</CardTitle>
            <CardDescription>{t('auth.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleSetupDemo}
              variant="outline"
              className="w-full"
              disabled={settingUpDemo}
            >
              {settingUpDemo ? t('common.loading') : 'Setup Demo Users'}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('common.loading') : t('auth.signIn')}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground">
          <p>{t('auth.demoCredentials')}</p>
          <p className="font-mono mt-2">Click "Setup Demo Users" button above</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
