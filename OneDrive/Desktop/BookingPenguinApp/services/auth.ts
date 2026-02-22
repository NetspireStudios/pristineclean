import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  linkWithCredential,
  GoogleAuthProvider,
  signInWithCredential,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  arrayUnion,
  deleteDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db, functions } from './firebase';
import type { UserDoc, Membership, UserRole } from '@/types';

const CONTEXT_KEY = 'bookingpenguin_context';
const CUSTOM_USER_KEY = 'bp_customUserId';

// ── Types ────────────────────────────────────────────────────────────────

export interface PostLoginResult {
  success: true;
  redirect?: string;
  showRoleSelector?: boolean;
  memberships?: Membership[];
  profile?: UserDoc;
  customUserId?: string;
}

export interface GoogleLoginResult {
  success: boolean;
  redirect?: string;
  isNewUser?: boolean;
  showRoleSelector?: boolean;
  memberships?: Membership[];
  profile?: UserDoc;
  customUserId?: string;
  needsLinking?: boolean;
  linkMode?: 'relink-password' | 'add-google' | 'add-google-safe';
  email?: string;
  pendingCredential?: any;
}

export interface FindUserResult {
  exists: boolean;
  userId: string | null;
  userData: any | null;
}

export interface AuthResult {
  userId: string;
  userDoc: UserDoc;
  businessId: string;
  role: UserRole;
}

// ── Helpers ──────────────────────────────────────────────────────────────

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a number';
  return null;
}

export async function findUserByEmail(email: string): Promise<FindUserResult> {
  const normalized = email.toLowerCase().trim();
  const q = query(collection(db, 'users'), where('email', '==', normalized));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return { exists: false, userId: null, userData: null };
  }

  const userDoc = snapshot.docs[0];
  return { exists: true, userId: userDoc.id, userData: userDoc.data() };
}

function generateUserId(): string {
  return doc(collection(db, 'users')).id;
}

function getDashboardRoute(role: string): string {
  switch (role) {
    case 'owner':
    case 'admin':
      return '/(admin)/schedule';
    case 'staff':
      return '/(staff)/schedule';
    case 'client':
      return '/(admin)/schedule';
    default:
      return '/(auth)/login';
  }
}

// ── Context Storage (AsyncStorage) ───────────────────────────────────────

export async function saveContext(membership: Membership & { customUserId?: string }): Promise<void> {
  const customUserId = membership.customUserId || (await AsyncStorage.getItem(CUSTOM_USER_KEY)) || '';
  const context = {
    businessId: membership.businessId,
    businessName: membership.businessName || '',
    role: membership.role,
    customUserId,
  };
  await AsyncStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
}

export async function getContext(): Promise<{
  businessId: string;
  businessName: string;
  role: UserRole;
  customUserId: string;
} | null> {
  const data = await AsyncStorage.getItem(CONTEXT_KEY);
  return data ? JSON.parse(data) : null;
}

export async function clearContext(): Promise<void> {
  await AsyncStorage.multiRemove([CONTEXT_KEY, CUSTOM_USER_KEY, 'bp_session']);
}

// ── Post-Login Routing ───────────────────────────────────────────────────

export function handlePostLogin(
  memberships: Membership[],
  profile: any,
  customUserId: string
): PostLoginResult {
  AsyncStorage.setItem(CUSTOM_USER_KEY, customUserId);

  if (profile.emailVerified === false && memberships.length === 0) {
    return { success: true, redirect: 'verify-email' };
  }

  if (memberships.length === 0) {
    return { success: true, redirect: 'onboarding' };
  }

  const activeMemberships = memberships.filter((m) => m.status === 'active');

  if (activeMemberships.length === 0) {
    return { success: true, redirect: 'waiting' };
  }

  if (activeMemberships.length === 1) {
    saveContext({ ...activeMemberships[0], customUserId });
    return {
      success: true,
      redirect: getDashboardRoute(activeMemberships[0].role),
      customUserId,
    };
  }

  return {
    success: true,
    showRoleSelector: true,
    memberships: activeMemberships,
    profile: { ...profile, id: customUserId } as UserDoc,
    customUserId,
  };
}

// ── Sign Up (Email/Password) ─────────────────────────────────────────────

