import {
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import type { BusinessDoc, BusinessMember, ServiceDoc } from '@/types';

/**
 * Get business document by ID.
 */
export async function getBusiness(businessId: string): Promise<BusinessDoc | null> {
  const snap = await getDoc(doc(db, 'businesses', businessId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as BusinessDoc;
}

/**
 * Get business members filtered by role using Cloud Function.
 */
export async function getBusinessMembers(
  businessId: string,
  role?: string
): Promise<BusinessMember[]> {
  const fn = httpsCallable<
    { businessId: string; role?: string },
    { users: BusinessMember[] }
  >(functions, 'getBusinessMembers');

  const result = await fn({ businessId, role });
  return result.data.users;
}

/**
 * Subscribe to services for a business in real-time.
 */
export function subscribeToServices(
  businessId: string,
  onData: (services: ServiceDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'services'),
    where('businessId', '==', businessId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const services: ServiceDoc[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ServiceDoc[];
      onData(services);
    },
    (error) => {
      console.error('[Services] Subscription error:', error);
      onError?.(error);
    }
  );
}

/**
 * Update business settings via Cloud Function.
 */
export async function updateBusiness(
  businessId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const fn = httpsCallable(functions, 'updateBusinessSecure');
  await fn({ businessId, updates });
}

/**
 * Subscribe to a single business document in real-time.
 */
export function subscribeToBusiness(
  businessId: string,
  onData: (business: BusinessDoc) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'businesses', businessId),
    (snap) => {
      if (snap.exists()) {
        onData({ id: snap.id, ...snap.data() } as BusinessDoc);
      }
    },
    (error) => {
      console.error('[Business] Subscription error:', error);
      onError?.(error);
    }
  );
}

// ── Service CRUD ─────────────────────────────────────────────────────────────

export async function createService(
  data: {
    businessId: string;
    name: string;
    description?: string;
    basePrice?: number;
    duration?: number;
    estimatedTime?: number;
    isActive?: boolean;
    formFields?: unknown[];
    fields?: unknown[];
    extras?: unknown[];
  }
): Promise<string> {
  const fn = httpsCallable<typeof data, { serviceId: string }>(
    functions,
    'createServiceSecure'
  );
  const result = await fn(data);
  return result.data.serviceId;
}

export async function updateService(
  serviceId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const fn = httpsCallable(functions, 'updateServiceSecure');
  await fn({ serviceId, updates });
}

export async function deleteService(serviceId: string): Promise<void> {
  const fn = httpsCallable(functions, 'deleteServiceSecure');
  await fn({ serviceId });
}

export async function setActiveService(
  businessId: string,
  serviceId: string
): Promise<void> {
  const fn = httpsCallable(functions, 'setActiveServiceSecure');
  await fn({ businessId, serviceId });
}
