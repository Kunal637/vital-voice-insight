import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Clock, FlaskConical, Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/integrations/firebase/auth-context';
import { createMedicalTest, createNotification, getPatient } from '@/integrations/firebase/firestore';
import { notifyPatientTestScheduled } from '@/integrations/firebase/email';

interface TestScheduleDialogProps {
  consultationId: string;
  patientId: string;
  recommendedTest?: string;
  selectedTests?: string[];
}

const priorityConfig = {
  normal:    { label: 'Normal',    color: 'bg-blue-100 text-blue-700 border-blue-200' },
  urgent:    { label: 'Urgent',    color: 'bg-orange-100 text-orange-700 border-orange-200' },
  emergency: { label: 'Emergency', color: 'bg-red-100 text-red-700 border-red-200' },
};

export default function TestScheduleDialog({
  consultationId,
  patientId,
  recommendedTest,
  selectedTests = [],
}: TestScheduleDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(true);

  const [formData, setFormData] = useState({
    testType: '',
    department: '',
    scheduledTime: '',
    priority: 'normal',
    notes: '',
  });

  const handleOpen = (val: boolean) => {
    if (val) {
      setDate(undefined);
      setFormData({ testType: '', department: '', scheduledTime: '', priority: 'normal', notes: '' });
    }
    setOpen(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      toast({ title: 'Date required', description: 'Please select a date for the test.', variant: 'destructive' });
      return;
    }
    if (!user) {
      toast({ title: 'Not authenticated', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const testName = selectedTests.length > 0 ? selectedTests.join(', ') : (recommendedTest || 'General Test');

      // Get patient info for notification
      const patient: any = await getPatient(patientId);

      await createMedicalTest({
        consultationId,
        patientId,
        patientEmail: patient?.email ?? '',
        patientName: patient?.fullName ?? '',
        doctorId: user.uid,
        testName,
        testType: formData.testType || 'other',
        department: formData.department || 'lab',
        scheduledDate: date.toISOString(),
        scheduledTime: formData.scheduledTime,
        priority: formData.priority,
        notes: formData.notes,
        status: 'pending',
      });

      const formattedDate = format(date, 'EEEE, MMMM d, yyyy');
      const formattedTime = formData.scheduledTime
        ? format(new Date(`2000-01-01T${formData.scheduledTime}`), 'h:mm a')
        : '';

      // Email patient
      if (patient?.email) {
        notifyPatientTestScheduled(
          patient.email,
          patient.fullName,
          testName,
          formattedDate,
          formattedTime,
          formData.department || 'Lab',
          formData.priority
        );
      }

      // In-app notification for patient
      await createNotification(patientId, {
        title: 'New Test Scheduled',
        message: `Your doctor scheduled "${testName}" for ${formattedDate}${formattedTime ? ` at ${formattedTime}` : ''}.`,
        type: 'test_scheduled',
      });

      toast({
        title: '✅ Test Scheduled!',
        description: `${selectedTests.length || 1} test(s) scheduled for ${format(date, 'PPP')}. Patient has been notified.`,
      });
      setOpen(false);
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const hasTests = selectedTests.length > 0 || !!recommendedTest;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button className="w-full gap-2" disabled={!hasTests}>
          <CalendarIcon className="w-4 h-4" />
          Schedule Test
          {selectedTests.length > 0 && (
            <span className="ml-1 bg-white/20 rounded-full px-2 py-0.5 text-xs font-semibold">
              {selectedTests.length}
            </span>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border bg-gradient-to-r from-primary/5 to-secondary/5">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FlaskConical className="w-5 h-5 text-primary" />
            Schedule Medical Test
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">Fill in the details to schedule the selected tests</p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-5 mt-4">

          {/* Selected Tests */}
          {selectedTests.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-primary" />
                Selected Tests ({selectedTests.length})
              </Label>
              <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-primary/20 bg-primary/5">
                {selectedTests.map((test) => (
                  <Badge key={test} variant="secondary" className="text-xs px-2.5 py-1 font-normal">
                    {test}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Test Type + Department */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Test Type</Label>
              <Select value={formData.testType} onValueChange={(v) => setFormData({ ...formData, testType: v })}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blood">🩸 Blood Test</SelectItem>
                  <SelectItem value="urine">🧪 Urine Test</SelectItem>
                  <SelectItem value="xray">🦴 X-Ray</SelectItem>
                  <SelectItem value="ct">🧠 CT Scan</SelectItem>
                  <SelectItem value="mri">🔬 MRI</SelectItem>
                  <SelectItem value="ultrasound">🔊 Ultrasound</SelectItem>
                  <SelectItem value="ecg">💓 ECG</SelectItem>
                  <SelectItem value="other">📋 Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Department</Label>
              <Select value={formData.department} onValueChange={(v) => setFormData({ ...formData, department: v })}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Select dept..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lab">🔬 Laboratory</SelectItem>
                  <SelectItem value="radiology">📡 Radiology</SelectItem>
                  <SelectItem value="cardiology">❤️ Cardiology</SelectItem>
                  <SelectItem value="pathology">🧬 Pathology</SelectItem>
                  <SelectItem value="neurology">🧠 Neurology</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Priority</Label>
            <div className="flex gap-2">
              {Object.entries(priorityConfig).map(([key, cfg]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setFormData({ ...formData, priority: key })}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                    formData.priority === key
                      ? cfg.color + ' border-current ring-2 ring-offset-1 ring-current/30'
                      : 'border-border bg-muted/40 text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {key === 'emergency' ? '🚨' : key === 'urgent' ? '⚠️' : '✅'} {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Calendar + Time */}
          <div className="grid grid-cols-2 gap-4 items-start">
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4 text-primary" />
                Select Date
              </Label>

              <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCalendarOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CalendarIcon className="w-4 h-4 text-primary" />
                    {date ? format(date, 'EEEE, MMMM d, yyyy') : 'Choose a date'}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full border ${date ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground border-border'}`}>
                    {calendarOpen ? 'Hide' : 'Open'}
                  </span>
                </button>

                {calendarOpen && (
                  <div className="border-t border-border bg-gradient-to-b from-white to-slate-50/80">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={(selectedDate) => {
                        setDate(selectedDate);
                        setCalendarOpen(false);
                      }}
                      disabled={{ before: new Date() }}
                      className="w-full p-2"
                    />
                  </div>
                )}
              </div>

              {date && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/20 text-sm text-primary font-medium">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  Selected: {format(date, 'EEEE, MMMM d, yyyy')}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" />
                  Preferred Time
                </Label>
                <Input
                  type="time"
                  value={formData.scheduledTime}
                  onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Additional Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Special instructions, preparation notes..."
                  rows={5}
                  className="resize-none text-sm"
                />
              </div>
            </div>
          </div>

          {!date && (
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Please select a date from the calendar to continue
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading || !date} className="flex-1 h-10">
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scheduling...</>
              ) : (
                <><CalendarIcon className="w-4 h-4 mr-2" />Confirm Schedule</>
              )}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-10 px-6">
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