export async function signUp(params: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}): Promise<{ uid: string; customUserId: string; redirect: string }> {
  const normalizedEmail = params.email.toLowerCase().trim();

  let firebaseUid: string;
  let isExistingAuth = false;

  try {
    const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, params.password);
    firebaseUid = credential.user.uid;
  } catch (authError: any) {
    if (authError.code === 'auth/email-already-in-use') {
      isExistingAuth = true;
      try {
        const signInResult = await signInWithEmailAndPassword(auth, normalizedEmail, params.password);
        firebaseUid = signInResult.user.uid;
      } catch (signInErr: any) {
        if (
          ['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(
            signInErr.code
          )
        ) {
          throw new Error('An account with this email already exists. Please log in or use "Forgot Password".');
        }
        throw signInErr;
      }
    } else {
      throw authError;
    }
  }

  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser.exists && existingUser.userData?.emailVerified === true) {
    await firebaseSignOut(auth);
    throw new Error('This email is already registered. Please log in instead.');
  }

  let customUserId: string;
  if (existingUser.exists) {
    customUserId = existingUser.userId!;
    await updateDoc(doc(db, 'users', customUserId), {
      firstName: params.firstName.trim(),
      lastName: params.lastName.trim(),
      phone: params.phone?.trim() || null,
      'authUids.password': firebaseUid,
      updatedAt: serverTimestamp(),
    });
  } else {
    customUserId = generateUserId();
    await setDoc(doc(db, 'users', customUserId), {
      email: normalizedEmail,
      providers: ['password'],
      authUids: { password: firebaseUid },
      emailVerified: false,
      firstName: params.firstName.trim(),
      lastName: params.lastName.trim(),
      phone: params.phone?.trim() || null,
      memberships: [],
      createdAt: serverTimestamp(),
    });
  }

  await AsyncStorage.setItem(CUSTOM_USER_KEY, customUserId);
  await AsyncStorage.setItem(
    'bp_pendingVerification',
    JSON.stringify({ email: normalizedEmail, customUserId, firebaseUid })
  );

  return { uid: firebaseUid, customUserId, redirect: 'verify-email' };
}

// ── Sign In (Email/Password) ─────────────────────────────────────────────

export async function signIn(
  email: string,
  password: string
): Promise<PostLoginResult & { customUserId?: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  const firebaseUid = credential.user.uid;

  const firestoreUser = await findUserByEmail(normalizedEmail);

  if (!firestoreUser.exists) {
    const customUserId = generateUserId();
    const displayName = credential.user.displayName || '';
    const nameParts = displayName.split(' ');

    await setDoc(doc(db, 'users', customUserId), {
      email: normalizedEmail,
      providers: ['password'],
      authUids: { password: firebaseUid },
      emailVerified: true,
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      phone: null,
      memberships: [],
      createdAt: serverTimestamp(),
    });

    const pending = await getDocs(
      query(
        collection(db, 'invitations'),
        where('email', '==', normalizedEmail),
        where('status', '==', 'pending')
      )
    );
    if (!pending.empty) {
      await AsyncStorage.setItem('pendingInvitationId', pending.docs[0].id);
      return { success: true, redirect: 'accept-invite', customUserId };
    }
    return { success: true, redirect: 'onboarding', customUserId };
  }

  const { userId: customUserId, userData } = firestoreUser;
  const memberships = userData.memberships || [];

  if (userData.emailVerified === false && memberships.length === 0) {
    await AsyncStorage.setItem(CUSTOM_USER_KEY, customUserId!);
    return { success: true, redirect: 'verify-email', customUserId: customUserId! };
  }

  if (!userData.authUids?.password) {
    await updateDoc(doc(db, 'users', customUserId!), {
      'authUids.password': firebaseUid,
      providers: arrayUnion('password'),
    });
  }

  await updateDoc(doc(db, 'users', customUserId!), {
    lastLoginAt: serverTimestamp(),
  });

  return { ...handlePostLogin(memberships, userData, customUserId!), customUserId: customUserId! };
}

// ── Google Sign-In ───────────────────────────────────────────────────────

