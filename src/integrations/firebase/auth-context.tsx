import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './config';

// ── Types ─────────────────────────────────────────────────────────────────────
export type UserRole = 'doctor' | 'patient' | 'admin' | 'labs' | 'staff';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  patientId?: string; // Firestore doc id in /patients collection
}

interface AuthContextValue {
  user: AppUser | null;
  firebaseUser: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  createUser: (email: string, password: string, role: UserRole, displayName: string) => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Build AppUser from Firebase user + Firestore profile
  const buildAppUser = async (fbUser: User): Promise<AppUser> => {
    const profileRef = doc(db, 'users', fbUser.uid);
    const profileSnap = await getDoc(profileRef);
    const profile = profileSnap.data();
    return {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: profile?.displayName ?? fbUser.displayName,
      role: (profile?.role as UserRole) ?? 'patient',
      patientId: profile?.patientId,
    };
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const appUser = await buildAppUser(fbUser);
          setUser(appUser);
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will fire and set user
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const createUser = async (
    email: string,
    password: string,
    role: UserRole,
    displayName: string
  ) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Save profile in Firestore
    await setDoc(doc(db, 'users', cred.user.uid), {
      email,
      displayName,
      role,
      createdAt: new Date().toISOString(),
    });
    // If patient, also create patient doc
    if (role === 'patient') {
      const patRef = doc(db, 'patients', cred.user.uid);
      await setDoc(patRef, {
        userId: cred.user.uid,
        fullName: displayName,
        email,
        createdAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'users', cred.user.uid), { patientId: cred.user.uid }, { merge: true });
    }
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, signIn, signOut, createUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Redirect target per role */
export function roleRoute(role: UserRole): string {
  switch (role) {
    case 'doctor': return '/dashboard';
    case 'admin':  return '/admin';
    case 'labs':   return '/labs-dashboard';
    default:       return '/patient-dashboard';
  }
}
