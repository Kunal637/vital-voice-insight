/**
 * Email notification helper using EmailJS.
 * Set VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, VITE_EMAILJS_PUBLIC_KEY
 * in your .env and create a matching template in EmailJS dashboard.
 *
 * Template variables used:
 *   {{to_email}}, {{subject}}, {{message_html}}, {{patient_name}}, {{test_name}},
 *   {{scheduled_date}}, {{scheduled_time}}, {{department}}, {{priority}}
 */

const EMAILJS_SERVICE  = import.meta.env.VITE_EMAILJS_SERVICE_ID  as string;
const EMAILJS_TEMPLATE = import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string;
const EMAILJS_KEY      = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  as string;
const REAL_PATIENT_EMAIL = 'kunalsukhani1@gmail.com';
const EMAILJS_TEMPLATE_TEST_SCHEDULED = (import.meta.env.VITE_EMAILJS_TEMPLATE_ID_TEST_SCHEDULED || EMAILJS_TEMPLATE) as string;
const EMAILJS_TEMPLATE_DOCTOR_UPLOAD = (import.meta.env.VITE_EMAILJS_TEMPLATE_ID_DOCTOR_UPLOAD || EMAILJS_TEMPLATE) as string;
const EMAILJS_TEMPLATE_RESULT_REVIEWED = (import.meta.env.VITE_EMAILJS_TEMPLATE_ID_RESULT_REVIEWED || EMAILJS_TEMPLATE) as string;

const normalizeRecipientEmail = (email?: string): string => {
  const value = (email ?? '').trim().toLowerCase();
  if (!value) return '';

  if (value === 'patient@example.com') {
    return REAL_PATIENT_EMAIL;
  }

  return email ?? '';
};

export interface EmailPayload {
  to_email: string;
  subject: string;
  patient_name?: string;
  test_name?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  department?: string;
  priority?: string;
  message_html?: string;
}

const sendTemplateEmail = async (
  payload: EmailPayload,
  templateId: string
): Promise<boolean> => {
  if (!EMAILJS_SERVICE || !templateId || !EMAILJS_KEY) {
    console.warn('[email] EmailJS template env vars not set — skipping email send.');
    return false;
  }

  const normalizedPayload = {
    ...payload,
    to_email: normalizeRecipientEmail(payload.to_email),
  };

  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:  EMAILJS_SERVICE,
        template_id: templateId,
        user_id:     EMAILJS_KEY,
        template_params: normalizedPayload,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[email] EmailJS error:', res.status, text, 'templateId=', templateId);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] Failed to send email:', err, 'templateId=', templateId);
    return false;
  }
};

/**
 * Send an email via EmailJS public API (no server needed).
 * Falls back gracefully if env vars are not yet configured.
 */
export const sendEmail = async (payload: EmailPayload): Promise<boolean> => {
  return sendTemplateEmail(payload, EMAILJS_TEMPLATE);
};

// ── Pre-built payloads ────────────────────────────────────────────────────────

export const notifyPatientTestScheduled = (
  patientEmail: string,
  patientName: string,
  testName: string,
  date: string,
  time: string,
  department: string,
  priority: string
) =>
  sendTemplateEmail({
    to_email: normalizeRecipientEmail(patientEmail),
    subject: `🔬 New Test Scheduled — ${testName}`,
    patient_name: patientName,
    test_name: testName,
    scheduled_date: date,
    scheduled_time: time,
    department,
    priority,
    message_html: `Dear <strong>${patientName}</strong>,<br/><br/>Your doctor has scheduled <strong>${testName}</strong> on <strong>${date}</strong>${time ? ` at ${time}` : ''} in the <strong>${department}</strong> department.<br/><br/>Please log in to your patient portal to upload your results once done.`,
  }, EMAILJS_TEMPLATE_TEST_SCHEDULED);

export const notifyDoctorTestUploaded = (
  doctorEmail: string,
  patientName: string,
  testName: string,
  testType: string,
  department: string,
  priority: string
) =>
  sendTemplateEmail({
    to_email: doctorEmail,
    subject: `🔬 Test Result Uploaded — ${testName}`,
    patient_name: patientName,
    test_name: testName,
    scheduled_date: new Date().toLocaleDateString(),
    department,
    priority,
    message_html: `Patient <strong>${patientName}</strong> has uploaded results for <strong>${testName}</strong> (${testType}).<br/><br/>Please log in to your dashboard to review the uploaded file.`,
  }, EMAILJS_TEMPLATE_DOCTOR_UPLOAD);

export const notifyPatientResultReviewed = (
  patientEmail: string,
  patientName: string,
  testName: string,
  doctorRemarks?: string,
  doctorAdvice?: string
) =>
  sendTemplateEmail({
    to_email: patientEmail,
    subject: `✅ Test Review Complete — ${testName}`,
    patient_name: patientName,
    test_name: testName,
    message_html: `Dear <strong>${patientName}</strong>,<br/><br/>Your doctor has reviewed your test result for <strong>${testName}</strong>.<br/><br/>${doctorRemarks ? `<strong>Doctor remarks:</strong><br/>${doctorRemarks}<br/><br/>` : ''}${doctorAdvice ? `<strong>Recommended next steps:</strong><br/>${doctorAdvice}<br/><br/>` : ''}Please log in to your portal to view the full review.`,
  }, EMAILJS_TEMPLATE_RESULT_REVIEWED);