export async function loginWithGoogle(
  idToken: string
): Promise<GoogleLoginResult> {
  const googleCredential = GoogleAuthProvider.credential(idToken);

  try {
    const result = await signInWithCredential(auth, googleCredential);
    const firebaseUid = result.user.uid;
    const userEmail = (result.user.email || '').toLowerCase();
    const providerIds = result.user.providerData.map((p) => p.providerId);

    const firestoreUser = await findUserByEmail(userEmail);

    if (!firestoreUser.exists) {
      const customUserId = generateUserId();
      const displayName = result.user.displayName || '';
      const nameParts = displayName.split(' ');

      await setDoc(doc(db, 'users', customUserId), {
        email: userEmail,
        providers: ['google'],
        authUids: { google: firebaseUid },
        emailVerified: true,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        phone: result.user.phoneNumber || null,
        photoUrl: result.user.photoURL || null,
        memberships: [],
        createdAt: serverTimestamp(),
      });

      const pending = await getDocs(
        query(
          collection(db, 'invitations'),
          where('email', '==', userEmail),
          where('status', '==', 'pending')
        )
      );
      if (!pending.empty) {
        await AsyncStorage.setItem('pendingInvitationId', pending.docs[0].id);
        return { success: true, redirect: 'accept-invite', isNewUser: true, customUserId };
      }

      return { success: true, redirect: 'onboarding', isNewUser: true, customUserId };
    }

    const { userId: customUserId, userData } = firestoreUser;
    const firestoreProviders: string[] = userData.providers || [];

    if (firestoreProviders.includes('google')) {
      await updateDoc(doc(db, 'users', customUserId!), {
        'authUids.google': firebaseUid,
        lastLoginAt: serverTimestamp(),
      });
      return {
        ...handlePostLogin(userData.memberships || [], userData, customUserId!),
        customUserId: customUserId!,
      };
    }

    // Has password but NOT google
    if (providerIds.includes('google.com') && providerIds.includes('password')) {
      // Case 3A: Firebase auto-linked
      await updateDoc(doc(db, 'users', customUserId!), {
        providers: arrayUnion('google'),
        'authUids.google': firebaseUid,
        lastLoginAt: serverTimestamp(),
      });
      return {
        ...handlePostLogin(userData.memberships || [], userData, customUserId!),
        customUserId: customUserId!,
      };
    }

    const storedPasswordUid = userData.authUids?.password;

    if (storedPasswordUid && storedPasswordUid === firebaseUid) {
      // Case 3B: Same UID, password replaced
      return {
        success: false,
        needsLinking: true,
        linkMode: 'relink-password',
        email: userEmail,
        customUserId: customUserId!,
      };
    }

    // Case 3C: Different UID, separate account created
    try {
      await result.user.delete();
    } catch { /* best effort */ }
    await firebaseSignOut(auth);

    return {
      success: false,
      needsLinking: true,
      linkMode: 'add-google',
      email: userEmail,
      customUserId: customUserId!,
    };
  } catch (error: any) {
    if (error.code === 'auth/account-exists-with-different-credential') {
      const email = (error.email || error.customData?.email || '').toLowerCase();
      let customUserId: string | null = null;
      try {
        const fsUser = await findUserByEmail(email);
        customUserId = fsUser.exists ? fsUser.userId : null;
      } catch { /* ignore */ }

      return {
        success: false,
        needsLinking: true,
        linkMode: 'add-google-safe',
        email,
        pendingCredential: googleCredential,
        customUserId: customUserId || undefined,
      };
    }
    throw error;
  }
}

// ── Account Linking ──────────────────────────────────────────────────────

