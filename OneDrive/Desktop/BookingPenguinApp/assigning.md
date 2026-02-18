# BookingPenguin — Staff Assignment, Job Completion & Payments

This document covers the complete system for assigning staff (and admins) to bookings, splitting work between multiple people, completing jobs, creating payment records, and the full payment confirmation lifecycle. It is designed so another developer can replicate the exact same behavior.

**Firebase Project:** `bookingsharks`
**Cloud Functions Region:** `us-central1`

---

## Table of Contents

1. [Booking Document Structure](#1-booking-document-structure)
2. [Assigning Staff to a Booking](#2-assigning-staff-to-a-booking)
3. [Admin Self-Assignment ("Assign to Me")](#3-admin-self-assignment)
4. [Removing Staff](#4-removing-staff)
5. [Adjustable Split Percentages](#5-adjustable-split-percentages)
6. [Payment Preview Calculator](#6-payment-preview-calculator)
7. [Staff Hourly Rates](#7-staff-hourly-rates)
8. [Marking a Job Complete](#8-marking-a-job-complete)
9. [Payment Creation (Staff)](#9-payment-creation)
10. [Admin Revenue](#10-admin-revenue)
11. [Payment Status Lifecycle](#11-payment-status-lifecycle)
12. [Staff Portal View](#12-staff-portal-view)
13. [Firestore Document Structures](#13-firestore-document-structures)
14. [Cloud Function Reference](#14-cloud-function-reference)
15. [Security Rules](#15-security-rules)
16. [Server-Side Validation](#16-server-side-validation)

---

## 1. Booking Document Structure

Every booking in the `bookings` collection has these fields related to staff assignment:

```typescript
{
  // --- Core booking fields (not assignment-related, included for context) ---
  businessId: string,
  serviceName: string,
  date: Timestamp | string,
  time: string,
  status: 'pending' | 'assigned' | 'accepted' | 'completed' | 'cancelled',
  estimatedTimeMinutes: number,       // Total job duration in minutes
  pricing: {
    basePrice: number,
    fieldCharges: number,
    extrasTotal: number,
    subtotal: number,
    taxRate: number,
    tax: number,
    total: number                     // Final price the client pays
  },
  customer: {
    firstName: string,
    lastName: string,
    email: string,
    phone: string
  },

  // --- Staff Assignment Fields ---
  assignedStaff: AssignedStaffEntry[],  // Array of all assigned people
  staffCount: number,                    // Length of assignedStaff array
  assignedTo: string,                    // Primary staff ID (first non-admin, or first entry)
  assignedToName: string,                // Primary staff display name
  assignedToType: 'admin' | null,        // Set to 'admin' ONLY for solo admin jobs
  assignedAt: Timestamp,                 // When staff was assigned

  // --- Completion Fields ---
  completedAt?: Timestamp,
  completedBy?: string,                  // Auth UID of who marked it complete
  completedByAdmin?: boolean
}
```

### The `AssignedStaffEntry` Object

Each entry in the `assignedStaff` array represents one person assigned to the job:

```typescript
interface AssignedStaffEntry {
  staffId: string;        // Firestore custom user document ID (NOT Auth UID)
  staffName: string;      // Display name
  splitPercent: number;   // What percentage of the job they are doing (1-100)
  isAdmin?: boolean;      // true if this person is an admin/owner (not a staff member)
}
```

### Key Rules

- `splitPercent` values across all entries must sum to exactly 100.
- When there is only 1 person assigned, `splitPercent` is always 100 and the split UI is hidden.
- The `isAdmin` flag determines whether this person generates a **staff payment** or **admin/company revenue** when the job completes.
- `assignedToType` is set to `'admin'` ONLY when a solo admin is assigned. For mixed teams it is `null`.
- `assignedTo` always points to the "primary" staff member (first non-admin, or first entry if all are admins).

---

## 2. Assigning Staff to a Booking

When the admin selects a staff member from the dropdown and clicks "Add":

### Flow

```
1. Validate: booking is not completed/cancelled
2. Validate: staff member is not already assigned
3. Build new assignedStaff array = existing entries + new entry
4. Recalculate equal splits across ALL entries
5. Save to Firestore via updateBookingSecure Cloud Function
6. Send notification to the newly assigned staff member
7. Refresh the booking modal
```

### Equal Split Recalculation

Every time staff are added or removed, splits are recalculated to be equal:

```javascript
const equalSplit = Math.floor(100 / newStaff.length);
let remainder = 100 - (equalSplit * newStaff.length);
newStaff.forEach((s, i) => {
  s.splitPercent = equalSplit + (i === 0 ? remainder : 0);
});
```

For example:
- 2 people: 50% / 50%
- 3 people: 34% / 33% / 33%

The first person gets any rounding remainder to guarantee the total is exactly 100.

### Status Transition

- If status was `pending`, it changes to `assigned`.
- If status was already `assigned` or `accepted`, it stays the same.

### Booking Update Payload

```javascript
await updateBookingSecure({
  bookingId: booking.id,
  updates: {
    assignedStaff: newStaffArray,
    staffCount: newStaffArray.length,
    assignedTo: primaryStaff.staffId,       // first non-admin
    assignedToName: primaryStaff.staffName,
    assignedToType: null,                    // null for mixed teams
    assignedAt: 'SERVER_TIMESTAMP',
    status: wasStatus === 'pending' ? 'assigned' : wasStatus
  }
});
```

### Notification

After assignment, a notification is created for the staff member:

```javascript
await createNotificationSecure({
  userId: staffId,
  title: 'New Job Assigned',
  message: `You have been assigned to ${serviceName} on ${date}`,
  type: 'booking_assigned',
  bookingId: booking.id,
  businessId: businessId
});
```

---

## 3. Admin Self-Assignment

The "Assign to Me" button lets the admin/owner assign themselves to the booking. There are two distinct scenarios:

### Scenario A: No One Assigned Yet (Solo Admin Job)

```javascript
await updateBookingSecure({
  bookingId: booking.id,
  updates: {
    assignedTo: customUserId,
    assignedToName: adminName,
    assignedToType: 'admin',               // THIS IS THE KEY FLAG
    assignedStaff: [{
      staffId: customUserId,
      staffName: adminName,
      splitPercent: 100,
      isAdmin: true
    }],
    staffCount: 1,
    assignedAt: 'SERVER_TIMESTAMP',
    status: 'accepted'                     // Skips 'assigned', goes straight to 'accepted'
  }
});
```

When this job completes, it creates **admin revenue** instead of a staff payment.

### Scenario B: Staff Already Assigned (Admin Joins the Team)

```javascript
// Admin is PREPENDED to the existing array
const newStaff = [
  { staffId: customUserId, staffName: adminName, splitPercent: 0, isAdmin: true },
  ...existingStaff
];

// Recalculate equal splits
const equalSplit = Math.floor(100 / newStaff.length);
let remainder = 100 - (equalSplit * newStaff.length);
newStaff.forEach((s, i) => {
  s.splitPercent = equalSplit + (i === 0 ? remainder : 0);
});

await updateBookingSecure({
  bookingId: booking.id,
  updates: {
    assignedStaff: newStaff,
    staffCount: newStaff.length,
    assignedTo: firstNonAdmin.staffId,     // Primary = first non-admin
    assignedToName: firstNonAdmin.staffName,
    assignedToType: null,                   // NOT 'admin' because it's a mixed team
    assignedAt: 'SERVER_TIMESTAMP',
    status: currentStatus === 'pending' ? 'assigned' : currentStatus
  }
});
```

### Important Behaviors

- If admin assigns themselves first, then staff is added later, the admin stays in the array with `isAdmin: true`.
- If staff is assigned first, then admin clicks "Assign to Me", the admin is added WITHOUT removing the existing staff.
- The `isAdmin` flag is preserved by the `updateBookingSecure` Cloud Function during sanitization.

---

## 4. Removing Staff

When the admin clicks the "X" button next to a staff member:

### Flow

```
1. Confirm with the user
2. Filter out the removed staff member from assignedStaff
3. Recalculate equal splits among remaining staff
4. Save to Firestore
5. Send 'Booking Unassigned' notification to removed staff
6. If no staff remain: set status back to 'pending', clear all assignment fields
```

### Edge Cases

- **Last person removed:** Status goes back to `pending`. All assignment fields are set to `null` (which the Cloud Function converts to `FieldValue.delete()`).
- **Admin removed from a mixed team:** Remaining staff keep their equal splits, `assignedToType` stays `null`.
- **Cannot remove on completed/cancelled bookings:** The remove button is hidden; function exits early with a toast.

### Booking Update When All Staff Removed

```javascript
await updateBookingSecure({
  bookingId: booking.id,
  updates: {
    assignedStaff: null,              // Firestore deletes the field
    staffCount: 0,
    assignedTo: null,
    assignedToName: null,
    assignedToType: null,
    assignedAt: null,
    status: 'pending'
  }
});
```

---

## 5. Adjustable Split Percentages

When multiple people are assigned, each entry shows a percentage input. The admin can manually adjust who does more work.

### How It Works

1. Admin changes one person's percentage (e.g., from 50% to 70%).
2. The remaining percentage (30%) is redistributed **proportionally** among the other staff.
3. All values are clamped to 1-99 (no one can be set to 0% or 100% in a multi-person job).
4. If rounding causes the total to not equal 100, the first "other" staff member absorbs the difference.
5. The UI re-renders immediately.
6. The save to Firestore is **debounced** (800ms) so rapid adjustments don't spam writes.

### Proportional Redistribution Logic

```javascript
function updateSplitPercent(staffId, newPercent) {
  const pct = Math.max(1, Math.min(99, parseInt(newPercent)));
  target.splitPercent = pct;

  const othersTotal = 100 - pct;
  const others = staff.filter(s => s.staffId !== staffId);
  const othersCurrentSum = others.reduce((sum, s) => sum + s.splitPercent, 0);

  if (othersCurrentSum > 0) {
    others.forEach(s => {
      s.splitPercent = Math.max(1, Math.round((s.splitPercent / othersCurrentSum) * othersTotal));
    });
  } else {
    const equalShare = Math.floor(othersTotal / others.length);
    others.forEach(s => { s.splitPercent = equalShare; });
  }

  // Fix rounding to guarantee exactly 100
  const totalNow = staff.reduce((sum, s) => sum + s.splitPercent, 0);
  if (totalNow !== 100 && others.length > 0) {
    others[0].splitPercent += (100 - totalNow);
  }
}
```

### Example

3-person job: Admin (34%), Staff A (33%), Staff B (33%)

Admin changes Staff A to 60%:
- Remaining = 40%
- Admin was 34, Staff B was 33. Their current sum = 67.
- Admin gets: round(34/67 * 40) = 20%
- Staff B gets: round(33/67 * 40) = 20%
- Total: 60 + 20 + 20 = 100

### Debounced Save

```javascript
clearTimeout(window._splitSaveTimer);
window._splitSaveTimer = setTimeout(async () => {
  await updateBookingSecure({
    bookingId: booking.id,
    updates: { assignedStaff: staff }
  });
}, 800);
```

---

## 6. Payment Preview Calculator

The booking modal shows a live payment preview whenever staff are assigned. This preview calculates what each person will be paid when the job completes.

### Logic

```
For each person in assignedStaff:
  splitMinutes = round(estimatedTimeMinutes * (splitPercent / 100))

  If isAdmin:
    → Show as "Company" (no payment, admin's work = company revenue)

  If NOT isAdmin (regular staff):
    → Fetch hourlyRate from staffRates collection
    → payment = (hourlyRate * splitMinutes) / 60
    → Add to totalStaffCost

businessProfit = pricing.total - totalStaffCost
```

### Display

The preview shows:
- Each staff member with their split percentage, time, hourly rate, and calculated pay.
- Admin entries show "Company" instead of a dollar amount.
- A total row: "Total Staff Cost: $X"
- A profit row: "Business Profit: $Y" (job price minus staff cost)

### When Preview is Hidden

- No staff assigned
- Admin-only assignment (1 person, isAdmin = true) — the entire job is company revenue, no payment preview needed.

---

## 7. Staff Hourly Rates

### Firestore Collection: `staffRates`

Each staff member's hourly rate is stored as a separate document.

**Document ID convention:** `{businessId}_{staffId}`

```typescript
// staffRates/{businessId}_{staffId}
{
  businessId: string,
  staffId: string,          // Firestore custom user document ID
  staffName: string,
  hourlyRate: number,       // Dollar amount per hour (0-10000)
  updatedAt: Timestamp,
  updatedBy: string         // Auth UID of admin who set the rate
}
```

### Reading the Rate (Client-Side)

```javascript
async function getStaffHourlyRate(businessId, staffId) {
  const rateDocId = `${businessId}_${staffId}`;
  const rateDoc = await db.collection('staffRates').doc(rateDocId).get();
  if (rateDoc.exists) {
    return rateDoc.data().hourlyRate || 0;
  }
  return 0;  // No rate set = $0/hr
}
```

### Setting the Rate (Cloud Function)

Admins set rates via the `updateStaffRateSecure` Cloud Function:

```
Parameters: { businessId, staffId, staffName, hourlyRate }
Authorization: Admin or Owner of the business
Validation: hourlyRate must be 0-10000
Action: Creates or overwrites the staffRates/{businessId}_{staffId} document
```

### Deleting a Rate (Cloud Function)

When a staff member leaves or is removed:

```
Function: deleteStaffRateSecure
Parameters: { businessId, staffId } or { businessId, deleteAll: true }
Authorization:
  - Single delete: admin/owner OR the staff member themselves (for "leave company")
  - Batch delete (deleteAll): owner only
```

---

## 8. Marking a Job Complete

Only bookings with status `accepted` can be completed. The admin clicks "Mark Complete" on the booking modal.

### Decision Tree

```
Is anyone assigned?
  NO → Just mark as completed, no payments created.

Is it a SOLO ADMIN job?
  (assignedStaff.length === 1 AND (isAdmin === true OR assignedToType === 'admin'))
  YES → Create ADMIN REVENUE record (full job price → company revenue)

Is it a MIXED or STAFF-ONLY job?
  YES → For each staff member in assignedStaff:
    Is this entry an admin (isAdmin === true)?
      YES → SKIP (admin's portion is company revenue, no explicit record needed)
      NO  → Create STAFF PAYMENT record
```

### The Complete Flow

```javascript
async function markBookingComplete() {
  // 1. Update booking status
  await updateBookingSecure({
    bookingId: booking.id,
    updates: {
      status: 'completed',
      completedAt: 'SERVER_TIMESTAMP',
      completedBy: auth.currentUser.uid,
      completedByAdmin: true
    }
  });

  // 2. Create payment/revenue records
  const assignedStaff = booking.assignedStaff || [];
  const isAdminOnlyJob = assignedStaff.length === 1 && assignedStaff[0].isAdmin;

  if (isAdminOnlyJob) {
    // Solo admin → company revenue
    await addCompanyRevenue(booking, adminId, adminName);
  } else {
    // Mixed/staff-only → payments for non-admin staff only
    const staffOnly = assignedStaff.filter(s => !s.isAdmin);

    for (const s of staffOnly) {
      const hourlyRate = await getStaffHourlyRate(businessId, s.staffId);
      const splitMinutes = Math.round(estimatedTimeMinutes * (s.splitPercent / 100));

      await createStaffPayment({
        ...booking,
        id: booking.id,
        _splitStaffId: s.staffId,
        _splitStaffName: s.staffName,
        _splitPercent: s.splitPercent,
        _splitMinutes: splitMinutes,
        _totalStaffOnJob: assignedStaff.length
      }, hourlyRate, s.staffName);
    }
  }

  // 3. Notify client and assigned staff
  // ...
}
```

### Example: Mixed Team Job

**Booking:** $500 cleaning job, 4 hours (240 minutes)
**Assigned:** Admin (40%), Staff A (35%), Staff B (25%)

| Person | Split % | Split Minutes | Hourly Rate | Payment |
|--------|---------|---------------|-------------|---------|
| Admin | 40% | 96 min | N/A | Company revenue (no payment) |
| Staff A | 35% | 84 min | $25/hr | $35.00 |
| Staff B | 25% | 60 min | $20/hr | $20.00 |

- Total staff cost: $55.00
- Business profit: $500 - $55 = $445.00

### Example: Solo Admin Job

**Booking:** $200 consultation, 2 hours
**Assigned:** Admin (100%)

- No staff payments created.
- Company revenue record: $200 (the full job amount).

### Example: Staff-Only Job

**Booking:** $300 cleaning, 3 hours (180 minutes)
**Assigned:** Staff A (50%), Staff B (50%)

| Person | Split % | Split Minutes | Hourly Rate | Payment |
|--------|---------|---------------|-------------|---------|
| Staff A | 50% | 90 min | $22/hr | $33.00 |
| Staff B | 50% | 90 min | $18/hr | $27.00 |

- Total staff cost: $60.00
- Business profit: $300 - $60 = $240.00

---

## 9. Payment Creation

When a non-admin staff member's payment is created at job completion, the client calls the `createStaffPaymentSecure` Cloud Function.

### Client-Side Wrapper (`data.js`)

```javascript
async function createStaffPayment(booking, hourlyRate, staffName) {
  const fn = firebase.functions().httpsCallable('createStaffPaymentSecure');
  const payload = {
    businessId: booking.businessId,
    bookingId: booking.id,
    hourlyRate: hourlyRate,
    staffName: staffName
  };

  // Multi-staff split metadata
  if (booking._splitStaffId) {
    payload.splitStaffId = booking._splitStaffId;
    payload.splitPercent = booking._splitPercent || 100;
    payload.splitMinutes = booking._splitMinutes || 0;
    payload.totalStaffOnJob = booking._totalStaffOnJob || 1;
  }

  const result = await fn(payload);
  return result.data.paymentId;
}
```

### Cloud Function: `createStaffPaymentSecure`

```
Parameters: {
  businessId: string,
  bookingId: string,
  hourlyRate: number,         // 0-10000
  staffName: string,
  splitStaffId?: string,      // Custom user doc ID for multi-staff
  splitPercent?: number,       // 1-100
  splitMinutes?: number,       // Calculated: estimatedTimeMinutes * (splitPercent / 100)
  totalStaffOnJob?: number     // Total people on the job
}

Authorization: Caller must be admin, owner, or staff of the business.

Calculation:
  effectiveMinutes = splitMinutes (if provided) OR booking.estimatedTimeMinutes
  amount = (hourlyRate * effectiveMinutes) / 60

Creates document in staffPayments collection with:
  - status: 'pending'
  - All booking metadata (service name, date, etc.)
  - Split metadata (splitPercent, splitMinutes, totalStaffOnJob)

Returns: { paymentId: string, amount: number }
```

---

## 10. Admin Revenue

When a solo admin completes a job, the full job price is recorded as company/admin revenue.

### Client-Side Wrapper (`data.js`)

```javascript
async function addCompanyRevenue(booking, completedByUserId, completedByName) {
  const fn = firebase.functions().httpsCallable('addCompanyRevenueSecure');
  const result = await fn({
    businessId: booking.businessId,
    bookingId: booking.id
  });
  return result.data.revenueId;
}
```

### Cloud Function: `addCompanyRevenueSecure`

```
Parameters: { businessId, bookingId }

Authorization: Admin or Owner only.

Action: Reads the booking, creates a companyRevenue document with:
  - jobId: bookingId
  - completedBy: caller's custom user doc ID
  - completedByName: caller's name
  - serviceName, serviceDate from the booking
  - jobAmount: booking.pricing.total
  - createdAt: serverTimestamp

Returns: { revenueId: string, amount: number }
```

### Admin Revenue Display

On the admin portal's Staff Payments page, there is a purple "Admin Revenue" KPI card that:
- Shows the total dollar amount from all `companyRevenue` records.
- Shows the count of admin-completed jobs.
- Has a "View Details" button that expands a collapsible list of all revenue records.
- Each record shows the service name, admin who completed it, date, amount, and a "View Job" link.

### When Is Admin Revenue Created?

ONLY for solo admin jobs. When an admin is part of a mixed team (admin + staff), the admin's portion is implicitly company revenue (no separate record is created). The explicit `companyRevenue` record is only needed when the admin did the entire job alone, because in that case there are no `staffPayments` records at all and the job's revenue needs to be tracked somewhere.

---

## 11. Payment Status Lifecycle

Staff payments follow a 3-step confirmation flow:

```
  pending ──→ awaiting_confirmation ──→ paid
     ↑                 │
     └─────────────────┘
       (staff reports "Not Received")
```

### Step 1: `pending` (Payment Created)

When the job is marked complete, the payment is created with `status: 'pending'`.

**What the admin sees:** An orange "Unpaid" badge and a "Mark Paid" button.
**What the staff sees:** A blue "Pending Payment" badge and text "Waiting for admin to mark as paid".

### Step 2: `awaiting_confirmation` (Admin Marks Paid)

Admin clicks "Mark Paid" → calls `markPaymentPaidSecure`:

```
Cloud Function: markPaymentPaidSecure
Parameters: { paymentId }
Authorization: Admin or Owner of the business
Action: Updates status to 'awaiting_confirmation', sets markedPaidAt timestamp
```

**What the admin sees:** A blue "Awaiting Confirmation" badge and text "Waiting for staff to confirm..."
**What the staff sees:** An amber "Confirm Required" badge (pulsing animation) with two buttons: "Confirm Received" and "Not Received".

### Step 3a: `paid` (Staff Confirms Receipt)

Staff clicks "Confirm Received" → calls `confirmPaymentReceivedSecure`:

```
Cloud Function: confirmPaymentReceivedSecure
Parameters: { paymentId }
Authorization: Only the staff member the payment belongs to (callerDoc.id === payment.staffId)
Precondition: status must be 'awaiting_confirmation'
Action: Updates status to 'paid', sets confirmedAt timestamp
```

The staff member also sends a notification to the business owner: "X confirmed receipt of payment: $Y for ServiceName".

**What the admin sees:** A green "Paid" badge with the confirmation date.
**What the staff sees:** A green "Confirmed" badge with the confirmation date.

### Step 3b: Back to `pending` (Staff Reports Not Received)

Staff clicks "Not Received" → calls `reportPaymentNotReceivedSecure`:

```
Cloud Function: reportPaymentNotReceivedSecure
Parameters: { paymentId }
Authorization: Only the staff member the payment belongs to
Precondition: status must be 'awaiting_confirmation'
Action: Resets status to 'pending', clears markedPaidAt and markedPaidBy
```

The staff member sends a notification to the business owner: "X reported they did not receive payment of $Y for ServiceName".

This restarts the cycle — the admin sees "Unpaid" again and can re-issue the payment.

---

## 12. Staff Portal View

Staff members see their payments under the "Payments" section in `staff.html`.

### KPI Cards (3 cards)

| Card | Filter | Shows |
|------|--------|-------|
| Pending Payment | `status === 'pending'` | Count and total $ waiting to be paid by admin |
| Awaiting Confirmation | `status === 'awaiting_confirmation'` | Count and total $ marked paid by admin, waiting for staff to confirm |
| Total Earned | `status === 'paid'` | Count and total $ of confirmed payments |

### Payment List

Each payment row shows:
- Service name
- Status badge (color-coded)
- Job date
- Duration, hourly rate
- If multi-staff job: "Split: X% of job"
- Payment amount (large, right-aligned)

### Action Buttons (per payment)

| Status | Buttons Shown |
|--------|--------------|
| `pending` | None (text: "Waiting for admin to mark as paid") |
| `awaiting_confirmation` | "Confirm Received" (green) + "Not Received" (red) |
| `paid` | None (text: "Confirmed [date]") |

### Data Fetching

```javascript
async function getMyPayments(businessId, staffId) {
  const snapshot = await db.collection('staffPayments')
    .where('businessId', '==', businessId)
    .where('staffId', '==', staffId)
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
```

---

## 13. Firestore Document Structures

### `staffPayments/{paymentId}`

```typescript
{
  businessId: string,
  bookingId: string,                // Links back to the original booking
  staffId: string,                  // Custom Firestore user doc ID of the staff member
  staffName: string,                // Display name (sanitized, max 100 chars)
  serviceName: string,
  serviceDate: Timestamp | string,
  estimatedTimeMinutes: number,     // The staff member's split minutes (NOT total job time)
  hourlyRate: number,               // $/hr at the time of completion
  amount: number,                   // Calculated: (hourlyRate * estimatedTimeMinutes) / 60

  // Status lifecycle
  status: 'pending' | 'awaiting_confirmation' | 'paid',
  markedPaidAt: Timestamp | null,   // When admin marked as paid
  markedPaidBy: string | null,      // Auth UID of the admin who marked paid
  confirmedAt: Timestamp | null,    // When staff confirmed receipt

  // Multi-staff split metadata
  splitPercent: number,             // 1-100 (100 for single-staff jobs)
  splitMinutes: number,             // Calculated: totalJobMinutes * (splitPercent / 100)
  totalStaffOnJob: number,          // Total people assigned (including admins)

  createdAt: Timestamp
}
```

### `staffRates/{businessId}_{staffId}`

```typescript
{
  businessId: string,
  staffId: string,
  staffName: string,
  hourlyRate: number,       // 0-10000
  updatedAt: Timestamp,
  updatedBy: string         // Auth UID of admin who set the rate
}
```

### `companyRevenue/{revenueId}`

```typescript
{
  businessId: string,
  jobId: string,            // The booking ID
  completedBy: string,      // Custom user doc ID of the admin who completed the job
  completedByName: string,
  serviceName: string,
  serviceDate: Timestamp | string,
  jobAmount: number,        // booking.pricing.total (the full job price)
  createdAt: Timestamp
}
```

---

## 14. Cloud Function Reference

All functions are HTTPS Callable, region `us-central1`.

| Function | Parameters | Authorization | Purpose |
|----------|-----------|---------------|---------|
| `updateBookingSecure` | `{ bookingId, updates }` | Admin/Owner: full access. Staff: own bookings. Client: cancel only. | Updates a booking (including `assignedStaff`). Validates split totals, preserves `isAdmin` flag. |
| `createStaffPaymentSecure` | `{ businessId, bookingId, hourlyRate, staffName, splitStaffId?, splitPercent?, splitMinutes?, totalStaffOnJob? }` | Admin, Owner, or Staff of the business | Creates a staff payment record when a job is completed |
| `addCompanyRevenueSecure` | `{ businessId, bookingId }` | Admin or Owner only | Records company revenue for admin-completed jobs |
| `markPaymentPaidSecure` | `{ paymentId }` | Admin or Owner of the payment's business | Moves payment to `awaiting_confirmation` |
| `confirmPaymentReceivedSecure` | `{ paymentId }` | Only the staff member the payment belongs to | Moves payment to `paid` |
| `reportPaymentNotReceivedSecure` | `{ paymentId }` | Only the staff member the payment belongs to | Resets payment to `pending` |
| `updateStaffRateSecure` | `{ businessId, staffId, staffName, hourlyRate }` | Admin or Owner | Creates/updates hourly rate |
| `deleteStaffRateSecure` | `{ businessId, staffId } or { businessId, deleteAll: true }` | Admin/Owner (single). Owner only (batch). Staff can delete own on leave. | Deletes hourly rate document(s) |

---

## 15. Security Rules

All three collections block direct client writes. Reads are limited to business members.

### `staffPayments`

```javascript
match /staffPayments/{paymentId} {
  allow read: if isSignedIn() && isMemberOfBusiness(resource.data.businessId);
  allow create, update, delete: if false;
  // All writes via: createStaffPaymentSecure, markPaymentPaidSecure,
  // confirmPaymentReceivedSecure, reportPaymentNotReceivedSecure
}
```

### `staffRates`

```javascript
match /staffRates/{rateId} {
  allow read: if isSignedIn() && isMemberOfBusiness(resource.data.businessId);
  allow create, update, delete: if false;
  // All writes via: updateStaffRateSecure, deleteStaffRateSecure
}
```

### `companyRevenue`

```javascript
match /companyRevenue/{revenueId} {
  allow read: if isSignedIn() && isMemberOfBusiness(resource.data.businessId);
  allow create, update, delete: if false;
  // All writes via: addCompanyRevenueSecure
}
```

### `bookings` (relevant subset)

```javascript
match /bookings/{bookingId} {
  allow read: if isSignedIn() && (
    isMemberOfBusiness(resource.data.businessId) ||
    resource.data.clientId == request.auth.uid ||
    resource.data.createdBy == request.auth.uid
  );
  allow create, update, delete: if false;
  // All writes via: updateBookingSecure, createBookingSecure
}
```

---

## 16. Server-Side Validation

The `updateBookingSecure` Cloud Function performs these validations on the `assignedStaff` array:

### Max Staff per Booking

```javascript
if (updates.assignedStaff.length > 10) {
  throw new HttpsError('invalid-argument',
    'Cannot assign more than 10 staff to a single booking.');
}
```

### Split Percentage Total

```javascript
const totalSplit = updates.assignedStaff.reduce(
  (sum, s) => sum + (s.splitPercent || 0), 0
);
if (updates.assignedStaff.length > 0 && (totalSplit < 98 || totalSplit > 102)) {
  throw new HttpsError('invalid-argument',
    `Split percentages must sum to ~100% (got ${totalSplit}%).`);
}
```

A tolerance of 98-102 is allowed to account for rounding in the client-side calculations.

### Entry Sanitization

Each entry is sanitized server-side:

```javascript
updates.assignedStaff = updates.assignedStaff.map(s => {
  const entry = {
    staffId: String(s.staffId || '').substring(0, 100),
    staffName: String(s.staffName || 'Staff')
      .replace(/<[^>]*>/g, '')         // Strip HTML tags
      .substring(0, 100),
    splitPercent: Math.max(0, Math.min(100, parseInt(s.splitPercent) || 0))
  };
  if (s.isAdmin === true) entry.isAdmin = true;   // PRESERVES the admin flag
  return entry;
});
```

The `isAdmin` flag is only added if explicitly `true`. It is never set to `false` — it is simply omitted for non-admin staff. This means:
- `entry.isAdmin === true` → admin
- `entry.isAdmin === undefined` → regular staff

### Immutable Fields

These fields are stripped from any update, preventing clients from tampering with them:

```javascript
const immutableFields = ['businessId', 'createdAt', 'createdBy'];
immutableFields.forEach(f => delete sanitizedUpdates[f]);
```

### Null → Delete

Any field set to `null` in the update is converted to `FieldValue.delete()` on the server, which removes the field from the Firestore document rather than storing a null.

---

## Key Implementation Notes for Mobile App

1. **User IDs:** `staffId` in `assignedStaff` and `staffPayments` is the **custom Firestore document ID** from the `users` collection (stored in `AsyncStorage` as `customUserId`), NOT the Firebase Auth UID. The Auth UID is used for `completedBy`, `markedPaidBy`, and security rule checks.

2. **All writes go through Cloud Functions.** The mobile app should never write directly to `staffPayments`, `staffRates`, `companyRevenue`, or `bookings`. Always use the HTTPS Callable functions.

3. **Split calculation is purely client-side.** The `splitMinutes` value is calculated on the client (`estimatedTimeMinutes * splitPercent / 100`) and passed to the Cloud Function. The server does not recalculate it.

4. **Payment amount is calculated server-side.** The Cloud Function calculates `amount = (hourlyRate * effectiveMinutes) / 60` to prevent client-side tampering with the payment amount.

5. **Real-time listeners are optional for payments.** The web app uses a one-time fetch (`getStaffPayments`, `getMyPayments`) rather than `onSnapshot` for payments. A real-time listener can be added but is not required.

6. **The `_splitStaffId`, `_splitPercent`, `_splitMinutes`, `_totalStaffOnJob` prefixed fields** are temporary client-side properties attached to the booking object before calling `createStaffPayment()`. They are NOT stored in Firestore. They are simply a way to pass split metadata through the existing function signature.
