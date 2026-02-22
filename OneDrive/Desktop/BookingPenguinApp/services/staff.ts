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
import { db, functions } from './firebase';
import type { StaffRateDoc } from '@/types';

export async function getStaffHourlyRate(
  businessId: string,
  staffId: string
): Promise<number> {
  const rateDocId = `${businessId}_${staffId}`;
  const snap = await getDoc(doc(db, 'staffRates', rateDocId));
  if (snap.exists()) {
    return (snap.data() as StaffRateDoc).hourlyRate || 0;
  }
  return 0;
}

export async function updateStaffRate(params: {
  businessId: string;
  staffId: string;
  staffName: string;
  hourlyRate: number;
}): Promise<void> {
  const fn = httpsCallable(functions, 'updateStaffRateSecure');
  await fn(params);
}

export async function deleteStaffRate(params: {
  businessId: string;
  staffId: string;
}): Promise<void> {
  const fn = httpsCallable(functions, 'deleteStaffRateSecure');
  await fn(params);
}

export function subscribeToStaffRates(
  businessId: string,
  onData: (rates: StaffRateDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'staffRates'),
    where('businessId', '==', businessId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const rates = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as StaffRateDoc[];
      onData(rates);
    },
    (error) => {
      console.error('[StaffRates] Subscription error:', error);
      onError?.(error);
    }
  );
}
