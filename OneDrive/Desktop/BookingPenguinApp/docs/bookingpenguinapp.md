# BookingPenguin Mobile App — Full Build Plan

## Why React Native + Expo

Given your situation (Windows, no Mac, JavaScript experience from the web app, same Firebase backend), **React Native with Expo** is the clear best choice:

- **You already know JavaScript** — React Native uses JS/TypeScript, so no new language to learn
- **Expo handles iOS builds in the cloud** via EAS Build — no Mac required
- **Firebase JS SDK** works directly in Expo — same `firebase.firestore()`, `firebase.auth()` API you already use on the web
- **One codebase** for both Android and iOS
- **Expo Go** app lets you test instantly on your physical phone by scanning a QR code

---

## Phase 0: Environment Setup (Day 1)

### Prerequisites to Install

1. **Node.js** (you likely already have this)
2. **Android Studio** — needed for the Android Emulator
   - During install, check "Android Virtual Device"
   - After install: SDK Manager → install Android 14 (API 34) SDK
   - Device Manager → create a Pixel 7 emulator
3. **Expo CLI** — `npm install -g expo-cli eas-cli`
4. **Expo Go app** on your physical phone (download from Play Store / App Store)

### Create the Project

```bash
npx create-expo-app@latest BookingPenguinApp --template tabs
cd BookingPenguinApp
```

This creates a new Expo project with Expo Router (file-based routing) already configured. **This should be a separate Cursor project** — do NOT put it inside your web app folder.

### Install Core Dependencies

```bash
npx expo install firebase
npx expo install @react-native-async-storage/async-storage
npx expo install expo-image-picker expo-image-manipulator
npx expo install expo-notifications expo-device
npx expo install react-native-reanimated react-native-gesture-handler
npm install date-fns
```

---

## Phase 1: Firebase Connection + Auth (Days 2-4)

### Register Mobile Apps in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/project/bookingsharks/settings/general)
2. Click "Add app" → select **Android**
   - Package name: `com.bookingpenguin.app`
   - Download `google-services.json` → place in project root
3. Click "Add app" → select **iOS**
   - Bundle ID: `com.bookingpenguin.app`
   - Download `GoogleService-Info.plist` → place in project root

### Firebase Config

Create `services/firebase.ts` — this reuses your **exact same Firebase config** from the web app:

```typescript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyDNDgnMzJS4jcUWzSvc3HGZ3TQ8Aqdwj88",
  authDomain: "bookingsharks.firebaseapp.com",
  projectId: "bookingsharks",
  storageBucket: "bookingsharks.firebasestorage.app",
  messagingSenderId: "1001909127976",
  appId: "<MOBILE_APP_ID>",  // New app ID from Firebase Console
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');
```

Key point: The Firestore data, Cloud Functions, and Auth are **all shared** with your web app. A user who signs up on the web app can log into the mobile app with the same credentials. All bookings, payments, chats — everything is the same data.

### Auth Screens

Build these screens (replicating your web login/signup flow):

- **Login Screen** — email + password, Google Sign-In button
- **Signup Screen** — first name, last name, email, password, phone
- **Forgot Password Screen** — calls your existing `requestPasswordReset` Cloud Function
- **Email Verification Screen** — calls `createVerificationCodeSecure` / `verifyEmailCodeSecure`
- **Onboarding Screen** — business setup (for new admin users)

The auth flow uses your existing Firestore `users` collection and `userBusinessMap` to determine the user's role and business.

### Role Detection Logic

After login, the app needs to determine the user's role. This mirrors your web app's `guardDashboard()` logic:

```
1. User signs in → get Firebase Auth UID
2. Query `userBusinessMap` for this user's email
3. Get businessId from the map
4. Query `businesses/{businessId}` → check if user is owner (ownerId)
5. Query `users` collection → find user doc by email → get role field
6. Route to Admin / Staff / Client tab navigator based on role
```

---

## Phase 2: App Architecture + Navigation (Days 3-5)

### File Structure

```
BookingPenguinApp/
├── app/
│   ├── (auth)/                  # Unauthenticated screens
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   ├── forgot-password.tsx
│   │   ├── verify-email.tsx
│   │   └── onboarding.tsx
│   ├── (admin)/                 # Admin tab navigator
│   │   ├── _layout.tsx          # Tab bar config
│   │   ├── schedule.tsx
│   │   ├── clients.tsx
│   │   ├── staff.tsx
│   │   ├── payments.tsx
│   │   ├── analytics.tsx
│   │   └── settings.tsx
│   ├── (staff)/                 # Staff tab navigator
│   │   ├── _layout.tsx
│   │   ├── schedule.tsx
│   │   ├── payments.tsx
│   │   └── settings.tsx
│   ├── (client)/                # Client tab navigator
│   │   ├── _layout.tsx
│   │   ├── bookings.tsx
│   │   ├── book-service.tsx
│   │   └── profile.tsx
│   ├── shared/                  # Shared screens (chat, booking detail, etc.)
│   │   ├── chat.tsx
│   │   ├── booking-detail.tsx
│   │   └── learning.tsx
│   └── _layout.tsx              # Root layout (auth gate)
├── components/                  # Reusable UI components
│   ├── BookingCard.tsx
│   ├── PaymentCard.tsx
│   ├── StaffListItem.tsx
│   ├── Avatar.tsx
│   └── ...
├── services/                    # Firebase + business logic
│   ├── firebase.ts
│   ├── auth.ts
│   ├── bookings.ts
│   ├── payments.ts
│   ├── chat.ts
│   └── ...
├── hooks/                       # Custom React hooks
│   ├── useAuth.ts
│   ├── useBookings.ts
│   └── ...
├── contexts/                    # React Context providers
│   ├── AuthContext.tsx
│   └── ThemeContext.tsx
├── constants/
│   ├── colors.ts
│   └── config.ts
└── assets/
    ├── BookingPenguin.png
    └── ...
```

