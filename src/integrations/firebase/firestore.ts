/**
 * Firestore data service layer.
 * All collections and CRUD operations live here so components stay clean.
 *
 * Collections:
 *   users/            { email, displayName, role, patientId? }
 *   patients/         { userId, fullName, email, phone?, dateOfBirth? }
 *   appointments/     { patientId, patientName, patientEmail, doctorId?, department, reason, preferredDate, preferredTime, status, createdAt }
 *   consultations/    { doctorId, patientId, transcript, diagnosis, aiConfidence, symptoms[], createdAt }
 *   medical_tests/    { consultationId, patientId, patientEmail, patientName, testName, testType, department, scheduledDate, scheduledTime, priority, status, notes, createdAt }
 *   test_results/     { testId, patientId, resultFileUrl, aiAnalysis, aiRemarks, doctorRemarks, doctorAdvice, anomaliesDetected, reviewedAt, createdAt }
 *   notifications/    { userId, title, message, read, createdAt, type }
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from './config';

// ── Helpers ───────────────────────────────────────────────────────────────────
export const toDate = (v: any): Date => {
  if (!v) return new Date();
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === 'string') return new Date(v);
  return new Date(v);
};

const col = (name: string) => collection(db, name);

// ── Users ─────────────────────────────────────────────────────────────────────
export const getUserProfile = async (uid: string) => {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// ── Patients ──────────────────────────────────────────────────────────────────
export const getPatient = async (patientId: string) => {
  const snap = await getDoc(doc(db, 'patients', patientId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const getPatientByUserId = async (userId: string) => {
  const q = query(col('patients'), where('userId', '==', userId));
  const snaps = await getDocs(q);
  if (snaps.empty) return null;
  const d = snaps.docs[0];
  return { id: d.id, ...d.data() };
};

// ── Appointments ──────────────────────────────────────────────────────────────
export const createAppointment = async (data: Record<string, any>) => {
  return addDoc(col('appointments'), { ...data, createdAt: serverTimestamp() });
};

export const getAppointmentsForPatient = async (patientId: string) => {
  const q = query(col('appointments'), where('patientId', '==', patientId), orderBy('preferredDate', 'asc'));
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getActiveAppointments = async () => {
  const q = query(
    col('appointments'),
    where('status', 'in', ['requested', 'confirmed', 'in_progress']),
    orderBy('preferredDate', 'asc')
  );
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const updateAppointmentStatus = async (id: string, status: string) => {
  return updateDoc(doc(db, 'appointments', id), { status });
};

// ── Consultations ─────────────────────────────────────────────────────────────
export const createConsultation = async (data: Record<string, any>) => {
  return addDoc(col('consultations'), { ...data, createdAt: serverTimestamp() });
};

export const updateConsultation = async (id: string, data: Record<string, any>) => {
  return updateDoc(doc(db, 'consultations', id), data);
};

export const getConsultationsForPatient = async (patientId: string) => {
  const q = query(col('consultations'), where('patientId', '==', patientId), orderBy('createdAt', 'desc'));
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// ── Medical Tests ─────────────────────────────────────────────────────────────
export const createMedicalTest = async (data: Record<string, any>) => {
  return addDoc(col('medical_tests'), { ...data, createdAt: serverTimestamp() });
};

export const getMedicalTestsForPatient = async (patientId: string) => {
  const q = query(col('medical_tests'), where('patientId', '==', patientId), orderBy('scheduledDate', 'asc'));
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getMedicalTestsForPatientEmail = async (patientEmail: string) => {
  const q = query(col('medical_tests'), where('patientEmail', '==', patientEmail), orderBy('scheduledDate', 'asc'));
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getAllMedicalTests = async (...constraints: QueryConstraint[]) => {
  const q = query(col('medical_tests'), ...constraints);
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const updateMedicalTest = async (id: string, data: Record<string, any>) => {
  return updateDoc(doc(db, 'medical_tests', id), data);
};

// Realtime listener for a patient's tests
export const subscribeMedicalTests = (
  patientId: string,
  callback: (tests: any[]) => void
) => {
  const q = query(col('medical_tests'), where('patientId', '==', patientId), orderBy('scheduledDate', 'asc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
};

// Realtime listener for all tests (doctor/labs)
export const subscribeAllMedicalTests = (callback: (tests: any[]) => void) => {
  const q = query(col('medical_tests'), orderBy('scheduledDate', 'asc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
};

// ── Test Results ──────────────────────────────────────────────────────────────
export const createTestResult = async (data: Record<string, any>) => {
  return addDoc(col('test_results'), { ...data, createdAt: serverTimestamp() });
};

export const getTestResult = async (id: string) => {
  const snap = await getDoc(doc(db, 'test_results', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const getAllTestResults = async () => {
  const q = query(col('test_results'), orderBy('createdAt', 'desc'));
  const snaps = await getDocs(q);
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const updateTestResult = async (id: string, data: Record<string, any>) => {
  return updateDoc(doc(db, 'test_results', id), data);
};

// Realtime listener for doctor
export const subscribeTestResults = (callback: (results: any[]) => void) => {
  const q = query(col('test_results'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
};

// ── Notifications ─────────────────────────────────────────────────────────────
export const createNotification = async (userId: string, data: {
  title: string;
  message: string;
  type: 'test_scheduled' | 'test_uploaded' | 'appointment' | 'result_reviewed';
}) => {
  const dupQuery = query(
    col('notifications'),
    where('userId', '==', userId),
    where('title', '==', data.title),
    where('message', '==', data.message),
    where('type', '==', data.type)
  );

  const dupSnaps = await getDocs(dupQuery);
  if (!dupSnaps.empty) {
    return dupSnaps.docs[0].ref;
  }

  return addDoc(col('notifications'), {
    userId,
    ...data,
    read: false,
    createdAt: serverTimestamp(),
  });
};

export const subscribeNotifications = (
  userId: string,
  callback: (notifications: any[]) => void
) => {
  const q = query(
    col('notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
};

export const markNotificationRead = async (id: string) => {
  return updateDoc(doc(db, 'notifications', id), { read: true });
};

export const markAllNotificationsRead = async (userId: string) => {
  const q = query(col('notifications'), where('userId', '==', userId), where('read', '==', false));
  const snaps = await getDocs(q);
  await Promise.all(snaps.docs.map((d) => updateDoc(d.ref, { read: true })));
};

// ── Stats (Admin) ──────────────────────────────────────────────────────────────
export const getAdminStats = async () => {
  const [consultSnaps, testsSnaps, patientsSnaps] = await Promise.all([
    getDocs(col('consultations')),
    getDocs(col('medical_tests')),
    getDocs(col('patients')),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tests = testsSnaps.docs.map((d) => d.data());
  const consultations = consultSnaps.docs.map((d) => d.data());

  return {
    total_consultations: consultations.length,
    today_consultations: consultations.filter((c) => {
      const d = toDate(c.createdAt);
      return d >= today;
    }).length,
    total_tests: tests.length,
    pending_tests: tests.filter((t) => t.status === 'pending').length,
    completed_tests: tests.filter((t) => t.status === 'completed').length,
    total_patients: patientsSnaps.size,
  };
};
