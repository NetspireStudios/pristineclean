# BookingPenguin — Client Portal & Booking Form

This document covers the client-facing dashboard (`client.html`), the public booking form (`booking.html`), and how clients interact with the system. It is designed so another developer can replicate the exact same behavior in a mobile app.

**Firebase Project:** `bookingsharks`
**Cloud Functions Region:** `us-central1`

---

## Table of Contents

1. [Client Dashboard Overview](#1-client-dashboard-overview)
2. [Authentication and Initialization](#2-authentication-and-initialization)
3. [Loading Client Bookings](#3-loading-client-bookings)
4. [Stats Calculation](#4-stats-calculation)
5. [Booking Display and Filtering](#5-booking-display-and-filtering)
6. [Booking Detail Modal](#6-booking-detail-modal)
7. [Booking Cancellation](#7-booking-cancellation)
8. [The Public Booking Form](#8-the-public-booking-form)
9. [Client Settings](#9-client-settings)
10. [Business Switcher](#10-business-switcher)
11. [Real-Time Systems](#11-real-time-systems)
12. [Firestore Collections Used](#12-firestore-collections-used)
13. [Booking Document Structure](#13-booking-document-structure)

---

## 1. Client Dashboard Overview

The client portal is a single-page dashboard at `/client`. It shows the client their bookings for a specific business.

### Layout

```
┌──────────────────────────────────────────────────────┐
│  Header: Business Name | Theme Toggle | Chat | Bell  │
│          Notifications | Settings | Profile | Logout │
├──────────────────────────────────────────────────────┤
│  Welcome, [First Name]!                              │
├──────────────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │
│  │ Total  │ │Upcoming│ │Complete│ │Pending │       │
│  │   12   │ │   3    │ │   8    │ │   1    │       │
│  └────────┘ └────────┘ └────────┘ └────────┘       │
├──────────────────────────────────────────────────────┤
│  [All] [Upcoming] [Completed] [Cancelled]  Filters  │
├──────────────────────────────────────────────────────┤
│  February 16, 2026  TODAY                            │
│  ┌─ Cleaning Service ──── Confirmed ──── $350.00 ──┐│
│  │  10:00 AM • John Doe           One-time          ││
│  └──────────────────────────────────────────────────┘│
│  February 10, 2026                                   │
│  ┌─ Window Wash ────────── Completed ──── $150.00 ─┐│
│  │  2:00 PM • Sarah M.            One-time          ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

### Components

| Component | Description |
|-----------|-------------|
| **Stats Cards** | 4 KPI cards: Total, Upcoming, Completed, Pending |
| **Filter Tabs** | All, Upcoming, Completed, Cancelled |
| **Bookings List** | Booking cards grouped by date, sorted newest first |
| **Booking Detail Modal** | Full booking details with cancel/rebook options |
| **Settings Modal** | Account Info tab and Workspace tab |
| **Chat Panel** | Injected via `getChatPanelHTML()` from `chat.js` |
| **Notification Panel** | Injected via `getNotificationPanelHTML()` |

---

## 2. Authentication and Initialization

### Init Flow

```
1. Show loading spinner
2. Start 20-second timeout (shows error UI if loading takes too long)
3. Call guardDashboard('client')
   → Waits for Firebase auth state
   → Validates user is logged in
   → Reads context from localStorage/sessionStorage
   → Verifies role is 'client'
   → Returns { user, context, profile, customUserId }
4. Call ensureBusinessMap()
   → Ensures the userBusinessMap document exists for cross-tenant isolation
5. Store user, context, profile in page-level variables
6. Set window.currentUser and window.context (for chat system)
7. Update UI: business name, user name, user email
8. Call loadMyBookings()
9. Hide loading, show dashboard
10. Initialize chat panel (getChatPanelHTML() + initChat())
11. Initialize notification panel
```

### The `guardDashboard()` Function

This is the auth guard that protects all dashboard pages. It:

1. Waits for `firebase.auth().onAuthStateChanged` to fire.
2. If no user → redirect to `/login`.
3. Reads `getContext()` from `localStorage` (or `sessionStorage` fallback).
4. If no context → redirect to `/login`.
5. Validates that `context.role` matches the required role (`'client'`).
6. Loads the user's Firestore profile via `findUserByEmail(user.email)`.
7. Returns `{ user, context, profile, customUserId }`.
8. Has a 15-second timeout — if auth check doesn't complete, rejects.

### Context Object

The context is stored in `localStorage` under the key `bookingpenguin_context`:

```typescript
{
  businessId: string,       // The business the client is viewing
  businessName: string,     // Display name of the business
  role: 'client',           // Always 'client' on client.html
  customUserId: string      // Firestore custom user document ID
}
```

On mobile, use `AsyncStorage` instead of `localStorage`.

---

## 3. Loading Client Bookings

Bookings are fetched **once** (not a real-time listener). The client sees only their own bookings for the current business.

### Firestore Query

```javascript
const snapshot = await db.collection('bookings')
  .where('businessId', '==', currentContext.businessId)
  .where('clientId', '==', currentUser.uid)
  .orderBy('date', 'desc')
  .get();

allBookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
```

### Key Points

- `clientId` is the **Firebase Auth UID** (`auth.currentUser.uid`), NOT the custom Firestore doc ID.
- Results are sorted by `date` descending (newest first).
- All bookings are loaded at once (no pagination).
- After loading, `updateStats()` and `renderBookings()` are called.

### Refreshing Bookings

Bookings are reloaded by calling `loadMyBookings()` again after actions like cancellation. There is no real-time `onSnapshot` listener on bookings.

---

## 4. Stats Calculation

Four stats are computed from the loaded bookings:

```javascript
const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

const stats = {
  total: allBookings.length,
  upcoming: allBookings.filter(b =>
    b.date >= today &&
    b.status !== 'cancelled' &&
    b.status !== 'completed'
  ).length,
  completed: allBookings.filter(b => b.status === 'completed').length,
  pending: allBookings.filter(b => b.status === 'pending').length
};
```

| Stat | Description |
|------|-------------|
| **Total** | All bookings for this business, any status |
| **Upcoming** | Future date AND not cancelled/completed |
| **Completed** | Status is `completed` |
| **Pending** | Status is `pending` (awaiting admin confirmation) |

---

## 5. Booking Display and Filtering

### Filter Tabs

| Tab | Filter Logic |
|-----|-------------|
| All | No filter — shows everything |
| Upcoming | `date >= today && status !== 'cancelled' && status !== 'completed'` |
| Completed | `status === 'completed'` |
| Cancelled | `status === 'cancelled'` |

### Grouping and Sorting

1. Filtered bookings are grouped by `date` (YYYY-MM-DD string).
2. Date groups are sorted **newest first** (`b.localeCompare(a)`).
3. Within each date, bookings are sorted: completed ones pushed to the end, otherwise sorted by `time`.

### Booking Card

Each card shows:
- **Service name** (left)
- **Status badge** (color-coded, next to service name)
- **Time** (e.g., "10:00 AM")
- **Assigned staff name** (if assigned)
- **Total price** (right side, bold)
- **Frequency** (right side, small text: "One-time" or "Weekly", etc.)
- **Date header** with "TODAY" label if the date matches today

### Status Colors

| Status | Badge Color | Left Border Color |
|--------|------------|-------------------|
| `pending` | Red | Red |
| `assigned` | Yellow | Yellow |
| `accepted` | Blue | Blue |
| `completed` | Green | Green |
| `cancelled` | Gray | Gray |

### Status Labels (Client-Friendly)

| Internal Status | Client-Facing Label |
|----------------|---------------------|
| `pending` | Pending Confirmation |
| `assigned` | Staff Assigned |
| `accepted` | Confirmed |
| `completed` | Completed |
| `cancelled` | Cancelled |

---

## 6. Booking Detail Modal

Clicking a booking card opens a detail modal showing:

| Section | Content |
|---------|---------|
| **Status Badge** | Color-coded badge at the top |
| **Customer Info** | Name, email, phone |
| **Service Info** | Service name, date/time, frequency |
| **Address** | Street, city, province, postal code |
| **Form Responses** | Key-value pairs from the booking form fields |
| **Customer Notes** | Free-text notes the client added |
| **Pricing Breakdown** | Base price, service options, extras, subtotal, tax, total |
| **Estimated Time** | Hours and minutes |
| **Assigned Staff** | Staff name(s) if assigned |

### Action Buttons

| Button | Shown When | Action |
|--------|-----------|--------|
| Cancel Booking | Status is `pending` or `assigned` | Calls `cancelBooking()` |
| Rebook | Any status | Navigates to `/booking?business={id}&service={serviceId}` |

The Cancel button is **hidden** for `accepted`, `completed`, and `cancelled` bookings.

---

## 7. Booking Cancellation

### Client-Side

```javascript
async function cancelBooking() {
  if (!confirm('Are you sure you want to cancel this booking?')) return;

  await updateBooking(currentBooking.id, {
    status: 'cancelled',
    cancelledAt: 'SERVER_TIMESTAMP',
    cancelledBy: currentUser.uid
  });

  showToast('Booking cancelled', 'success');
  closeBookingModal();
  await loadMyBookings(); // Refresh the list
}
```

`updateBooking()` calls the `updateBookingSecure` Cloud Function.

### Server-Side Enforcement

The `updateBookingSecure` Cloud Function enforces that clients can ONLY:
- Set `status` to `'cancelled'`
- Set `cancelledAt` and `cancelledBy`

If a client tries to modify any other field, the function throws `permission-denied`.

```javascript
// In updateBookingSecure:
if (role === 'client') {
  const allowedClientFields = ['status', 'cancelledAt', 'cancelledBy'];
  const hasDisallowed = updateKeys.some(k => !allowedClientFields.includes(k));
  if (hasDisallowed || updates.status !== 'cancelled') {
    throw new HttpsError('permission-denied', 'Clients can only cancel bookings.');
  }
}
```

---

## 8. The Public Booking Form

The booking form lives at `/booking` (`booking.html`). It is used by admins to create bookings on behalf of clients. It requires authentication.

### Initialization Flow

```
1. Check auth state (10-second timeout)
2. If not logged in → redirect to /login
3. Read context from getContext()
4. Load all active services for the business
5. If no active services → show "No Active Service" message
6. If 1 service → auto-select it
7. If multiple services → show service selector dropdown
8. Set date min to today, default time to 09:00
9. Pre-fill customer info from current user's profile
10. Show the form
```

### Service Selector

When a business has multiple active services:

```javascript
// Renders a dropdown with all active services
<select id="service-selector">
  <option value="">Choose a service...</option>
  <option value="serviceId1">Deep Clean - Starting at $150.00</option>
  <option value="serviceId2">Window Wash - Starting at $80.00</option>
</select>
```

When a service is selected, the form dynamically renders:
- Service info (name, description, base price, duration)
- Custom form fields from the service definition
- Extras/add-ons
- Updates the price breakdown

### Dynamic Form Fields

The form renders fields based on the service's `formFields` array. Each field type has specific HTML rendering:

| Field Type | HTML Element | Event | formValues Storage |
|-----------|-------------|-------|-------------------|
| `text` | `<input type="text">` | `change` | string value |
| `number` | `<input type="number">` | `input` | numeric value |
| `dropdown` | `<select>` | `change` | selected option string |
| `checkbox` | `<input type="checkbox">` | `change` | boolean |
| `multiselect` | Multiple `<input type="checkbox">` | `change` | string array of checked values |

### Price Calculation

Price is recalculated every time a form field value changes:

```
Total = basePrice
  + fieldCharges (dynamic pricing from form fields)
  + extrasTotal (selected add-ons)
  + tax (subtotal * taxRate)
```

Dynamic pricing per field type:

| Field Type | Pricing Config | Calculation |
|-----------|---------------|-------------|
| `number` | `pricePerUnit` | quantity * pricePerUnit |
| `dropdown` | `optionPrices` | optionPrices[selectedOption] |
| `checkbox` | `priceWhenChecked` | priceWhenChecked if checked |
| `multiselect` | `pricePerSelection` | selectedCount * pricePerSelection |

### Time Estimation

Estimated time is also calculated dynamically:

```
Total Minutes = baseDuration
  + field time impacts (same structure as pricing)
```

Time config per field type:

| Field Type | Time Config | Calculation |
|-----------|------------|-------------|
| `number` | `timePerUnit` | quantity * timePerUnit |
| `dropdown` | `optionTimes` | optionTimes[selectedOption] |
| `checkbox` | `timeWhenChecked` | timeWhenChecked if checked |
| `multiselect` | `timePerSelection` | selectedCount * timePerSelection |

### Extras / Add-Ons

Extras are rendered as checkbox list items. Each has a label and price. Selected extras are added to the total.

### Form Submission

On submit:

1. **Validate** all required fields (customer info, address, date, time, required form fields).
2. **Calculate** final pricing (base + field charges + extras + tax).
3. **Determine `clientId`:**
   - If the current user's role is `client`: `clientId = currentUser.uid`
   - If admin/staff creating for someone else: query `users` by customer email. If found, link to their account. If not found, `clientId = null` (unregistered client).
4. **Build booking data** object.
5. **Create booking** via `createBookingSecure` Cloud Function.
6. **Send confirmation email** to the customer.
7. **Redirect** to the dashboard.

### Customer Info Pre-Fill

The form pre-fills customer info from the logged-in user's Firestore profile:

```javascript
const bookingUser = await findUserByEmail(currentUser.email);
if (bookingUser.exists) {
  document.getElementById('customer-first-name').value = bookingUser.userData.firstName;
  document.getElementById('customer-last-name').value = bookingUser.userData.lastName;
  document.getElementById('customer-email').value = bookingUser.userData.email;
  document.getElementById('customer-phone').value = bookingUser.userData.phone;
}
```

### Client Linking Logic

When a booking is created by an admin for a client email:

```javascript
// Check if the customer email belongs to a registered user
const existingUserQuery = await db.collection('users')
  .where('email', '==', customerEmail.toLowerCase())
  .limit(1)
  .get();

if (!existingUserQuery.empty) {
  clientId = existingUserQuery.docs[0].id;  // Link to existing user
  customerIsRegistered = true;
} else {
  clientId = null;                           // Unregistered client
  customerIsRegistered = false;
}
```

This determines whether the booking shows as linked to a user account or as "Unregistered" in the admin's client list.

---

## 9. Client Settings

The settings modal has two tabs:

### Tab A: Account Info

**Fields:**
- Email (read-only)
- First Name (editable)
- Last Name (editable)
- Phone (editable)

**Save:** Calls `updateUserProfile(customUserId, { firstName, lastName, phone })`.

**Password Section:**

Dynamically adapts based on auth provider:

```javascript
const hasPassword = auth.currentUser.providerData.some(p => p.providerId === 'password');
const hasGoogle = auth.currentUser.providerData.some(p => p.providerId === 'google.com');

if (hasPassword) {
  // Show "Change Password" mode
  // Fields: Current Password, New Password, Confirm Password
  // Action: reauthenticate with current password, then updatePassword
} else {
  // Show "Set Password" mode (Google-only user)
  // Fields: New Password, Confirm Password (NO current password)
  // Subtitle: "You signed in with Google and don't have a password yet."
  // Action: linkWithCredential to add password provider
}
```

### Tab B: Workspace

- Current business name display
- **Leave Company** button → removes the client's membership from the business

**Leave Company Flow:**

```javascript
async function handleClientLeaveCompany() {
  if (!confirm('Leave this company? You will lose access to your bookings.')) return;

  // Remove the membership from the user's memberships array
  // (set status to 'inactive' or remove entirely)

  // Clear context and redirect to /waiting
  localStorage.removeItem('bookingpenguin_context');
  window.location.href = '/waiting';
}
```

---

## 10. Business Switcher

Clients can belong to multiple businesses (e.g., they use cleaning services from one company and a salon from another). The header includes a business switcher dropdown.

### How It Works

```javascript
async function populateBusinessSwitcher() {
  // Read the current user's Firestore profile
  // Filter memberships to active client memberships
  // If only one → hide switcher
  // If multiple → show dropdown with business names
  // On selection → saveContext() with new businessId/businessName → reload page
}
```

### Context Switch

When a different business is selected:

```javascript
function switchBusiness(membership) {
  saveContext({
    businessId: membership.businessId,
    businessName: membership.businessName,
    role: membership.role,
    customUserId: customUserId
  });
  window.location.reload(); // Reload to fetch new business data
}
```

---

## 11. Real-Time Systems

### What Uses Real-Time Listeners

| System | Listener Type | Collection | Query |
|--------|-------------|------------|-------|
| Chat | `onSnapshot` | `chats` | `businessId == X AND participants array-contains authUid` |
| Notifications | `onSnapshot` | `notifications` | `userId == authUid`, ordered by `createdAt desc`, limit 50 |

### What Does NOT Use Real-Time Listeners

| Data | Fetch Type | Why |
|------|-----------|-----|
| Bookings | One-time `.get()` | Bookings don't change frequently enough to warrant real-time |
| User Profile | One-time `.get()` | Loaded once at init |

### Chat System

The chat system works identically for clients as for admins/staff. Clients can DM admins and participate in conversations. See `MVPchange.md` for the full chat system documentation.

### Notification System

Clients receive notifications for:
- Booking confirmations
- Booking status changes (assigned, accepted, completed)
- Messages from admins

---

## 12. Firestore Collections Used

| Collection | How It's Used | Query Pattern |
|-----------|--------------|---------------|
| `bookings` | Load client's bookings, cancel bookings | `where businessId, where clientId == authUid` |
| `users` | Load profile, update profile, find user by email | `where email == X` |
| `businesses` | Business name display, business switcher | `doc(businessId).get()` |
| `services` | Load active services for booking form | `where businessId, where isActive == true` |
| `chats` | Real-time chat conversations | `where businessId, where participants array-contains authUid` |
| `chats/{id}/messages` | Chat messages | `orderBy timestamp asc` |
| `notifications` | Real-time notifications | `where userId == authUid, orderBy createdAt desc, limit 50` |

---

## 13. Booking Document Structure

This is the full booking document as created by the booking form:

```typescript
{
  // Business and Service
  businessId: string,
  serviceId: string,
  serviceName: string,

  // Client
  clientId: string | null,        // Firebase Auth UID if registered, null if unregistered
  customer: {
    firstName: string,
    lastName: string,
    email: string,                 // Lowercase
    phone: string,
    isRegistered: boolean          // true if clientId is set
  },

  // Location
  address: {
    street: string,
    city: string,
    province: string,
    postalCode: string,            // Uppercase
    country: string                // Country code: 'CA', 'US', 'GB', etc.
  },

  // Schedule
  date: string,                    // 'YYYY-MM-DD' format
  time: string,                    // 'HH:MM' 24-hour format
  frequency: 'one-time' | 'weekly' | 'biweekly' | 'monthly',

  // Service Form Data
  formResponses: {                 // Key = field label, Value = user input
    [fieldLabel: string]: string | number | boolean | string[]
  },
  selectedExtras: string[],       // Array of extra labels that were selected

  // Pricing
  pricing: {
    basePrice: number,
    fieldCharges: number,          // Total from dynamic field pricing
    extrasTotal: number,           // Total from selected extras
    subtotal: number,              // basePrice + fieldCharges + extrasTotal
    taxRate: number,               // e.g., 0.13 for 13%
    tax: number,                   // subtotal * taxRate
    total: number                  // subtotal + tax (this is the final client-facing price)
  },

  // Time
  estimatedTimeMinutes: number,    // Calculated from base duration + field time impacts

  // Staff Assignment (set later by admin)
  assignedTo: string | null,
  assignedToName: string | null,
  assignedAt: Timestamp | null,
  assignedStaff: AssignedStaffEntry[] | null,
  staffCount: number | null,

  // Status
  status: 'pending',               // Always starts as 'pending'

  // Notes
  customerNotes: string,           // Client-provided notes
  internalNotes: string,           // Admin-only notes (empty on creation)

  // Metadata
  createdBy: string,               // Firebase Auth UID of the person who created the booking
  createdAt: Timestamp,            // Set by Cloud Function

  // Email tracking
  confirmationEmailSentAt?: Timestamp,
  emailSendCount?: number
}
```

### Status Transitions

```
pending → assigned    (admin assigns staff)
assigned → accepted   (staff accepts the job)
accepted → completed  (admin marks complete)
pending → cancelled   (client or admin cancels)
assigned → cancelled  (client or admin cancels)
```

Clients can only trigger `pending → cancelled` and `assigned → cancelled`.

---

## Key Implementation Notes for Mobile

1. **Bookings query uses `clientId == auth.currentUser.uid`** — Make sure the mobile app uses the Firebase Auth UID (not the custom Firestore doc ID) when querying bookings.

2. **No real-time listener on bookings.** The web app fetches bookings once with `.get()`. On mobile, you can optionally use `onSnapshot` for a more responsive experience, but it's not required.

3. **The booking form is typically used by admins**, not clients directly. Clients see their bookings on the client dashboard. If you want clients to create their own bookings in the mobile app, replicate the full form field rendering and price calculation logic.

4. **Price calculation is client-side.** The Cloud Function that creates the booking receives the calculated price. To prevent tampering, the server could re-calculate — but currently it trusts the client's calculation.

5. **Confirmation emails** are sent via the `sendBookingConfirmationEmail()` function which writes to the `mail` collection. The Trigger Email Firebase Extension picks it up and sends via Resend.

6. **Context storage** uses `localStorage` on web. On mobile, use `AsyncStorage`. The context must persist across app restarts so the user doesn't have to re-select their business every time.

7. **Business switcher** only appears if the client has multiple active memberships. Most clients will only have one.
