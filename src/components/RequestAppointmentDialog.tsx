import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarPlus } from 'lucide-react';
import { useAuth } from '@/integrations/firebase/auth-context';
import { createAppointment } from '@/integrations/firebase/firestore';
import { useToast } from '@/hooks/use-toast';

const departments = ['General Medicine', 'Cardiology', 'Orthopaedics', 'Pulmonology', 'Endocrinology', 'Pediatrics'];

export default function RequestAppointmentDialog({ patientName, onCreated }: { patientName: string; onCreated: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ department: 'General Medicine', date: '', time: '', reason: '' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await createAppointment({
        patientId: user.patientId ?? user.uid,
        patientName,
        patientEmail: user.email ?? '',
        department: form.department,
        preferredDate: form.date,
        preferredTime: form.time,
        reason: form.reason.trim(),
        status: 'requested',
      });
      toast({ title: 'Request sent', description: 'The doctor will confirm your appointment.' });
      setForm({ department: 'General Medicine', date: '', time: '', reason: '' });
      setOpen(false);
      onCreated();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Failed to send request.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><CalendarPlus className="w-4 h-4 mr-2" />Request Appointment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request an appointment</DialogTitle>
          <DialogDescription>Choose a department and your preferred time.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Department</Label>
            <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Preferred date</Label>
              <Input type="date" required min={new Date().toISOString().slice(0, 10)} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Preferred time</Label>
              <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Reason for visit</Label>
            <Textarea required maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Describe your symptoms..." />
          </div>
          <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Sending...' : 'Send Request'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
