import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from './firebase';
import type { UserDoc, UserBusinessMap, Membership, UserRole } from '@/types';

export interface AuthResult {
  userId: string;
  userDoc: UserDoc;
  businessId: string;
  role: UserRole;
}

/**
 * Sign in with email/password and resolve role + business context.
 */
export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );
  return resolveUserContext(credential.user.uid);
}

/**
 * Sign up a new user, create their Firestore user doc, then resolve context.
 */
export async function signUp(params: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}): Promise<{ uid: string }> {
  const credential = await createUserWithEmailAndPassword(
    auth,
    params.email.trim(),
    params.password
  );
  const uid = credential.user.uid;

  // Create user doc in Firestore (matching web app structure)
  const userDocRef = doc(collection(db, 'users'));
  await setDoc(userDocRef, {
    email: params.email.trim().toLowerCase(),
    firstName: params.firstName.trim(),
    lastName: params.lastName.trim(),
    phone: params.phone?.trim() || '',
    authUids: { password: uid },
    memberships: [],
    emailVerified: false,
    createdAt: serverTimestamp(),
  });

  return { uid };
}

/**
 * After login, resolve the user's business, role, and Firestore user doc.
 * This mirrors the web app's guardDashboard() logic.
 */
export async function resolveUserContext(
  authUid: string
): Promise<AuthResult> {
  // 1. Check userBusinessMap for this auth UID
  const mapRef = doc(db, 'userBusinessMap', authUid);
  let mapSnap = await getDoc(mapRef);

  // If mapping doesn't exist, call ensureMyBusinessMap to create it
  if (!mapSnap.exists()) {
    const ensureMap = httpsCallable(functions, 'ensureMyBusinessMap');
    await ensureMap();
    mapSnap = await getDoc(mapRef);
  }

  if (!mapSnap.exists()) {
    throw new Error('No business found for this account.');
  }

  const mapData = mapSnap.data() as UserBusinessMap;
  const firestoreUserId = mapData.userId;

  if (!firestoreUserId) {
    throw new Error('Account not fully set up. Please complete setup on the web.');
  }

  // 2. Get the user's Firestore document
  const userRef = doc(db, 'users', firestoreUserId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    throw new Error('User profile not found.');
  }

  const userDoc = { id: userSnap.id, ...userSnap.data() } as UserDoc;

  // 3. Find an active membership
  const activeMembership = userDoc.memberships.find(
    (m: Membership) => m.status === 'active'
  );

  if (!activeMembership) {
    throw new Error(
      'No active business membership. You may need an invitation to join a business.'
    );
  }

  // 4. Determine role: check if user is the business owner
  let role: UserRole = activeMembership.role;
  const businessRef = doc(db, 'businesses', activeMembership.businessId);
  const businessSnap = await getDoc(businessRef);

  if (businessSnap.exists()) {
    const businessData = businessSnap.data();
    if (
      businessData.ownerId === authUid ||
      businessData.ownerId === firestoreUserId
    ) {
      role = 'owner';
    }
  }

  return {
    userId: firestoreUserId,
    userDoc,
    businessId: activeMembership.businessId,
    role,
  };
}

/**
 * Request a password reset via the existing Cloud Function.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const resetFn = httpsCallable(functions, 'requestPasswordReset');
  await resetFn({ email: email.trim().toLowerCase() });
}

/**
 * Sign out and clear local state.
 */
export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}
