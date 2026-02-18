# BookingPenguin Mobile App — Refined Build Plan

## Project Overview

Mobile app for BookingPenguin (www.bookingpenguin.com), connecting to the existing `bookingsharks` Firebase project. Built with React Native + Expo (TypeScript). Shares the same backend, database, and Cloud Functions as the web app — no backend changes required.

**Priority:** Admin/Owner + Staff roles first, Client role later.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native + Expo SDK 54 (managed workflow) |
| Language | TypeScript |
| Navigation | Expo Router (file-based) |
| State | React Context + custom hooks |
| Firebase | Modular JS SDK v12 (same `bookingsharks` project) |
| Auth Persistence | AsyncStorage (replaces sessionStorage from web) |
| Build/Deploy | EAS Build (cloud builds, no Mac required for iOS) |
| Testing | Expo Go on physical phone (scan QR code) |

---

## Firebase Backend (Shared with Web App)

### Firestore Collections Used

| Collection | Purpose |
|-----------|---------|
| `users` | User profiles, `memberships[]` array, `authUids` |
| `businesses` | Business config, `ownerId`, settings |
| `bookings` | Booking records with customer, pricing, status |
| `services` | Service definitions with form fields, dynamic pricing |
| `staffPayments` | Payment lifecycle: pending → awaiting_confirmation → paid |
| `staffRates` | Hourly rates per staff per business |
| `notifications` | In-app notifications |
| `invitations` | Pending invites (staff/client/admin) |
| `invoices` | Auto-numbered invoices with line items |
| `chats` | Chat docs + `messages` subcollection (real-time) |
| `userBusinessMap` | Auth UID → businessIds mapping (for role detection) |
| `mail` | Email queue (Firebase Trigger Email extension) |
| `companyRevenue` | Revenue records per booking |
| `galleryPhotos` | Business gallery (plan-limited) |

### Cloud Functions (37 — All Reused)

**Auth:** `requestPasswordReset`, `createVerificationCodeSecure`, `verifyEmailCodeSecure`, `ensureMyBusinessMap`

**Bookings:** `createBookingSecure`, `updateBookingSecure`, `deleteBookingSecure`

**Services:** `createServiceSecure`, `updateServiceSecure`, `deleteServiceSecure`, `setActiveServiceSecure`

**Payments:** `createStaffPaymentSecure`, `markPaymentPaidSecure`, `confirmPaymentReceivedSecure`, `reportPaymentNotReceivedSecure`, `addCompanyRevenueSecure`

**Staff:** `updateStaffRateSecure`, `deleteStaffRateSecure`, `getBusinessMembers`

**Business:** `updateBusinessSecure`, `uploadBusinessLogoSecure`, `deleteBusinessLogoSecure`

**Invitations:** `createInvitationSecure`, `cancelInvitationSecure`

**Chat:** `deleteChatSecure`

**Notifications:** `createNotificationSecure`, `markNotificationReadSecure`

**Invoices:** `createInvoiceSecure`, `updateInvoiceStatusSecure`

**Email:** `sendEmailSecure`

**Gallery:** `uploadGalleryPhoto`, `deleteGalleryPhoto`, `updateGalleryCaption`

**AI:** `askAssistant` (Premium only)

**System:** `syncUserBusinessMap`, `ensureMyBusinessMap`, `migrateUserBusinessMaps`, `sendBookingReminders` (scheduled)

### Subscription Plans (Enforced Server-Side)

| Plan | Price | Bookings/mo | Staff | Services | Admin Seats |
|------|-------|-------------|-------|----------|-------------|
| Starter | $29/mo | 50 | 3 | 1 | 1 |
| Pro | $59/mo | Unlimited | 10 | 3 | 2 |
| Premium | $99/mo | Unlimited | Unlimited | 5 | 5 |

### Role Hierarchy

| Role | Permissions |
|------|------------|
| Owner | Everything + invite admins + manage subscription |
| Admin | Most features + invite staff/clients |
| Staff | View assigned bookings, payments, chat |
| Client | View own bookings, book services, profile |

---

## Project Structure (Current)

```
BookingPenguinApp/
├── app/
│   ├── (auth)/                    ← Unauthenticated screens
│   │   ├── _layout.tsx            ✅ Stack navigator
│   │   ├── login.tsx              ✅ Email/password login
│   │   ├── signup.tsx             ✅ Registration form
│   │   └── forgot-password.tsx    ✅ Password reset via Cloud Function
│   ├── (admin)/                   ← Owner/Admin tab navigator
│   │   ├── _layout.tsx            ✅ 5-tab layout (Schedule, Clients, Staff, Payments, More)
│   │   ├── schedule.tsx           ✅ Placeholder (calendar + bookings coming)
│   │   ├── clients.tsx            ✅ Placeholder
│   │   ├── staff.tsx              ✅ Placeholder
│   │   ├── payments.tsx           ✅ Placeholder
│   │   └── more.tsx               ✅ Settings/profile/sign-out menu
│   ├── (staff)/                   ← Staff tab navigator
│   │   ├── _layout.tsx            ✅ 4-tab layout (Schedule, Payments, Chat, Settings)
│   │   ├── schedule.tsx           ✅ Placeholder
│   │   ├── payments.tsx           ✅ Placeholder
│   │   ├── chat.tsx               ✅ Placeholder
│   │   └── settings.tsx           ✅ Profile/sign-out menu
│   └── _layout.tsx                ✅ Root auth gate (routes by role)
├── contexts/
│   └── AuthContext.tsx             ✅ Full auth state + role detection
├── services/
│   ├── firebase.ts                ✅ Firebase init with AsyncStorage persistence
│   └── auth.ts                    ✅ Sign in/up/out + resolveUserContext
├── types/
│   └── index.ts                   ✅ All Firestore document interfaces
├── constants/
│   └── Colors.ts                  ✅ BookingPenguin branding (light + dark)
├── components/                    ← Reusable UI components (to build)
├── hooks/                         ← Custom React hooks (to build)
└── docs/                          ← Reference files from web app
```

