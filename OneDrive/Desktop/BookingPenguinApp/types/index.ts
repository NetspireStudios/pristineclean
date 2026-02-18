import { Timestamp } from 'firebase/firestore';

// ── User & Membership ──────────────────────────────────────────────────────

export type UserRole = 'owner' | 'admin' | 'staff' | 'client';

export interface Membership {
  businessId: string;
  role: UserRole;
  status: 'active' | 'inactive' | 'pending';
  joinedAt?: Timestamp | string;
}

export interface AuthUids {
  password?: string;
  google?: string;
}

export interface UserDoc {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  photoUrl?: string;
  authUids: AuthUids;
  memberships: Membership[];
  emailVerified?: boolean;
  emailVerifiedAt?: Timestamp;
  aiAssistantEnabled?: boolean;
  expoPushToken?: string;
  createdAt?: Timestamp;
}

export interface UserBusinessMap {
  businessIds: string[];
  userId: string | null;
}

// ── Business ───────────────────────────────────────────────────────────────

export interface BusinessAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface AdminSeats {
  used: number;
  limit: number;
}

export interface BusinessDoc {
  id: string;
  name: string;
  businessName?: string;
  email?: string;
  phone?: string;
  address?: BusinessAddress;
  ownerId: string;
  logoUrl?: string;
  adminSeats?: AdminSeats;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// ── Booking ────────────────────────────────────────────────────────────────

export interface BookingCustomer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  userId?: string | null;
}

export interface BookingPricing {
  basePrice: number;
  fieldCharges: number;
  extrasTotal: number;
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
}

export type BookingStatus =
  | 'pending'
  | 'assigned'
  | 'accepted'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface AssignedStaffEntry {
  staffId: string;
  staffName: string;
  splitPercent: number;
  isAdmin?: boolean;
}

export interface BookingDoc {
  id: string;
  businessId: string;
  serviceId?: string | null;
  serviceName: string;
  serviceDescription?: string;
  date: string;
  time?: string | null;
  customer: BookingCustomer;
  address?: BookingAddress | string | null;
  pricing?: BookingPricing | null;
  formResponses?: Record<string, unknown> | null;
  selectedExtras?: Array<{ name: string; price: number }> | null;
  estimatedTimeMinutes?: number | null;
  notes?: string;
  customerNotes?: string;
  internalNotes?: string;
  assignedTo?: string | null;
  assignedToName?: string | null;
  assignedToType?: 'admin' | null;
  assignedStaff?: AssignedStaffEntry[];
  staffCount?: number;
  assignedAt?: Timestamp | null;
  completedAt?: Timestamp;
  completedBy?: string;
  completedByAdmin?: boolean;
  clientId?: string | null;
  createdBy: string;
  status: BookingStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface BookingAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

// ── Service ────────────────────────────────────────────────────────────────

export interface ServiceDoc {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  isActive: boolean;
  basePrice: number;
  duration: number;
  formFields?: FormField[];
  extras?: ServiceExtra[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FormField {
  id: string;
  label: string;
  fieldType: 'number' | 'text' | 'dropdown' | 'checkbox' | 'multiselect';
  options?: string[];
  required: boolean;
  order: number;
  hasPricing: boolean;
  pricingConfig?: {
    pricePerUnit?: number;
    priceWhenChecked?: number;
    optionPrices?: Record<string, number>;
    pricePerSelection?: number;
  };
  hasTimeImpact: boolean;
  timeConfig?: {
    timePerUnit?: number;
    timeWhenChecked?: number;
    optionTimes?: Record<string, number>;
    timePerSelection?: number;
  };
}

export interface ServiceExtra {
  id: string;
  label: string;
  price: number;
}

// ── Staff Payment ──────────────────────────────────────────────────────────

export type PaymentStatus = 'pending' | 'awaiting_confirmation' | 'paid';

export interface StaffPaymentDoc {
  id: string;
  businessId: string;
  bookingId: string;
  staffId: string;
  staffName: string;
  serviceName: string;
  serviceDate: string;
  estimatedTimeMinutes: number;
  hourlyRate: number;
  amount: number;
  status: PaymentStatus;
  markedPaidAt?: Timestamp | null;
  markedPaidBy?: string | null;
  confirmedAt?: Timestamp | null;
  splitPercent: number;
  splitMinutes: number;
  totalStaffOnJob: number;
  createdAt?: Timestamp;
}

// ── Staff Rate ─────────────────────────────────────────────────────────────

export interface StaffRateDoc {
  businessId: string;
  staffId: string;
  staffName: string;
  hourlyRate: number;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

// ── Notification ───────────────────────────────────────────────────────────

export type NotificationType =
  | 'general'
  | 'booking_created'
  | 'booking_assigned'
  | 'booking_accepted'
  | 'booking_completed'
  | 'booking_declined'
  | 'booking_cancelled'
  | 'booking_status'
  | 'payment'
  | 'payment_confirmed'
  | 'payment_received'
  | 'payment_sent'
  | 'payment_disputed'
  | 'chat_message'
  | 'member_joined'
  | 'admin_removed'
  | 'staff_left'
  | 'admin_left'
  | 'client_left';

export interface NotificationDoc {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  bookingId?: string | null;
  businessId?: string | null;
  read: boolean;
  readAt?: Timestamp | null;
  createdAt?: Timestamp;
}

// ── Invitation ─────────────────────────────────────────────────────────────

export interface InvitationDoc {
  id: string;
  email: string;
  role: UserRole;
  businessId: string;
  businessName: string;
  invitedBy: string;
  inviterName: string;
  status: 'pending' | 'accepted' | 'cancelled';
  token: string;
  createdAt?: Timestamp;
  expiresAt?: Date | Timestamp;
}

// ── Chat ───────────────────────────────────────────────────────────────────

export interface ChatParticipantDetail {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  photoUrl: string | null;
}

export interface ChatDoc {
  id: string;
  businessId: string;
  type?: 'team';
  name?: string;
  createdBy?: string;
  participants: string[];
  admins?: string[];
  participantDetails?: Record<string, ChatParticipantDetail>;
  participantNames?: Record<string, string>;
  lastMessage?: string | { text?: string; senderId?: string | null; senderName?: string; timestamp?: any; deleted?: boolean };
  lastMessageAt?: Timestamp | number;
  unreadCounts?: Record<string, number>;
  clearedAt?: Record<string, Timestamp>;
  createdAt?: Timestamp;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt?: Timestamp;
}

// ── Invoice ────────────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceDoc {
  id: string;
  invoiceNumber: string;
  businessId: string;
  bookingId: string;
  clientId?: string | null;
  business: {
    name: string;
    email: string;
    phone: string;
    address?: BusinessAddress;
  };
  client: {
    name: string;
    email: string;
    phone: string;
    address?: BookingAddress;
  };
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  serviceDate?: string | null;
  invoiceDate: string;
  dueDate: string;
  status: 'unpaid' | 'paid';
  paidAt?: Timestamp | null;
  paymentMethod?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// ── Company Revenue ────────────────────────────────────────────────────────

export interface CompanyRevenueDoc {
  id: string;
  businessId: string;
  bookingId: string;
  jobId?: string;
  completedBy?: string;
  completedByName?: string;
  amount: number;
  jobAmount?: number;
  serviceName: string;
  serviceDate: string;
  createdAt?: Timestamp;
}

// ── Business Member (returned by getBusinessMembers) ───────────────────────

export interface BusinessMember {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  photoUrl: string | null;
  authUid: string | null;
  membership: Membership;
}