export async function linkGoogleToAccount(
  email: string,
  password: string,
  customUserId: string,
  pendingCredential: any,
  linkMode: string
): Promise<PostLoginResult> {
  if (linkMode === 'relink-password') {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Session expired. Please try again.');

    const emailCred = EmailAuthProvider.credential(email, password);
    try {
      await linkWithCredential(currentUser, emailCred);
    } catch (linkErr: any) {
      if (linkErr.code === 'auth/provider-already-linked') {
        await firebaseSignOut(auth);
        try {
          await signInWithEmailAndPassword(auth, email, password);
        } catch {
          const err: any = new Error('Incorrect password. Please try again.');
          err.code = 'auth/wrong-password';
          throw err;
        }
      } else if (linkErr.code === 'auth/email-already-in-use') {
        const err: any = new Error('Unable to link accounts. Please use "Forgot Password" to reset.');
        err.code = 'auth/email-already-in-use';
        throw err;
      } else {
        throw linkErr;
      }
    }

    const finalUid = auth.currentUser!.uid;
    await updateDoc(doc(db, 'users', customUserId), {
      providers: arrayUnion('google', 'password'),
      'authUids.google': finalUid,
      'authUids.password': finalUid,
      lastLoginAt: serverTimestamp(),
    });

    const userSnap = await getDoc(doc(db, 'users', customUserId));
    const userData = userSnap.data()!;
    return handlePostLogin(userData.memberships || [], userData, customUserId);
  }

  // add-google / add-google-safe
  const signInResult = await signInWithEmailAndPassword(auth, email, password);
  const currentUser = signInResult.user;
  const existingProviders = currentUser.providerData.map((p) => p.providerId);
  let linked = existingProviders.includes('google.com');

  if (!linked && pendingCredential) {
    try {
      await linkWithCredential(currentUser, pendingCredential);
      linked = true;
    } catch (linkErr: any) {
      if (linkErr.code === 'auth/provider-already-linked') {
        linked = true;
      } else if (linkErr.code === 'auth/credential-already-in-use') {
        const err: any = new Error('This Google account is already linked to a different account.');
        err.code = 'auth/credential-already-in-use';
        throw err;
      } else {
        throw linkErr;
      }
    }
  }

  // On mobile we can't do linkWithPopup, so if no pendingCredential and not linked,
  // user will need to try Google sign-in again
  if (!linked) {
    const err: any = new Error('Unable to link Google account. Please try signing in with Google again.');
    err.code = 'auth/linking-failed';
    throw err;
  }

  const finalUid = auth.currentUser!.uid;
  await updateDoc(doc(db, 'users', customUserId), {
    providers: arrayUnion('google'),
    'authUids.google': finalUid,
    lastLoginAt: serverTimestamp(),
  });

  const userSnap = await getDoc(doc(db, 'users', customUserId));
  const userData = userSnap.data()!;
  return handlePostLogin(userData.memberships || [], userData, customUserId);
}

// ── Password Management ──────────────────────────────────────────────────

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Not authenticated.');

  const pwError = validatePassword(newPassword);
  if (pwError) throw new Error(pwError);

  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

export async function setPasswordForGoogleUser(newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Not authenticated.');

  const hasPassword = user.providerData.some((p) => p.providerId === 'password');
  if (hasPassword) throw new Error('Account already has a password. Use Change Password instead.');

  const pwError = validatePassword(newPassword);
  if (pwError) throw new Error(pwError);

  const cred = EmailAuthProvider.credential(user.email, newPassword);
  await linkWithCredential(user, cred);

  const fsUser = await findUserByEmail(user.email);
  if (fsUser.exists) {
    await updateDoc(doc(db, 'users', fsUser.userId!), {
      providers: arrayUnion('password'),
      'authUids.password': user.uid,
    });
  }
}

// ── Password Reset ───────────────────────────────────────────────────────

const _resetRateLimit: Record<string, { count: number; windowStart: number }> = {};
const RESET_MAX = 3;
const RESET_WINDOW = 30 * 60 * 1000;

export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();

  const now = Date.now();
  const entry = _resetRateLimit[normalized];
  if (entry && now - entry.windowStart < RESET_WINDOW) {
    if (entry.count >= RESET_MAX) {
      const minsLeft = Math.ceil((RESET_WINDOW - (now - entry.windowStart)) / 60000);
      const err: any = new Error(`Too many reset requests. Try again in ${minsLeft} minutes.`);
      err.code = 'auth/rate-limited';
      throw err;
    }
    entry.count++;
  } else {
    _resetRateLimit[normalized] = { count: 1, windowStart: now };
  }

  const fn = httpsCallable(functions, 'requestPasswordReset');
  await fn({ email: normalized });
}

// ── Email Verification ───────────────────────────────────────────────────

export async function sendVerificationCode(emailAddr: string, userId: string): Promise<void> {
  const fn = httpsCallable(functions, 'createVerificationCodeSecure');
  await fn({ email: emailAddr.toLowerCase().trim(), userId, type: 'email_verification' });
}

