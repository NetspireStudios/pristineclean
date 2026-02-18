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
import type { BookingDoc } from '@/types';

/**
 * Subscribe to all bookings for a business, ordered by date descending.
 * Returns an unsubscribe function.
 */
export function subscribeToBookings(
  businessId: string,
  onData: (bookings: BookingDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'bookings'),
    where('businessId', '==', businessId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const bookings: BookingDoc[] = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }) as BookingDoc)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      onData(bookings);
    },
    (error) => {
      console.error('[Bookings] Subscription error:', error);
      onError?.(error);
    }
  );
}

/**
 * Get a single booking by ID.
 */
export async function getBooking(bookingId: string): Promise<BookingDoc | null> {
  const snap = await getDoc(doc(db, 'bookings', bookingId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as BookingDoc;
}

/**
 * Create a new booking via Cloud Function.
 */
export async function createBooking(
  data: Record<string, unknown>
): Promise<{ bookingId: string }> {
  const fn = httpsCallable<Record<string, unknown>, { bookingId: string }>(
    functions,
    'createBookingSecure'
  );
  const result = await fn(data);
  return result.data;
}

/**
 * Update an existing booking via Cloud Function.
 */
export async function updateBooking(
  bookingId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const fn = httpsCallable(functions, 'updateBookingSecure');
  await fn({ bookingId, updates });
}

/**
 * Delete a booking via Cloud Function.
 */
export async function deleteBooking(bookingId: string): Promise<void> {
  const fn = httpsCallable(functions, 'deleteBookingSecure');
  await fn({ bookingId });
}

/**
 * Create a staff payment record for a single staff member on a completed job.
 */
export async function createStaffPayment(params: {
  businessId: string;
  bookingId: string;
  hourlyRate: number;
  staffName: string;
  splitStaffId?: string;
  splitPercent?: number;
  splitMinutes?: number;
  totalStaffOnJob?: number;
}): Promise<{ paymentId: string; amount: number }> {
  const fn = httpsCallable<typeof params, { paymentId: string; amount: number }>(
    functions,
    'createStaffPaymentSecure'
  );
  const result = await fn(params);
  return result.data;
}

/**
 * Add company revenue entry for admin-completed (solo) jobs.
 */
export async function addCompanyRevenue(params: {
  businessId: string;
  bookingId: string;
}): Promise<{ revenueId: string; amount: number }> {
  const fn = httpsCallable<typeof params, { revenueId: string; amount: number }>(
    functions,
    'addCompanyRevenueSecure'
  );
  const result = await fn(params);
  return result.data;
}

/**
 * Create notification for a user.
 */
export async function createNotification(params: {
  userId: string;
  title: string;
  message: string;
  type: string;
  bookingId?: string;
  businessId?: string;
}): Promise<void> {
  const fn = httpsCallable(functions, 'createNotificationSecure');
  await fn(params);
}

/**
 * Filter bookings by a specific date string (YYYY-MM-DD).
 */
export function filterBookingsByDate(
  bookings: BookingDoc[],
  date: string
): BookingDoc[] {
  return bookings.filter((b) => b.date === date);
}

/**
 * Get status display info (label + color key).
 */
export function getStatusInfo(status: string): { label: string; colorKey: 'warning' | 'tint' | 'success' | 'danger' | 'textMuted' } {
  switch (status) {
    case 'pending':
      return { label: 'Pending', colorKey: 'warning' };
    case 'assigned':
      return { label: 'Assigned', colorKey: 'tint' };
    case 'accepted':
      return { label: 'Accepted', colorKey: 'tint' };
    case 'confirmed':
      return { label: 'Confirmed', colorKey: 'tint' };
    case 'in_progress':
      return { label: 'In Progress', colorKey: 'tint' };
    case 'completed':
      return { label: 'Completed', colorKey: 'success' };
    case 'cancelled':
      return { label: 'Cancelled', colorKey: 'danger' };
    default:
      return { label: status || 'Unknown', colorKey: 'textMuted' };
  }
}