### Navigation Structure

```
Role Detection (after login)
├── Admin → Bottom Tab Navigator
│   ├── Schedule (calendar view)
│   ├── Clients
│   ├── Staff
│   ├── Payments
│   └── More (Analytics, Settings, Learning, Chat)
├── Staff → Bottom Tab Navigator
│   ├── Schedule (my assignments)
│   ├── Payments (my payments)
│   ├── Chat
│   └── Settings (profile, admin contacts)
└── Client → Bottom Tab Navigator
    ├── My Bookings
    ├── Book Service
    └── Profile
```

---

## Phase 3: MVP Feature Build (Days 5-20)

### What Each Role Gets in the MVP

**CLIENT features:**
- View upcoming/past bookings (from `bookings` collection, filtered by client email)
- Book a new service (select service from `services`, pick date/time, submit via `createBookingSecure`)
- View/edit profile (name, phone, profile picture)
- Push notifications for booking confirmations and reminders

**STAFF features:**
- View assigned bookings/schedule (from `bookings` where `assignedStaff` includes this user)
- View payment history — pending, paid, awaiting confirmation (from `staffPayments`)
- Confirm payment received (via `confirmPaymentReceivedSecure`)
- Report payment not received (via `reportPaymentNotReceivedSecure`)
- Chat with admin/team (from `chats` collection)
- View admin contacts, profile settings

**ADMIN features:**
- Full schedule view — all bookings on a calendar
- Create/edit/delete bookings (via Cloud Functions)
- Assign staff to bookings (including multi-staff split)
- Mark bookings complete + create staff payments
- Client list — view, invite clients
- Staff list — view, invite staff, set hourly rates
- Payments dashboard — pending/paid/awaiting, admin revenue, mark paid
- Analytics overview (revenue, bookings count, client stats)
- Chat with staff/team
- Settings — account info, business info, team members
- Learning & Modules page

### Mapping Web Features to Cloud Functions

This is critical — the mobile app calls the **exact same Cloud Functions** as the web app. No new backend code needed. Here's the mapping:

- Creating a booking → `createBookingSecure`
- Editing a booking → `updateBookingSecure`
- Completing a booking → `createStaffPaymentSecure` + `addCompanyRevenueSecure`
- Inviting staff/admin → `createInvitationSecure`
- Managing services → `createServiceSecure`, `updateServiceSecure`, `deleteServiceSecure`
- Staff rates → `updateStaffRateSecure`
- Payments → `markPaymentPaidSecure`, `confirmPaymentReceivedSecure`
- Chat → Direct Firestore reads/writes to `chats` collection (same as web)
- Profile updates → Direct Firestore writes to `users` collection

### Specific Feature Notes

**Calendar/Schedule View:**
On mobile, a full calendar grid is hard to use on small screens. Better approach: use a horizontal date picker at the top (scroll through dates) and show that day's bookings as a list below. Library: `react-native-calendars`.

**Chat:**
Your web chat uses real-time Firestore listeners (`onSnapshot`). This works identically in React Native — `onSnapshot` on the `chats` and `messages` subcollection gives you live updates.

**Booking Form (Client):**
The client's booking flow needs to work differently on mobile — instead of your web booking page with all fields visible, use a step-by-step wizard: Select Service → Pick Date/Time → Fill Details → Confirm.

**Multi-Staff Booking (Admin):**
The split percentage UI you built on web (assigning admin + staff with adjustable splits) needs to be adapted for mobile. A bottom sheet with sliders for split percentages works well on mobile.

**Profile Pictures:**
Your existing `compressAvatar` logic (resize to 256x256 JPEG) needs to be replicated using `expo-image-manipulator` instead of the HTML canvas approach used on web.

**Dark Mode:**
React Native supports system-level dark mode detection via `useColorScheme()`. You can mirror your web app's dark theme colors.

---

## Phase 4: Testing Strategy — No Mac Required (Ongoing)

### Local Android Testing

1. **Android Emulator** — run `npx expo start`, press `a` to open in Android emulator. Full debugging, hot reload, everything works.
2. **Physical Android phone** — run `npx expo start`, scan the QR code with Expo Go app. Instant testing on real hardware.

### iOS Testing Without a Mac

This is the key question. Here are your options:

