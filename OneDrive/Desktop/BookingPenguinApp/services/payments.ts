import {
  collection,
  query,
  where,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import type { StaffPaymentDoc, CompanyRevenueDoc } from '@/types';

export function subscribeToPayments(
  businessId: string,
  onData: (payments: StaffPaymentDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'staffPayments'),
    where('businessId', '==', businessId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const payments = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }) as StaffPaymentDoc)
        .sort((a, b) => {
          const aTime = a.createdAt && 'seconds' in a.createdAt ? a.createdAt.seconds : 0;
          const bTime = b.createdAt && 'seconds' in b.createdAt ? b.createdAt.seconds : 0;
          return bTime - aTime;
        });
      onData(payments);
    },
    (error) => {
      console.error('[Payments] Subscription error:', error);
      onError?.(error);
    }
  );
}

export async function markPaymentPaid(paymentId: string): Promise<void> {
  const fn = httpsCallable(functions, 'markPaymentPaidSecure');
  await fn({ paymentId });
}

export async function confirmPaymentReceived(paymentId: string): Promise<void> {
  const fn = httpsCallable(functions, 'confirmPaymentReceivedSecure');
  await fn({ paymentId });
}

export async function reportPaymentNotReceived(paymentId: string): Promise<void> {
  const fn = httpsCallable(functions, 'reportPaymentNotReceivedSecure');
  await fn({ paymentId });
}

export function subscribeToRevenue(
  businessId: string,
  onData: (revenue: CompanyRevenueDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'companyRevenue'),
    where('businessId', '==', businessId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const revenue = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }) as CompanyRevenueDoc)
        .sort((a, b) => (b.serviceDate || '').localeCompare(a.serviceDate || ''));
      onData(revenue);
    },
    (error) => {
      console.error('[Revenue] Subscription error:', error);
      onError?.(error);
    }
  );
}

export function getPaymentStatusInfo(status: string): {
  label: string;
  color: string;
  bgColor: string;
} {
  switch (status) {
    case 'pending':
      return { label: 'Pending', color: '#f59e0b', bgColor: '#fffbeb' };
    case 'awaiting_confirmation':
      return { label: 'Awaiting Confirmation', color: '#2563eb', bgColor: '#eff6ff' };
    case 'paid':
      return { label: 'Paid', color: '#22c55e', bgColor: '#f0fdf4' };
    default:
      return { label: status || 'Unknown', color: '#94a3b8', bgColor: '#f8fafc' };
  }
}
