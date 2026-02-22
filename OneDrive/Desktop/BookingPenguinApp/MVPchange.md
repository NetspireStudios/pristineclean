# BookingPenguin Mobile App — Feature Implementation Reference

This document provides a complete technical breakdown of how each feature is built on the web app so the mobile app can replicate them identically. Each section includes Firestore document structures, Cloud Functions used, security rules, and step-by-step implementation logic.

**Firebase Project:** `bookingsharks`
**Cloud Functions Region:** `us-central1`
**All Cloud Functions are HTTPS Callable** (use `httpsCallable(functions, 'functionName')`)

---

## Table of Contents

1. [Chat System (with Unread Badge)](#1-chat-system)
2. [Service Form Creation](#2-service-form-creation)
3. [Settings Tabs](#3-settings-tabs)
4. [Analytics](#4-analytics)
5. [Gallery](#5-gallery)
6. [Appendix: Firestore Rules](#appendix-a-firestore-rules)
7. [Appendix: Storage Rules](#appendix-b-storage-rules)
8. [Appendix: All Collections Reference](#appendix-c-all-collections)

---

## 1. Chat System

### Overview

The chat system supports **Direct Messages** (1-on-1) and **Team Chats** (group). All chat data lives in a single `chats` collection with a `messages` subcollection. Unread counts are tracked per-user on each chat document and aggregated client-side for the badge icon.

### Firestore Document Structure

#### Chat Document (`chats/{chatId}`)

```typescript
{
  // Identity
  businessId: string,              // Which business this chat belongs to
  type?: 'team',                   // Absent for DMs, 'team' for group chats
  name?: string,                   // Team chat name (team chats only)
  createdBy?: string,              // Auth UID of creator (team chats only)

  // Participants
  participants: string[],          // Array of Firebase Auth UIDs
  admins?: string[],               // Auth UIDs with admin rights (team chats only)
  participantDetails: {            // Cached info for rendering (no extra queries)
    [authUid: string]: {
      firstName: string,
      lastName: string,
      email: string,
      role: string,                // 'owner' | 'admin' | 'staff'
      photoUrl: string | null
    }
  },

  // Last Message (for conversation list preview)
  lastMessage: {
    text: string,
    senderId: string | null,
    senderName?: string,           // Team chats only
    timestamp: Timestamp,
    deleted: boolean
  },

  // *** UNREAD COUNTS — THIS IS THE KEY MECHANISM ***
  unreadCounts: {
    [authUid: string]: number      // Per-participant unread message count
  },

  // Optional
  clearedAt?: {                    // Per-user "clear chat" timestamps
    [authUid: string]: Timestamp
  },

  createdAt: Timestamp
}
```

#### Message Document (`chats/{chatId}/messages/{messageId}`)

```typescript
{
  senderId: string | null,         // Auth UID of sender (null for system messages)
  text: string,                    // Message text
  imageUrl?: string | null,        // Optional image attachment
  reactions?: {                    // Emoji reactions
    [emoji: string]: string[]      // Array of Auth UIDs who reacted
  },
  timestamp: Timestamp,
  deleted: boolean,                // Soft-delete flag
  isSystemMessage?: boolean        // True for "X joined", "Y left" messages
}
```

### How Unread Counts Work (The Badge Mechanism)

This is the core of the notification icon. There are 4 operations:

#### 1. Incrementing on Send

When a user sends a message, the `unreadCounts` for **every other participant** is incremented by 1 on the chat document:

```typescript
// When sending a message:
const updateData = {
  'lastMessage.text': text,
  'lastMessage.senderId': userId,
  'lastMessage.timestamp': serverTimestamp(),
  'lastMessage.deleted': false
};

if (isTeamChat) {
  // Increment for ALL other participants
  chat.participants.forEach(pid => {
    if (pid !== userId) {
      updateData[`unreadCounts.${pid}`] = increment(1);
    }
  });
} else {
  // DM: increment for the other person only
  const otherUserId = chat.participants.find(p => p !== userId);
  if (otherUserId) {
    updateData[`unreadCounts.${otherUserId}`] = increment(1);
  }
}

await updateDoc(doc(db, 'chats', chatId), updateData);
```

#### 2. Resetting on Open (Mark as Read)

When a user opens a chat, their unread count resets to 0:

```typescript
async function markChatAsRead(chatId: string) {
  const userId = auth.currentUser?.uid;
  if (!userId || !chatId) return;
  await updateDoc(doc(db, 'chats', chatId), {
    [`unreadCounts.${userId}`]: 0
  });
}
```

#### 3. Aggregating for the Badge (Real-time Listener)

A single `onSnapshot` listener watches ALL chats for the current user. When any chat's `unreadCounts` changes, the badge recalculates:

```typescript
// Set up the listener
const q = query(
  collection(db, 'chats'),
  where('businessId', '==', businessId),
  where('participants', 'array-contains', userId)
);

onSnapshot(q, (snapshot) => {
  const allChats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // Split into DMs and team chats
  const dmChats = allChats.filter(c => c.type !== 'team');
  const teamChats = allChats.filter(c => c.type === 'team');

  // Calculate totals
  const dmUnread = dmChats.reduce((sum, chat) =>
    sum + (chat.unreadCounts?.[userId] || 0), 0);
  const teamUnread = teamChats.reduce((sum, chat) =>
    sum + (chat.unreadCounts?.[userId] || 0), 0);
  const totalUnread = dmUnread + teamUnread;

  // Update badge UI
  updateBadge(totalUnread);
});
```

#### 4. Rendering the Badge

```typescript
function updateBadge(count: number) {
  // Main chat icon badge (header)
  if (count > 0) {
    badge.text = count > 99 ? '99+' : String(count);
    badge.visible = true;
  } else {
    badge.visible = false;
  }
}
```

### Why the Mobile App Badge Might Not Work

The most common reasons the mobile app isn't showing the badge:

1. **Missing `onSnapshot` listener on the `chats` collection** — The badge is driven entirely by a real-time listener. If the app only fetches chats once (instead of listening), it won't update when new messages arrive.

2. **Wrong user ID used for `unreadCounts`** — The keys in `unreadCounts` are **Firebase Auth UIDs** (`auth.currentUser.uid`), NOT custom Firestore document IDs. If the mobile app is using the wrong ID, the count will always be 0.

3. **Not incrementing on send** — When sending a message, the app must also update `unreadCounts` for the other participants on the same Firestore write. If this step is missing, recipients never get a count > 0.

4. **Listener not running when chat panel is closed** — The conversations listener must run ALL THE TIME (as long as the user is logged in), not just when the chat screen is open. It's what powers the badge.

### Creating Conversations

#### Direct Message

```typescript
await addDoc(collection(db, 'chats'), {
  businessId: businessId,
  participants: [myAuthUid, otherAuthUid],
  participantDetails: {
    [myAuthUid]: { firstName, lastName, email, role, photoUrl },
    [otherAuthUid]: { firstName, lastName, email, role, photoUrl }
  },
  lastMessage: {
    text: '',
    senderId: null,
    timestamp: serverTimestamp()
  },
  unreadCounts: {
    [myAuthUid]: 0,
    [otherAuthUid]: 0
  },
  createdAt: serverTimestamp()
});
```

#### Team Chat

```typescript
await addDoc(collection(db, 'chats'), {
  type: 'team',
  businessId: businessId,
  name: chatName,
  createdBy: myAuthUid,
  participants: [myAuthUid, ...memberAuthUids],
  admins: [myAuthUid],
  participantDetails: { /* same structure, one entry per participant */ },
  lastMessage: {
    text: '',
    senderId: null,
    senderName: '',
    timestamp: serverTimestamp(),
    deleted: false
  },
  unreadCounts: {
    [myAuthUid]: 0,
    // ... 0 for each participant
  },
  createdAt: serverTimestamp()
});
```

### Messages Listener

When a user opens a specific chat, subscribe to its messages:

```typescript
const messagesRef = collection(db, 'chats', chatId, 'messages');
const q = query(messagesRef, orderBy('timestamp', 'asc'));

onSnapshot(q, (snapshot) => {
  const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  // Filter out messages before clearedAt if applicable
  renderMessages(messages);
  scrollToBottom();
});
```

### Profile Photo Cache

To display profile pictures in chat without extra queries per message:

```typescript
// On chat init, load all business member photos
const getMembers = httpsCallable(functions, 'getBusinessMembers');
const result = await getMembers({ businessId });
const photoCache: Record<string, string> = {};
result.data.users.forEach(m => {
  if (m.authUid && m.photoUrl) {
    photoCache[m.authUid] = m.photoUrl;
  }
});

// When rendering, check participantDetails first, then cache
function getPhoto(participantDetails, uid) {
  return participantDetails?.[uid]?.photoUrl || photoCache[uid] || null;
}
```

### Cloud Functions Used

| Function | Purpose |
|----------|---------|
| `getBusinessMembers` | Returns all active members of a business (with `authUid`, `photoUrl`, `email`, etc.). Used for member picker and photo cache. |
| `deleteChatSecure` | Deletes a chat document. Admin/owner only. Parameters: `{ chatId, businessId }` |

### Security Rules Summary

- **Read**: Business members only (`isMemberOfBusiness(resource.data.businessId)`)
- **Create**: Must be business member AND include own Auth UID in `participants`
- **Update**: Business members only (for unread counts, lastMessage, etc.)
- **Delete**: Business owner only (admin deletion goes through Cloud Function)
- **Messages Read/Create**: Business members, `senderId` must be own Auth UID or null
- **Messages Update**: Sender can edit anything; others can only modify `reactions`

---

## 2. Service Form Creation

### Overview

Services are created through a 4-step wizard: Basics, Questions (custom form fields), Add-ons (extras), and Preview. Each question can dynamically affect price and duration based on user input.

### Firestore Document Structure (`services/{serviceId}`)

```typescript
{
  // Identity
  businessId: string,

  // Basic Info
  name: string,                    // Max 200 chars
  description?: string,            // Max 2000 chars
  basePrice: number,               // Base price in dollars
  duration: number,                // Base duration in minutes

  // Custom Form Fields (Questions)
  formFields: FormField[],

  // Optional Extras / Add-ons
  extras: Extra[],

  // Status
  isActive: boolean,               // Plan-limited

  // Metadata (auto-set by Cloud Functions)
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### FormField Object (Each Custom Question)

```typescript
interface FormField {
  id: string;                      // Generated unique ID
  label: string;                   // Question text
  fieldType: 'number' | 'text' | 'dropdown' | 'checkbox' | 'multiselect';
  options?: string[];              // For dropdown/multiselect (min 2 required)
  required: boolean;
  order: number;                   // Display order

  // Dynamic Pricing
  hasPricing: boolean;
  pricingConfig?: {
    // For fieldType 'number':
    pricePerUnit?: number;         // e.g., $5 per room

    // For fieldType 'checkbox':
    priceWhenChecked?: number;     // e.g., +$10 if checked

    // For fieldType 'dropdown':
    optionPrices?: {               // Price per option
      [optionLabel: string]: number  // e.g., { "Small": 0, "Large": 20 }
    };

    // For fieldType 'multiselect':
    pricePerSelection?: number;    // e.g., $3 per selected item
  };

  // Dynamic Time Impact
  hasTimeImpact: boolean;
  timeConfig?: {
    // For fieldType 'number':
    timePerUnit?: number;          // Minutes per unit

    // For fieldType 'checkbox':
    timeWhenChecked?: number;      // Minutes added when checked

    // For fieldType 'dropdown':
    optionTimes?: {
      [optionLabel: string]: number
    };

    // For fieldType 'multiselect':
    timePerSelection?: number;     // Minutes per selection
  };
}
```

### Extra Object (Add-on)

```typescript
interface Extra {
  id: string;
  label: string;
  price: number;                   // Price in dollars
}
```

### Price Calculation Logic

When a client fills out the booking form, the total price is calculated as:

```
Total Price = basePrice
  + SUM(each formField's dynamic price based on user input)
  + SUM(selected extras' prices)

Total Duration = duration
  + SUM(each formField's dynamic time based on user input)
```

Example for a cleaning service:
- Base: $100, 120 min
- Field "Number of rooms" (number, pricePerUnit: $25, timePerUnit: 30 min) → user enters 3 → +$75, +90 min
- Field "Deep clean?" (checkbox, priceWhenChecked: $50, timeWhenChecked: 60 min) → checked → +$50, +60 min
- Extra "Window cleaning" ($30) → selected → +$30
- **Total: $255, 270 min**

### The 4-Step Wizard

**Step 1 — Basics:**
- Service Name (required, text, max 200)
- Description (optional, textarea, max 2000)
- Base Price (required, number, min 0)
- Duration in minutes (required, number, min 0, step 15)

**Step 2 — Questions:**
- Add/edit/remove custom form fields
- Each field opens a field editor with:
  - Label, Type, Options (if dropdown/multiselect), Required toggle
  - "Affects Price" toggle → shows pricing config based on field type
  - "Affects Time" toggle → shows time config based on field type
- Fields can be reordered

**Step 3 — Add-ons:**
- Add/remove optional extras
- Each extra has a label and price

**Step 4 — Preview:**
- Shows how the form will look to clients
- Live price calculation preview

### Cloud Functions

#### `createServiceSecure`

```
Parameters: {
  businessId: string,
  name: string,
  description?: string,
  basePrice: number,
  duration: number,
  formFields: FormField[],
  extras: Extra[],
  isActive?: boolean (defaults to false)
}

Validation:
- Auth required
- Caller must be admin/owner of the business
- name: required, string, max 200 chars
- description: optional, max 2000 chars
- Checks plan limit for total services

Auto-added:
- createdAt: serverTimestamp
- updatedAt: serverTimestamp

Returns: { serviceId: string }
```

#### `updateServiceSecure`

```
Parameters: {
  serviceId: string,
  updates: {
    name?: string,
    description?: string,
    basePrice?: number,
    duration?: number,
    formFields?: FormField[],
    extras?: Extra[],
    isActive?: boolean
  }
}

Validation:
- Auth required
- Service must exist
- Caller must be admin/owner
- If activating (isActive: true): checks plan limit for active services
- Strips immutable fields: businessId, createdAt

Auto-added:
- updatedAt: serverTimestamp

Returns: { success: true }
```

#### `deleteServiceSecure`

```
Parameters: { serviceId: string }
Validation: Auth, service exists, caller is admin/owner
Returns: { success: true }
```

#### `setActiveServiceSecure`

```
Parameters: { businessId: string, serviceId: string }
Behavior: Sets the specified service to isActive: true, sets ALL other services to isActive: false (batch)
Validation: Auth, caller is admin/owner
Returns: { success: true }
```

### Security Rules

```
services/{serviceId}:
  read:   any authenticated user
  write:  BLOCKED (all writes go through Cloud Functions)
```

---

## 3. Settings Tabs

### Admin Settings (4 tabs)

#### Tab A: Account Info

**Profile Picture:**
- Upload: User selects image → client-side compress to 256x256 JPEG → upload to Firebase Storage at `users/{authUid}/avatar` → get download URL → update Firestore `users/{customUserId}` with `photoUrl`
- Remove: Delete from Storage → remove `photoUrl` from Firestore
- Storage rule: Only the auth user matching `{userId}` can upload/delete, max 2MB, must be image

```typescript
// Compression (use expo-image-manipulator on mobile)
// Resize to 256x256, JPEG quality 0.8
// Upload to: storage.ref(`users/${authUid}/avatar`)
// Then update Firestore:
await updateDoc(doc(db, 'users', customUserId), { photoUrl: downloadUrl });
```

**IMPORTANT ID distinction:** Firebase Storage path uses `authUid` (from `auth.currentUser.uid`). Firestore document update uses `customUserId` (the Firestore document ID from `users` collection, stored in `sessionStorage` on web / `AsyncStorage` on mobile).

**Personal Info:**
- Fields: Email (read-only), First Name, Last Name, Phone
- Save calls `updateUserProfile(customUserId, { firstName, lastName, phone })` which updates the `users/{customUserId}` document

**Password Section (Dynamic):**

The section adapts based on auth provider:

```typescript
// Check providers
const hasPassword = auth.currentUser.providerData.some(p => p.providerId === 'password');
const hasGoogle = auth.currentUser.providerData.some(p => p.providerId === 'google.com');

if (hasPassword) {
  // Show "Change Password" mode
  // Fields: Current Password, New Password, Confirm Password
  // Action: reauthenticate with current password, then updatePassword
} else {
  // Show "Set Password" mode (Google-only users)
  // Fields: New Password, Confirm Password (NO current password field)
  // Action: linkWithCredential to add password provider
  // Subtitle: "You signed in with Google and don't have a password yet."
}
```

Change password flow:
```typescript
const credential = EmailAuthProvider.credential(user.email, currentPassword);
await reauthenticateWithCredential(user, credential);
await updatePassword(user, newPassword);
```

Set password flow (Google-only users):
```typescript
const credential = EmailAuthProvider.credential(user.email, newPassword);
await linkWithCredential(user, credential);
// This adds email/password as a second sign-in method
```

#### Tab B: Business Info

**Company Logo:**
- Upload: Convert to base64 → call `uploadBusinessLogoSecure` Cloud Function
- Remove: Call `deleteBusinessLogoSecure` Cloud Function
- Max 1MB, PNG/JPEG/WebP/SVG
- Cloud Function uploads to Storage at `businesses/{businessId}/logo`, updates `businesses/{businessId}` with `logoUrl`

**Delete Business (Owner only):**
- Shown only if user is the business owner
- Handles cleanup of all related data

Cloud Functions:
```
uploadBusinessLogoSecure({ businessId, imageBase64 })
  → Validates format/size, uploads to Storage, updates business doc
  → Returns: { success: true, logoUrl: string }

deleteBusinessLogoSecure({ businessId })
  → Deletes from Storage, removes logoUrl field
  → Returns: { success: true }
```

#### Tab C: Subscription

**Stripe Integration** via the `firestore-stripe-payments` Firebase Extension.

Data flow:
```
1. Read current plan:
   Listen to: customers/{authUid}/subscriptions
   Filter: status in ['active', 'trialing', 'past_due']
   Extract: priceId from subscription.items[0].price.id
   Map priceId → plan name via PRICE_TO_PLAN lookup

2. Upgrade/Subscribe:
   Create doc in: customers/{authUid}/checkout_sessions
   Extension processes it → adds 'url' field
   Redirect user to that Stripe Checkout URL

3. Manage billing:
   Call extension function: ext-firestore-stripe-payments-createPortalLink
   Redirect to Stripe Customer Portal URL
```

**Plan Limits (used across the app):**

| Feature | Starter ($29) | Pro ($59) | Premium ($99) |
|---------|---------------|-----------|---------------|
| Active Services | 3 | 10 | 25 |
| Staff Members | 5 | 15 | 50 |
| Bookings/Month | 100 | 500 | Unlimited |
| Admin Seats | 1 | 3 | 10 |
| Gallery Photos | 0 | 50 | 100 |
| Chat | Yes | Yes | Yes |
| AI Analyst | No | No | Yes |

#### Tab D: Team Members

**Admin/Owner List:**
- Queries `users` collection, filters by memberships where `role === 'admin'` or `role === 'owner'` for the current business
- Shows photo/initials, name, email, role badge (Owner/Admin)
- Owner can remove admins (updates their membership status)

**Invite Admin:**
```
Cloud Function: createInvitationSecure({
  email: string,
  role: 'admin',
  businessId: string
})

Validation:
- Caller must be owner (only owners can invite admins)
- Checks plan limit for admin seats
- Email format validation
- Creates invitation doc with 7-day expiry token

Returns: { success: true, invitationId: string }
```

**Cancel Invitation:**
```
Cloud Function: cancelInvitationSecure({ invitationId: string })
Validation: Caller must be admin/owner; owner-only for admin invitations
Action: Deletes the invitation document
```

**Pending Invitations:**
- Real-time listener on `invitations` collection
- Filter: `businessId == currentBusiness && status == 'pending'`
- Shows: email, role, invited by, cancel button

### Staff Settings (3 tabs)

#### Tab A: Account Info
Same as admin — profile picture, personal info, password section.

#### Tab B: Admin Contact
- Read-only display of business name and list of admins/owners
- Loads via `getBusinessMembers({ businessId, role: 'admin' })` or Firestore query

#### Tab C: Workspace
- Shows current workspace/business info
- "Leave Company" button → removes staff membership from their user document

### Cloud Functions Summary

| Function | Parameters | Purpose |
|----------|-----------|---------|
| `updateBusinessSecure` | `{ businessId, updates?, adminSeatsAction? }` | Update business settings, manage admin seats |
| `uploadBusinessLogoSecure` | `{ businessId, imageBase64 }` | Upload logo to Storage + update business doc |
| `deleteBusinessLogoSecure` | `{ businessId }` | Delete logo from Storage + remove logoUrl |
| `createInvitationSecure` | `{ email, role, businessId }` | Create invitation with 7-day expiry |
| `cancelInvitationSecure` | `{ invitationId }` | Delete pending invitation |

---

## 4. Analytics

### Overview

Analytics has 5 tabs. All data is computed client-side from Firestore queries on `bookings` and `staffPayments` collections. Charts use Chart.js on web — on mobile, use `react-native-chart-kit` or `victory-native`.

### Data Fetching

```typescript
// Fetch all data for the business
const bookingsSnap = await getDocs(
  query(collection(db, 'bookings'), where('businessId', '==', businessId))
);
const paymentsSnap = await getDocs(
  query(collection(db, 'staffPayments'), where('businessId', '==', businessId))
);

// Then filter by date range client-side
const bookings = bookingsSnap.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(b => {
    const date = b.date?.toDate?.() || new Date(b.date);
    return date >= dateRange.start && date < dateRange.end;
  });
```

### Date Range Filtering

Presets: Today, This Week, This Month, This Quarter, This Year, Custom Range

### Tab 1: Overview

**KPIs:**
- Total Revenue: sum of `totalPrice` from completed bookings
- Total Bookings: count of all bookings in range
- Avg Booking Value: totalRevenue / completedBookings
- Completion Rate: completedBookings / totalBookings * 100
- Active Clients: unique client emails from bookings
- Repeat Rate: clients with 2+ bookings / total clients * 100

**Charts:**
1. Revenue Trend (line) — daily/weekly revenue over time
2. Booking Volume (stacked bar) — completed vs pending vs cancelled per period
3. Bookings by Status (doughnut) — completed, pending, cancelled, no-show
4. Top Services by Revenue (horizontal bar) — top 5 services

### Tab 2: Revenue

**KPIs:**
- Gross Revenue: sum of completed booking prices
- Staff Costs: sum of `staffPayments` amounts
- Business Profit: gross revenue - staff costs
- Month-over-Month Change: percentage change from previous period

**Charts:**
1. Revenue Over Time (line)
2. Revenue by Service (doughnut)
3. Revenue by Staff (horizontal bar)

**Table:** Monthly Revenue Breakdown (month, bookings count, revenue, avg value, growth %)

### Tab 3: Client Analytics

**KPIs:**
- Total Clients: unique client emails
- New This Period: clients whose first booking is in the date range
- Repeat Rate: clients with 2+ bookings
- Avg Client Value: total revenue / unique clients

**Charts:**
1. New vs Returning Clients (stacked bar, last 12 months)
2. Booking Frequency Distribution (bar: 1 booking, 2, 3, 4, 5+)

**Table:** Top Clients by Revenue (name, email, booking count, total spent, last visit date)

### Tab 4: Staff Analytics

**KPIs:**
- Active Staff: count of unique staff in bookings
- Avg Jobs/Staff: total assigned bookings / active staff count
- Top Performer: staff with most completed bookings

**Charts/Visual:**
1. Staff Leaderboard (visual with medals for top 3)
2. Jobs by Staff (horizontal bar, top 6)
3. Revenue Share by Staff (doughnut, top 6)

### Tab 5: AI Analyst

**Requirements:** Premium plan only, business owner only.

**Cloud Function:** `askAssistant`

```
Parameters: {
  businessId: string,
  message: string,           // Max 500 chars
  conversationHistory?: [    // Max 10 turns
    { role: 'user' | 'assistant', content: string }
  ]
}

Rate Limit: 20 messages per hour per user (tracked in aiRateLimits collection)

What it does:
1. Validates Premium plan + owner role
2. Gathers business context from Firestore:
   - Business name, plan, creation date
   - Staff count, client count, active services count
   - This month's bookings (pending, completed)
   - Payment stats (unpaid, paid, total revenue)
   - Gallery photo count
3. Sends to Google Gemini API (gemini-2.5-flash-lite) with system prompt
4. Returns: { reply: string, usage: { remaining: number, limit: number } }
```

**UI:** Chat-style interface where the owner can ask business questions like:
- "What was my best performing week?"
- "Which service should I promote more?"
- "Identify at-risk clients"

### Booking Document Fields Used by Analytics

```typescript
{
  businessId: string,
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no-show',
  date: Timestamp | string,
  serviceName: string,
  serviceId: string,
  totalPrice: number,
  clientName: string,
  clientEmail: string,
  assignedStaff?: [{ id, name, email, isAdmin?, splitPercent? }],
  duration: number,
  createdAt: Timestamp
}
```

### Staff Payment Document Fields Used by Analytics

```typescript
{
  businessId: string,
  staffId: string,
  staffName: string,
  staffEmail: string,
  amount: number,
  serviceName: string,
  bookingId: string,
  status: 'pending' | 'paid' | 'awaiting_confirmation',
  splitPercent?: number,
  splitMinutes?: number,
  totalStaffOnJob?: number,
  createdAt: Timestamp,
  paidAt?: Timestamp
}
```

---

## 5. Gallery

### Overview

The gallery lets admins/staff upload work photos with captions. It's plan-gated (Free: no access, Starter: 0, Pro: 50 photos, Premium: 100 photos). All writes go through Cloud Functions.

### Firestore Document Structure (`galleryPhotos/{photoId}`)

```typescript
{
  businessId: string,
  imageUrl: string,               // Public download URL from Storage
  caption: string,                // Max 200 chars, HTML-sanitized
  uploadedBy: string,             // Auth UID of uploader
  uploaderName: string,           // Display name of uploader
  fileName: string,               // Original file name
  createdAt: Timestamp
}
```

### Upload Flow

```
1. User selects image(s) — max 5 at a time
2. Client-side compression:
   - Max dimension: 1024px (longest side)
   - JPEG quality: 0.7
   - Max file size after compression: 1MB
3. Convert to base64 string
4. Call Cloud Function: uploadGalleryPhoto({
     businessId,
     caption,           // Optional, max 200 chars
     imageBase64,        // base64 string
     fileName            // Original file name
   })
5. Cloud Function:
   - Validates auth, business membership, plan limits
   - Decodes base64, validates format (JPEG/PNG/WebP)
   - Uploads to Storage: businesses/{businessId}/gallery/{photoId}.jpg
   - Makes file publicly readable
   - Creates galleryPhotos document
   - Returns: { photo: { id, imageUrl, caption, ... } }
```

On mobile, use `expo-image-picker` for selection and `expo-image-manipulator` for compression:

```typescript
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

// Pick image
const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  quality: 0.7,
});

// Compress
const manipulated = await ImageManipulator.manipulateAsync(
  result.assets[0].uri,
  [{ resize: { width: 1024 } }],
  { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
);

// Upload
const uploadFn = httpsCallable(functions, 'uploadGalleryPhoto');
await uploadFn({
  businessId,
  caption: '',
  imageBase64: manipulated.base64,
  fileName: 'photo.jpg'
});
```

### Gallery Grid

- Query: `galleryPhotos` where `businessId == currentBusiness`, order by `createdAt desc`
- Display: Responsive grid of thumbnails
- Each card shows: thumbnail, caption, uploader name/initials, relative date, delete button (if authorized)

### Lightbox / Image Viewer

- Full-screen image display
- Previous/Next navigation (swipe on mobile)
- Caption display and edit
- Delete button
- Uploader info
- Close button

### Delete Photo

```
Cloud Function: deleteGalleryPhoto({ photoId })

Authorization:
- Uploader can delete their own photos
- Admin/Owner can delete any photo in their business

Actions:
- Deletes file from Firebase Storage
- Deletes Firestore document
```

### Update Caption

```
Cloud Function: updateGalleryCaption({ photoId, caption })

Authorization:
- Uploader can edit their own captions
- Admin/Owner can edit any caption

Validation:
- Sanitizes HTML
- Max 200 characters
```

### Plan-Based Limits

| Plan | Photo Limit |
|------|-------------|
| Free | 0 (no access) |
| Starter | 0 (no access) |
| Pro | 50 |
| Premium | 100 |

The Cloud Function checks the plan limit before allowing uploads. The client should also check `hasFeature('gallery')` to show/hide the gallery section.

### Security Rules

```
galleryPhotos/{photoId}:
  read:   any authenticated user
  write:  BLOCKED (all writes through Cloud Functions)

Storage businesses/{businessId}/gallery/{photoId}:
  read:   any authenticated user
  write:  BLOCKED (Cloud Functions use Admin SDK)
```

---

## Appendix A: Firestore Rules

Complete security rules — these are already deployed and do NOT need changes for the mobile app. The mobile app uses the same Firebase project and is subject to the same rules.

### Helper Functions

```javascript
function isSignedIn() {
  return request.auth != null;
}

function isOwner(userId) {
  return request.auth.uid == userId;
}

function emailMatches(tokenEmail, docEmail) {
  return tokenEmail != null && docEmail != null &&
         tokenEmail.lower() == docEmail.lower();
}

function isBusinessOwner(businessId) {
  let business = get(/databases/$(database)/documents/businesses/$(businessId)).data;
  return business.ownerId == request.auth.uid;
}

function isMemberOfBusiness(businessId) {
  return exists(/databases/$(database)/documents/userBusinessMap/$(request.auth.uid)) &&
         businessId in get(/databases/$(database)/documents/userBusinessMap/$(request.auth.uid)).data.businessIds;
}
```

### Collection Rules Summary

| Collection | Read | Write | Notes |
|-----------|------|-------|-------|
| `users` | Authenticated | Own doc (email match) or cross-user (memberships only) | Complex update rules for membership changes |
| `businesses` | Authenticated | Create: owner=self. Update: BLOCKED (Cloud Fn). Delete: owner only | |
| `services` | Authenticated | BLOCKED (Cloud Functions) | |
| `bookings` | Business members OR own clientId | BLOCKED (Cloud Functions) | |
| `invoices` | Business members OR own clientId | BLOCKED (Cloud Functions) | |
| `invitations` | Get: anyone. List: authenticated | Update: invited user (status fields only). Create/Delete: BLOCKED | |
| `chats` | Business members | Create: member + self in participants. Update: members. Delete: owner | |
| `chats/messages` | Business members | Create: member, senderId=self or null. Update: sender or reactions only | |
| `notifications` | Authenticated | BLOCKED (Cloud Functions) | |
| `galleryPhotos` | Authenticated | BLOCKED (Cloud Functions) | |
| `staffPayments` | Business members | BLOCKED (Cloud Functions) | |
| `staffRates` | Business members | BLOCKED (Cloud Functions) | |
| `companyRevenue` | Business members | BLOCKED (Cloud Functions) | |
| `customers/{uid}` | Own doc only | BLOCKED (Stripe Extension) | |
| `customers/{uid}/checkout_sessions` | Own doc | Own doc (create checkout) | |
| `customers/{uid}/subscriptions` | Any authenticated | Delete: own only | Staff/admins need to read owner's subscription |
| `userBusinessMap` | Own doc only | BLOCKED (Cloud Function trigger) | |
| `rateLimits` | BLOCKED | BLOCKED | Cloud Functions only |
| `aiRateLimits` | BLOCKED | BLOCKED | Cloud Functions only |
| `mail` | Authenticated | BLOCKED | Cloud Functions only |
| `verificationCodes` | Own email only | BLOCKED | Cloud Functions only |
| `logs` | BLOCKED | Create only (authenticated) | |

---

## Appendix B: Storage Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // User avatars: only the user themselves can upload/delete
    match /users/{userId}/avatar {
      allow read: if request.auth != null;
      allow create, update: if request.auth.uid == userId
                   && request.resource.size < 2 * 1024 * 1024   // 2MB max
                   && request.resource.contentType.matches('image/.*');
      allow delete: if request.auth.uid == userId;
    }
    // Business logos: reads allowed, writes via Cloud Functions only
    match /businesses/{businessId}/logo {
      allow read: if request.auth != null;
      allow create, update, delete: if false;
    }
    // Gallery photos: reads allowed, writes via Cloud Functions only
    match /businesses/{businessId}/gallery/{photoId} {
      allow read: if request.auth != null;
      allow create, update, delete: if false;
    }
    // Deny everything else
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

---

## Appendix C: All Collections Reference

Quick reference of every Firestore collection in the project:

| Collection | Purpose |
|-----------|---------|
| `users` | User profiles (custom doc IDs, NOT Auth UIDs) |
| `businesses` | Business/organization data |
| `services` | Service offerings with form fields |
| `bookings` | Booking records |
| `invoices` | Invoice documents |
| `invitations` | Business invitation records (7-day expiry) |
| `chats` | Chat conversations (DM + team) |
| `chats/{id}/messages` | Chat messages subcollection |
| `notifications` | User notifications |
| `galleryPhotos` | Gallery photo metadata |
| `staffPayments` | Staff payment records |
| `staffRates` | Staff hourly rates |
| `companyRevenue` | Admin revenue / company revenue records |
| `customers` | Stripe customer data (Extension-managed) |
| `customers/{uid}/subscriptions` | Stripe subscriptions |
| `customers/{uid}/checkout_sessions` | Stripe checkout sessions |
| `customers/{uid}/payments` | Stripe payment records |
| `products` | Stripe product catalog (public read) |
| `userBusinessMap` | Auth UID → business ID mapping (for security rules) |
| `rateLimits` | Rate limiting data (Cloud Functions only) |
| `aiRateLimits` | AI assistant rate limits (Cloud Functions only) |
| `verificationCodes` | Email verification codes |
| `mail` | Email queue (Trigger Email Extension) |
| `logs` | Error logging |

---

## Key Implementation Notes for Mobile

1. **User ID Types:** The web app uses TWO different IDs — Firebase Auth UID (`auth.currentUser.uid`) and custom Firestore document ID (`customUserId`). Storage paths and chat participants use Auth UID. Firestore user document lookups use customUserId. NEVER mix them up.

2. **AsyncStorage vs sessionStorage:** The web app stores `customUserId`, `businessId`, `role` in `sessionStorage`. On mobile, use `AsyncStorage` from `@react-native-async-storage/async-storage`.

3. **All Cloud Functions are HTTPS Callable:** Use `httpsCallable(functions, 'functionName')` with the functions instance set to region `us-central1`.

4. **Real-time Listeners:** `onSnapshot` works identically in React Native. The chat badge REQUIRES a persistent listener on the `chats` collection that runs as long as the user is logged in.

5. **Image Compression:** Replace HTML canvas-based compression with `expo-image-manipulator` for profile pictures (256x256) and gallery photos (1024px max).

6. **Stripe Subscriptions:** The mobile app reads subscription data from Firestore (same collection). For checkout/billing portal, open the Stripe URLs in an in-app browser (`expo-web-browser`).

7. **No new Cloud Functions or rules needed.** The mobile app connects to the same Firebase project and uses the same functions and rules as the web app.