---

## Auth Flow (Implemented)

```
User opens app
  ↓
Firebase checks auth state (onAuthStateChanged)
  ↓
Not signed in → Show login screen
  ↓
User signs in (email/password)
  ↓
resolveUserContext():
  1. Read userBusinessMap/{authUid} → get businessIds + userId
  2. Read users/{userId} → get memberships array
  3. Find active membership → get role + businessId
  4. Check businesses/{businessId}.ownerId → promote to 'owner' if match
  ↓
Role detected → Navigate:
  owner/admin → (admin)/schedule
  staff → (staff)/schedule
  ↓
Session cached in AsyncStorage for fast restore on next launch
```

---

## Build Phases

### Phase 1: Auth + Navigation ✅ COMPLETE
- Login, signup, forgot password screens
- Firebase auth with AsyncStorage persistence
- Role detection from userBusinessMap + memberships
- Auto-routing to admin or staff tab navigator
- Session caching for instant app restore

### Phase 2: Admin Schedule + Booking Management (NEXT)
- Horizontal date picker at top
- Day view: list of bookings as cards
- Booking detail modal (tap to expand)
- Create booking wizard (Service → Date → Customer → Confirm)
- Edit booking, change status, assign staff
- Multi-staff split with percentage adjustment
- Complete booking → creates staff payments + company revenue
- Real-time updates via Firestore `onSnapshot`

### Phase 3: Staff + Client Management
- Staff list from `getBusinessMembers(role: 'staff')`
- Staff cards with name, rate, avatar
- Set/edit hourly rates via `updateStaffRateSecure`
- Invite staff via `createInvitationSecure`
- Client list from `getBusinessMembers(role: 'client')`
- Invite clients via `createInvitationSecure`
- View/cancel pending invitations

### Phase 4: Payments Dashboard
- 3-tab view: Pending | Awaiting Confirmation | Paid
- Payment cards with amount, staff, service, date
- Admin: mark paid (`markPaymentPaidSecure`)
- Company revenue overview (monthly totals)
- Invoice generation (`createInvoiceSecure`)

### Phase 5: Staff Role Features
- Filtered schedule (only assigned bookings)
- Payment history with confirm/dispute actions
- `confirmPaymentReceivedSecure` / `reportPaymentNotReceivedSecure`
- Monthly earnings summary

### Phase 6: Chat System
- Chat list with real-time updates (`onSnapshot` on `chats`)
- Chat room with message list + input
- Create team and direct chats
- Admin can delete chats (`deleteChatSecure`)
- Shared between admin and staff roles

### Phase 7: Settings + Business Management
- Business info editing (`updateBusinessSecure`)
- Logo upload/delete
- Service management (CRUD + toggle active)
- Profile editing (name, phone, photo)
- Photo upload via `expo-image-picker` + `expo-image-manipulator`

### Phase 8: Push Notifications
- Register for Expo push tokens
- Store tokens in user doc (`expoPushToken`)
- New Cloud Function: `sendPushNotification` (only new backend code)
- Triggers: booking assigned, payment status, chat message, reminders

### Phase 9: Polish + Publish
- Dark mode (system detection via `useColorScheme()`)
- Loading/error/empty states on all screens
- Pull-to-refresh
- App icons + splash screen (BookingPenguin branding)
- EAS Build config for dev/preview/production
- Google Play ($25 one-time) + App Store ($99/year)

---

## Testing Strategy

**During Development:**
- Expo Go on physical phone (scan QR code from `npx expo start`)
- Phone and PC on same WiFi network
- Hot reload: save a file → app updates in ~1 second

**Before Publishing:**
- EAS Build → internal distribution for testing
- TestFlight (iOS) for beta testers
- Google Play Internal Testing track (Android)

**No Mac Required:**
- All iOS builds happen in Expo's cloud via EAS Build
- TestFlight for iOS testing on a friend's iPhone

---

## Key Web → Mobile Differences

| Web App | Mobile App |
|---------|-----------|
| `sessionStorage` | `AsyncStorage` |
| HTML/CSS + Tailwind | React Native Views + StyleSheet |
| DOM show/hide sections | Expo Router navigation stacks |
| `<input type="file">` | `expo-image-picker` |
| Canvas-based image resize | `expo-image-manipulator` |
| Browser `window`/`document` | Not available (React Native) |
| `onSnapshot` for real-time | Same — works identically |
| `httpsCallable()` | Same — works identically |

---

## Costs

| Item | Cost |
|------|------|
| Expo / EAS Build | Free tier (30 builds/month) |
| Firebase | Already covered (same project) |
| Google Play Developer | $25 one-time |
| Apple Developer | $99/year |
| **Total to launch** | **~$124** |