export async function verifyEmailCode(
  emailAddr: string,
  code: string,
  userId: string
): Promise<{ success: boolean; expired?: boolean; maxAttempts?: boolean; attemptsLeft?: number }> {
  const fn = httpsCallable<any, any>(functions, 'verifyEmailCodeSecure');
  const result = await fn({ email: emailAddr.toLowerCase().trim(), code, userId });
  return result.data;
}

// ── Business Map ─────────────────────────────────────────────────────────

export async function ensureBusinessMap(): Promise<void> {
  const fn = httpsCallable(functions, 'ensureMyBusinessMap');
  await fn({});
}

// ── Invitation Helpers ───────────────────────────────────────────────────

export async function getInvitation(invitationId: string) {
  const snap = await getDoc(doc(db, 'invitations', invitationId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function acceptInvitationForUser(
  invitationId: string,
  invitation: any
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated.');
  const email = (user.email || '').toLowerCase();

  let firestoreUser = await findUserByEmail(email);

  if (!firestoreUser.exists) {
    const customUserId = generateUserId();
    const displayName = user.displayName || '';
    const nameParts = displayName.split(' ');
    const providerIds = user.providerData.map((p) => p.providerId);

    await setDoc(doc(db, 'users', customUserId), {
      email,
      providers: providerIds.includes('google.com') ? ['google'] : ['password'],
      authUids: providerIds.includes('google.com')
        ? { google: user.uid }
        : { password: user.uid },
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      phone: null,
      emailVerified: true,
      memberships: [],
      createdAt: serverTimestamp(),
    });
    firestoreUser = await findUserByEmail(email);
  }

  const userId = firestoreUser.userId!;
  const memberships: Membership[] = firestoreUser.userData?.memberships || [];

  const existingSameRole = memberships.find(
    (m) => m.businessId === invitation.businessId && m.role === invitation.role && m.status === 'active'
  );
  if (existingSameRole) {
    await saveContext({ ...existingSameRole, customUserId: userId });
    return getDashboardRoute(existingSameRole.role);
  }

  const inactiveSameRole = memberships.find(
    (m) => m.businessId === invitation.businessId && m.role === invitation.role && m.status === 'inactive'
  );
  if (inactiveSameRole) {
    const updated = memberships.map((m) => {
      if (m.businessId === invitation.businessId && m.role === invitation.role) {
        return { ...m, status: 'active' as const, reactivatedAt: new Date().toISOString() };
      }
      return m;
    });
    await updateDoc(doc(db, 'users', userId), { memberships: updated });
    await updateDoc(doc(db, 'invitations', invitationId), {
      status: 'accepted',
      acceptedAt: serverTimestamp(),
      acceptedBy: userId,
    });

    const activeMembership = updated.find(
      (m) => m.businessId === invitation.businessId && m.role === invitation.role
    )!;
    await saveContext({ ...activeMembership, customUserId: userId });
    return getDashboardRoute(activeMembership.role);
  }

  const membership: Membership = {
    businessId: invitation.businessId,
    businessName: invitation.businessName || '',
    role: invitation.role,
    status: 'active',
    joinedAt: new Date().toISOString(),
  };

  await updateDoc(doc(db, 'users', userId), {
    memberships: arrayUnion(membership),
  });

  await updateDoc(doc(db, 'invitations', invitationId), {
    status: 'accepted',
    acceptedAt: serverTimestamp(),
    acceptedBy: userId,
  });

  // Link existing bookings for client invitations
  if (invitation.role === 'client' && email) {
    try {
      const existingBookings = await getDocs(
        query(
          collection(db, 'bookings'),
          where('businessId', '==', invitation.businessId),
          where('customer.email', '==', email)
        )
      );
      // Batch updates would require import; do individually for simplicity
      for (const bookingDoc of existingBookings.docs) {
        await updateDoc(bookingDoc.ref, {
          clientId: user.uid,
          'customer.isRegistered': true,
        });
      }
    } catch { /* non-critical */ }
  }

  // Increment admin seats for admin invitations
  if (invitation.role === 'admin') {
    try {
      const seatFn = httpsCallable(functions, 'updateBusinessSecure');
      await seatFn({ businessId: invitation.businessId, adminSeatsAction: 'increment' });
    } catch { /* non-critical */ }
  }

  // Notify inviter
  try {
    const notifFn = httpsCallable(functions, 'createNotificationSecure');
    await notifFn({
      userId: invitation.invitedBy,
      title: invitation.role === 'client' ? 'New Client Joined' : 'New Member Joined',
      message: `${email} has joined as ${invitation.role}`,
      type: 'member_joined',
      businessId: invitation.businessId,
    });
  } catch { /* non-critical */ }

  await saveContext({ ...membership, customUserId: userId });
  await AsyncStorage.removeItem('pendingInvitationId');
  return getDashboardRoute(invitation.role);
}

// ── Business Creation (Onboarding) ───────────────────────────────────────

export async function createBusiness(data: {
  name: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated.');

  const fsUser = await findUserByEmail(user.email!);
  if (!fsUser.exists) throw new Error('User profile not found.');

  const memberships: Membership[] = fsUser.userData?.memberships || [];
  const isAlreadyAdmin = memberships.some(
    (m) => (m.role === 'admin' || m.role === 'owner') && m.status === 'active'
  );
  if (isAlreadyAdmin) throw new Error('You are already an admin of another company.');

  const businessRef = doc(collection(db, 'businesses'));
  await setDoc(businessRef, {
    name: data.name.trim(),
    phone: data.phone.trim(),
    email: data.email.trim().toLowerCase(),
    address: {
      street: data.street.trim(),
      city: data.city.trim(),
      state: data.province.trim(),
      zip: data.postalCode.trim().toUpperCase(),
      country: data.country.trim(),
    },
    serviceAreas: [data.city.trim()],
    timezone: 'America/Toronto',
    currency: 'CAD',
    taxRate: 0.13,
    ownerId: user.uid,
    adminSeats: { used: 1, limit: 3 },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const membership: Membership = {
    businessId: businessRef.id,
    businessName: data.name.trim(),
    role: 'owner',
    status: 'active',
    joinedAt: new Date().toISOString(),
  };

  await updateDoc(doc(db, 'users', fsUser.userId!), {
    memberships: arrayUnion(membership),
    updatedAt: serverTimestamp(),
  });

  await saveContext({ ...membership, customUserId: fsUser.userId! });
  return getDashboardRoute('owner');
}

// ── Account Deletion ─────────────────────────────────────────────────────

export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated.');

  const fsUser = await findUserByEmail(user.email!);
  if (fsUser.exists) {
    await deleteDoc(doc(db, 'users', fsUser.userId!));
  }

  await user.delete();
  await clearContext();
}

// ── Resolve User Context (for AuthContext) ───────────────────────────────

export async function resolveUserContext(authUid: string): Promise<AuthResult> {
  const mapRef = doc(db, 'userBusinessMap', authUid);
  let mapSnap = await getDoc(mapRef);

  if (!mapSnap.exists()) {
    const ensureMap = httpsCallable(functions, 'ensureMyBusinessMap');
    await ensureMap();
    mapSnap = await getDoc(mapRef);
  }

  if (!mapSnap.exists()) {
    throw new Error('NO_BUSINESS_MAP');
  }

  const mapData = mapSnap.data();
  const firestoreUserId = mapData?.userId;

  if (!firestoreUserId) {
    throw new Error('INCOMPLETE_SETUP');
  }

  const userRef = doc(db, 'users', firestoreUserId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    throw new Error('USER_NOT_FOUND');
  }

  const userDocData = { id: userSnap.id, ...userSnap.data() } as UserDoc;

  const activeMembership = userDocData.memberships?.find((m: Membership) => m.status === 'active');

  if (!activeMembership) {
    throw new Error('NO_ACTIVE_MEMBERSHIP');
  }

  let role: UserRole = activeMembership.role;
  const businessRef = doc(db, 'businesses', activeMembership.businessId);
  const businessSnap = await getDoc(businessRef);

  if (businessSnap.exists()) {
    const businessData = businessSnap.data();
    if (businessData.ownerId === authUid || businessData.ownerId === firestoreUserId) {
      role = 'owner';
    }
  }

  return {
    userId: firestoreUserId,
    userDoc: userDocData,
    businessId: activeMembership.businessId,
    role,
  };
}

// ── Sign Out ─────────────────────────────────────────────────────────────

export async function signOutUser(): Promise<void> {
  await clearContext();
  await firebaseSignOut(auth);
}