**Option A: Expo Go on a borrowed iPhone (FREE, easiest)**
- If you can borrow an iPhone for 5 minutes, install Expo Go from the App Store
- Scan the QR code from `npx expo start` — the app loads instantly
- You can test most features this way during development

**Option B: EAS Build + TestFlight (RECOMMENDED for real testing)**
- Run `eas build --platform ios` from your Windows machine
- Expo's cloud servers build the iOS app for you (no Mac needed)
- The `.ipa` file is uploaded to your Expo dashboard
- You then upload it to App Store Connect → TestFlight
- Anyone with an iPhone can install it via TestFlight link
- Cost: Requires Apple Developer Account ($99/year — you need this anyway to publish)

**Option C: Cloud Mac Services (for debugging iOS-specific issues)**
- **MacStadium** or **GitHub Actions macOS runners** — rent a cloud Mac for $1-2/hour if you ever need to debug an iOS-specific issue
- Generally not needed with Expo since 95%+ of code is shared

**Option D: BrowserStack / Appetize.io (for quick visual checks)**
- Upload your built .ipa and run it in a browser-based iOS simulator
- Good for UI checks, not for full testing

**Recommended approach:** Develop and test primarily on Android emulator + physical Android phone. Use EAS Build to create iOS builds periodically, test via TestFlight on a friend's/family member's iPhone.

---

## Phase 5: Push Notifications (Days 18-22)

Push notifications are one of the biggest advantages of a native app over your web app.

### Setup
- Use `expo-notifications` library
- Register for push tokens on app startup
- Store push tokens in the user's Firestore document (`users/{id}/pushToken`)
- Create a new Cloud Function `sendPushNotification` that sends notifications via Expo's push service

### Notifications to Implement
- **Client:** "Your booking is confirmed", "Reminder: appointment tomorrow at 2pm"
- **Staff:** "New booking assigned to you", "Payment marked as paid"
- **Admin:** "New booking created", "Staff confirmed payment", "New client registered"

Your existing `sendBookingReminders` scheduled function can be extended to send push notifications in addition to emails.

---

## Phase 6: Build + Publish (Days 22-28)

### App Store Assets Needed

Before submitting, you need:
- App icon (1024x1024) — use your BookingPenguin logo
- Screenshots (at least 2 per device size) — Android and iPhone
- App description, keywords, privacy policy URL (you already have `/privacy`)
- Feature graphic (Google Play, 1024x500)

### Android — Google Play Store

1. Create a [Google Play Developer account](https://play.google.com/console) ($25 one-time fee)
2. Run `eas build --platform android` → produces an `.aab` file
3. Create your app listing in Play Console
4. Upload the `.aab` to the Internal Testing track first
5. Test with real users → then promote to Production
6. Review takes 1-3 days typically

### iOS — Apple App Store

1. Create an [Apple Developer account](https://developer.apple.com) ($99/year)
2. Run `eas build --platform ios` → produces an `.ipa` file
3. Run `eas submit --platform ios` → uploads to App Store Connect
4. Create your app listing in App Store Connect
5. Submit for review → typically 1-2 days
6. Apple is stricter — make sure you have a privacy policy and all required metadata

### EAS Configuration

In your project, create `eas.json`:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./play-store-key.json"
      },
      "ios": {
        "appleId": "your@email.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID"
      }
    }
  }
}
```

---

## Costs Summary

| Item | Cost |
|------|------|
| Expo / EAS Build | Free tier: 30 builds/month |
| Google Play Developer | $25 one-time |
| Apple Developer Program | $99/year |
| Firebase | Already paying (same project) |
| **Total to launch** | **~$124** |

---

## Key Differences: Mobile vs Web App

Things that work differently on mobile and need attention:

1. **No `window`, `document`, `sessionStorage`** — React Native doesn't have a browser. Use `AsyncStorage` instead of `sessionStorage` for persisting user data locally.

2. **No HTML/CSS** — React Native uses its own component system (`View`, `Text`, `ScrollView`, `TouchableOpacity`). Your Tailwind CSS doesn't carry over, but you can use **NativeWind** (Tailwind for React Native) to keep a similar workflow.

3. **Navigation** — Instead of showing/hiding DOM sections like your web app does, React Native uses a proper navigation stack (Expo Router handles this).

4. **File uploads** — Instead of `<input type="file">`, use `expo-image-picker` to select photos from camera roll or take a new photo.

5. **Cloud Functions** — Called identically using `httpsCallable(functions, 'functionName')`. No changes needed on the backend.

6. **Real-time listeners** — `onSnapshot` works identically in React Native. Your chat system will work the same way.

7. **Google Sign-In** — Requires additional native configuration (`expo-auth-session` or `@react-native-google-signin/google-signin`). More setup than web but well-documented.

---

## Suggested Build Order

Start with the simplest role (Client) to prove the architecture works, then expand:

1. **Auth screens** — login, signup, role detection
2. **Client flow** — view bookings, book a service, profile
3. **Staff flow** — view schedule, view payments, chat
4. **Admin flow** — full schedule, manage bookings, staff/clients, payments, settings
5. **Push notifications**
6. **Polish, testing, store submission**

This order lets you ship a client-facing app first (smallest scope) while building toward the full admin experience.
