import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Play, Check } from 'lucide-react';
import { getActiveAppointments, updateAppointmentStatus, toDate } from '@/integrations/firebase/firestore';

export default function DoctorAppointments() {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await getActiveAppointments();
      setItems(data);
    } catch (err) {
      console.error('Error loading appointments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const confirm = async (id: string) => {
    await updateAppointmentStatus(id, 'confirmed');
    load();
  };

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-primary" />
          Appointment Schedule
        </CardTitle>
        <CardDescription>Upcoming patient appointments. Start a consultation directly from here.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
        ) : (
          <div className="divide-y divide-border">
            {items.map((a) => (
              <div key={a.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{a.patientName}</p>
                  <p className="text-sm text-muted-foreground">
                    {toDate(a.preferredDate).toLocaleDateString()} {a.preferredTime || ''} · {a.department}
                  </p>
                  <p className="text-sm text-muted-foreground truncate max-w-md">{a.reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={a.status === 'requested' ? 'secondary' : 'default'}
                    className="capitalize"
                  >
                    {a.status.replace('_', ' ')}
                  </Badge>
                  {a.status === 'requested' && (
                    <Button size="sm" variant="outline" onClick={() => confirm(a.id)}>
                      <Check className="w-4 h-4 mr-1" />Confirm
                    </Button>
                  )}
                  <Button size="sm" onClick={() => navigate(`/dashboard/consultation?appointment=${a.id}&patientId=${a.patientId}`)}>
                    <Play className="w-4 h-4 mr-1" />Start Consultation
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
