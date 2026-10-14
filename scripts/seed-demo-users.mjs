/**
 * Seed demo users into Firebase Auth + Firestore.
 * Run: npm run seed
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, 'serviceAccountKey.json');

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
} catch {
  console.error(
    '\n❌  Service account key not found.\n' +
    '    Save it as scripts/serviceAccountKey.json\n'
  );
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();
const db   = getFirestore();

const DEMO_USERS = [
  { email: 'admin@example.com',   password: 'admin123', role: 'admin',   displayName: 'Demo Admin' },
  { email: 'doctor@example.com',  password: 'admin123', role: 'doctor',  displayName: 'Dr. Demo' },
  { email: 'patient@example.com', password: 'admin123', role: 'patient', displayName: 'Demo Patient' },
  { email: 'labs@example.com',    password: 'admin123', role: 'labs',    displayName: 'Demo Labs' },
];

async function seedUser({ email, password, role, displayName }) {
  let uid;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    console.log(`  ⚡ Already exists: ${email} (${uid})`);
  } catch {
    const created = await auth.createUser({ email, password, displayName, emailVerified: true });
    uid = created.uid;
    console.log(`  ✅ Created: ${email} (${uid})`);
  }

  await db.collection('users').doc(uid).set(
    { email, displayName, role, createdAt: new Date().toISOString() },
    { merge: true }
  );

  if (role === 'patient') {
    await db.collection('patients').doc(uid).set(
      { userId: uid, fullName: displayName, email, createdAt: new Date().toISOString() },
      { merge: true }
    );
    await db.collection('users').doc(uid).set({ patientId: uid }, { merge: true });
    console.log(`  📋 Patient record upserted for ${email}`);
  }
}

async function main() {
  console.log('\n🔥  Seeding demo users into Firebase (vital-voice-icil)…\n');
  for (const u of DEMO_USERS) await seedUser(u);
  console.log('\n✅  Done! Login credentials:\n');
  DEMO_USERS.forEach(({ email, password, role }) =>
    console.log(`  ${role.padEnd(8)} │ ${email}  /  ${password}`)
  );
  console.log();
  process.exit(0);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
