import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, functions } from './firebase';
import type { InvitationDoc, UserRole } from '@/types';

const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const COOLDOWN_STORAGE_PREFIX = 'invite_cooldown_';

export async function checkInviteCooldown(email: string): Promise<{ blocked: boolean; minutesLeft: number }> {
  const key = COOLDOWN_STORAGE_PREFIX + email.toLowerCase();
  const stored = await AsyncStorage.getItem(key);
  if (!stored) return { blocked: false, minutesLeft: 0 };

  const sentAt = parseInt(stored, 10);
  const elapsed = Date.now() - sentAt;
  if (elapsed >= COOLDOWN_MS) {
    await AsyncStorage.removeItem(key);
    return { blocked: false, minutesLeft: 0 };
  }

  const minutesLeft = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
  return { blocked: true, minutesLeft };
}

async function setInviteCooldown(email: string): Promise<void> {
  const key = COOLDOWN_STORAGE_PREFIX + email.toLowerCase();
  await AsyncStorage.setItem(key, String(Date.now()));
}

export async function createInvitation(params: {
  email: string;
  role: UserRole;
  businessId: string;
  businessName?: string;
  inviterName?: string;
}): Promise<{ invitationId: string }> {
  const { businessName, inviterName, ...fnParams } = params;
  const fn = httpsCallable<typeof fnParams, { invitationId: string }>(
    functions,
    'createInvitationSecure'
  );
  const result = await fn(fnParams);
  const { invitationId } = result.data;

  const roleName = params.role.charAt(0).toUpperCase() + params.role.slice(1);
  const bName = businessName || 'a business';
  const sender = inviterName || 'An admin';

  // Fetch the created invitation doc to get the token for the accept link
  let token = '';
  try {
    const inviteSnap = await getDoc(doc(db, 'invitations', invitationId));
    if (inviteSnap.exists()) {
      token = inviteSnap.data().token || '';
    }
  } catch {
    console.warn('[Invitations] Could not read token from invitation doc');
  }

  const acceptUrl = token
    ? `https://www.bookingpenguin.com/?invite=${token}`
    : 'https://www.bookingpenguin.com';

  try {
    const sendEmail = httpsCallable(functions, 'sendEmailSecure');
    await sendEmail({
      to: params.email,
      subject: `You've been invited to join ${bName} on BookingPenguin`,
      emailType: 'invitation',
      businessId: params.businessId,
      html: buildInviteEmailHtml({
        roleName,
        businessName: bName,
        inviterName: sender,
        email: params.email,
        acceptUrl,
      }),
      text: `${sender} has invited you to join ${bName} as a ${roleName} on BookingPenguin. Accept your invitation here: ${acceptUrl}`,
    });
  } catch (emailErr) {
    console.warn('[Invitations] Email send failed (invite still created):', emailErr);
  }

  await setInviteCooldown(params.email);

  return result.data;
}

function buildInviteEmailHtml(p: {
  roleName: string;
  businessName: string;
  inviterName: string;
  email: string;
  acceptUrl: string;
}): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#1e293b;margin-bottom:8px;">You're Invited!</h2>
      <p style="color:#475569;font-size:15px;line-height:1.6;">
        <strong>${p.inviterName}</strong> has invited you to join
        <strong>${p.businessName}</strong> as a <strong>${p.roleName}</strong>
        on BookingPenguin.
      </p>
      <p style="color:#475569;font-size:15px;line-height:1.6;">
        To accept this invitation, sign up or log in with
        <strong>${p.email}</strong> at the link below:
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${p.acceptUrl}"
           style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 32px;
                  border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
          Accept Invitation
        </a>
      </div>
      <p style="color:#94a3b8;font-size:13px;">
        If you didn't expect this invitation, you can safely ignore this email.
      </p>
    </div>
  `.trim();
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  const fn = httpsCallable(functions, 'cancelInvitationSecure');
  await fn({ invitationId });
}

export function subscribeToPendingInvitations(
  businessId: string,
  role: UserRole | undefined,
  onData: (invitations: InvitationDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const constraints = [
    where('businessId', '==', businessId),
    where('status', '==', 'pending'),
  ];

  if (role) {
    constraints.push(where('role', '==', role));
  }

  const q = query(collection(db, 'invitations'), ...constraints);

  return onSnapshot(
    q,
    (snapshot) => {
      const invitations = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }) as InvitationDoc)
        .sort((a, b) => {
          const aTime = a.createdAt && 'seconds' in a.createdAt ? a.createdAt.seconds : 0;
          const bTime = b.createdAt && 'seconds' in b.createdAt ? b.createdAt.seconds : 0;
          return bTime - aTime;
        });
      onData(invitations);
    },
    (error) => {
      console.error('[Invitations] Subscription error:', error);
      onError?.(error);
    }
  );
}
