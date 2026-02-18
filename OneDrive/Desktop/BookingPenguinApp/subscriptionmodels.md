# BookingPenguin — Subscription Models Reference

This document is the definitive reference for how subscription plans work across BookingPenguin. It covers every plan's exact limits, how restrictions are enforced on both the client and the server, and a step-by-step guide for adding new gated features.

**Firebase Project:** `bookingsharks`
**Payment Provider:** Stripe (via `firestore-stripe-payments` Firebase Extension)

---

## Table of Contents

1. [Plan Overview](#1-plan-overview)
2. [Exact Limits Per Plan](#2-exact-limits-per-plan)
3. [Stripe Price IDs](#3-stripe-price-ids)
4. [Role Behavior and Plan Inheritance](#4-role-behavior-and-plan-inheritance)
5. [Subscription Status Lifecycle](#5-subscription-status-lifecycle)
6. [The Three Enforcement Functions](#6-the-three-enforcement-functions)
7. [Client-Side Enforcement Patterns](#7-client-side-enforcement-patterns)
8. [Server-Side Enforcement Patterns](#8-server-side-enforcement-patterns)
9. [Adding a New Restricted Feature](#9-adding-a-new-restricted-feature)
10. [Paywall and Lockout Behavior](#10-paywall-and-lockout-behavior)
11. [Modifying Existing Plan Limits](#11-modifying-existing-plan-limits)

---

## 1. Plan Overview

There are three paid plans. There is no free tier — every owner must have an active subscription to access the dashboard.

| | Starter | Pro | Premium |
|---|---------|-----|---------|
| **Price** | $29 / month | $59 / month | $99 / month |
| **Target** | Solo operators, very small teams just getting started | Growing businesses that need invoicing, analytics, and staff payments | Established businesses with large teams needing full collaboration |
| **Most Popular** | No | Yes | No |
| **Color Theme** | Slate | Blue | Amber |

### What Every Plan Includes (No Restrictions)

All plans, regardless of tier, include these features at no extra limit:

- Schedule & Calendar (full booking management)
- Client Management (unlimited clients)
- Email Notifications (booking confirmations, reminders)
- Basic Reports (schedule-level data)
- Staff Hourly Rates
- Profile Pictures
- Dark Mode / Light Mode toggle
- Learning & Modules section

---

## 2. Exact Limits Per Plan

### The `limits` Object

Every plan has a `limits` object with these keys. This is the single source of truth for all enforcement logic.

| Limit Key | Type | Starter | Pro | Premium | Meaning |
|-----------|------|---------|-----|---------|---------|
| `activeServices` | number | `1` | `3` | `5` | Max number of services that can be set to `isActive: true` at the same time |
| `staffMembers` | number | `3` | `10` | `-1` | Max total active staff. `-1` = unlimited |
| `bookingsPerMonth` | number | `50` | `-1` | `-1` | Max bookings that can be created in a calendar month. `-1` = unlimited |
| `adminSeats` | number | `1` | `2` | `5` | Max number of invited admins (does not count the owner) |
| `galleryPhotos` | number | `0` | `50` | `100` | Max gallery photos the business can store. `0` = feature disabled |
| `invoices` | boolean | `false` | `true` | `true` | Whether invoice generation is available |
| `csvExport` | boolean | `false` | `true` | `true` | Whether CSV export of bookings/clients is available |
| `chat` | boolean | `false` | `true` | `true` | Whether Direct Messaging (DM) is available |
| `teamChat` | boolean | `false` | `false` | `true` | Whether Team Chat (group chat) is available |
| `staffPayments` | boolean | `false` | `true` | `true` | Whether the Staff Payments section is visible and functional |
| `gallery` | boolean | `false` | `true` | `true` | Whether the Work Gallery section is visible |
| `aiAssistant` | boolean | `false` | `false` | `true` | Whether the AI Business Analyst tab is available (Premium + Owner only) |

### Value Conventions

- **`-1`** on a numeric limit means **unlimited** — no cap is applied.
- **`0`** on a numeric limit means the feature is **effectively disabled** (zero photos allowed = gallery not useful).
- **`false`** on a boolean means the feature is **completely blocked**.
- **`true`** on a boolean means the feature is **fully available**.

### Plan Limits as a Full Object (copy-paste ready)

```javascript
// Starter — $29/month
starter: {
  activeServices: 1,
  staffMembers: 3,
  bookingsPerMonth: 50,
  invoices: false,
  csvExport: false,
  chat: false,
  teamChat: false,
  staffPayments: false,
  gallery: false,
  galleryPhotos: 0,
  aiAssistant: false,
  adminSeats: 1
}

// Pro — $59/month
pro: {
  activeServices: 3,
  staffMembers: 10,
  bookingsPerMonth: -1,     // unlimited
  invoices: true,
  csvExport: true,
  chat: true,
  teamChat: false,          // team chat is Premium only
  staffPayments: true,
  gallery: true,
  galleryPhotos: 50,
  aiAssistant: false,       // AI analyst is Premium only
  adminSeats: 2
}

// Premium — $99/month
premium: {
  activeServices: 5,
  staffMembers: -1,         // unlimited
  bookingsPerMonth: -1,     // unlimited
  invoices: true,
  csvExport: true,
  chat: true,
  teamChat: true,
  staffPayments: true,
  gallery: true,
  galleryPhotos: 100,
  aiAssistant: true,
  adminSeats: 5
}
```

---

## 3. Stripe Price IDs

These are the actual Stripe price IDs that link a Stripe subscription to an internal plan. They are used in `getPlanFromSubscription()` to determine which plan a subscriber has.

| Plan | Stripe Price ID |
|------|----------------|
| Starter | `price_1SxsrUHZhspnC2GsVIUQVvCS` |
| Pro | `price_1SxtCGHZhspnC2GsRLF94EAt` |
| Premium | `price_1SxtDcHZhspnC2GsmG8KdwQZ` |

### Where These Are Defined

In [`public/js/subscription.js`](public/js/subscription.js), the `PLANS` object maps each plan to its `priceId`. A reverse lookup `PRICE_TO_PLAN` is built automatically:

```javascript
const PRICE_TO_PLAN = {};
Object.values(PLANS).forEach(plan => {
  PRICE_TO_PLAN[plan.priceId] = plan;
});
```

When Stripe syncs a subscription to Firestore, the extension stores the price ID inside the subscription document. `getPlanFromSubscription()` extracts it and looks up the matching plan object.

### Adding a New Plan or Changing Prices

If you create a new Stripe price (e.g., for annual billing or a new tier):
1. Create the product/price in the Stripe Dashboard.
2. Copy the new `price_xxx` ID.
3. Add a new entry (or update `priceId`) in the `PLANS` object in `subscription.js`.
4. Mirror the limits in `functions/index.js` (see [Section 8](#8-server-side-enforcement-patterns)).
5. Bump the version number on the `subscription.js` script tag in all HTML files that load it.

---

## 4. Role Behavior and Plan Inheritance

There are three user roles: **owner**, **admin** (invited), and **staff**.

### Who Has a Subscription

Only the **business owner** has a Stripe subscription. Admins and staff do not subscribe individually — they inherit the owner's plan.

### How Admins and Staff Get Plan Limits

When `initSubscription()` runs and detects the current user is an `admin` or `staff` role, it:

1. Reads the `businesses/{businessId}` document to get `ownerId`.
2. Reads `customers/{ownerId}/subscriptions` to find the owner's active subscription.
3. Resolves the plan using `getPlanFromSubscription()`.
4. Stores it as `window._ownerPlan`.

All three enforcement functions (`hasFeature`, `canPerformAction`, `getPlanLimit`) check for `window._ownerPlan` first when the current user is an admin or staff.

```javascript
// Inside hasFeature(), canPerformAction(), getPlanLimit():
const context = getContext(); // returns { role, businessId }
if (context.role === 'admin' || context.role === 'staff') {
  const plan = window._ownerPlan || currentPlan;
  // use plan.limits instead of currentPlan.limits
}
```

### What Happens When the Owner's Subscription Expires

Staff and invited admins are shown a lockout screen that:
- Locks all navigation except Settings.
- Displays a red banner: "This business has an unpaid subscription."
- Prompts them to contact the owner.

See [Section 10](#10-paywall-and-lockout-behavior) for full details.

### Fail-Closed Behavior

If the owner's plan cannot be loaded (network error, permission denied), all enforcement functions **return false / 0 / denied**. This is intentional — denying access on error is safer than accidentally granting access.

---

## 5. Subscription Status Lifecycle

Stripe syncs subscription documents to `customers/{authUid}/subscriptions/{subId}` in Firestore. The `status` field drives all access decisions.

| Status | Meaning | Access |
|--------|---------|--------|
| `active` | Subscription is current and paid | Full access |
| `trialing` | Within the Stripe trial period | Full access |
| `past_due` | Last payment failed, Stripe is retrying | Full access + amber warning banner shown |
| `canceled` | Subscription was explicitly canceled | No access — paywall shown |
| `incomplete` | Checkout was started but not completed | No access — paywall shown |
| `incomplete_expired` | Checkout was abandoned too long ago | No access — treated as canceled |
| `unpaid` | All retry attempts exhausted | No access — paywall shown |

### Active Check in Code

```javascript
// In subscription.js — these three statuses grant access
const activeSubs = allSubs.filter(s =>
  s.status === 'active' || s.status === 'trialing' || s.status === 'past_due'
);
```

### Grace Period (`past_due`)

When status is `past_due`, the user keeps full access but sees an amber banner: "Payment Failed — Update your payment method." This gives them time to fix their payment before losing access. Stripe will retry the charge for several days before moving to `unpaid`.

---

## 6. The Three Enforcement Functions

All enforcement on the client goes through exactly three functions defined in [`public/js/subscription.js`](public/js/subscription.js). They are exported to `window` and can be called from any inline script or HTML page.

### `hasFeature(key)`

Use for **boolean on/off features** (chat, invoices, gallery, AI assistant, etc.).

```javascript
hasFeature(featureKey: string): boolean
```

- Returns `true` if the current plan has the feature enabled.
- Returns `false` if no subscription, or the plan has the feature set to `false`.
- For admins/staff, uses the owner's plan.

**When to use:** Hiding/showing entire sections of the UI (nav items, tabs, buttons) for features that are either fully available or fully blocked.

```javascript
// Example
if (hasFeature('gallery')) {
  // show gallery nav item and section
} else {
  // hide gallery, show upgrade prompt
}
```

### `canPerformAction(key, currentCount)`

Use for **numeric limits** (services, staff, bookings, gallery photos, admin seats).

```javascript
canPerformAction(limitKey: string, currentCount: number): {
  allowed: boolean,
  reason?: string,   // human-readable message if denied
  current?: number,
  limit?: number
}
```

- Returns `{ allowed: true }` if within limits.
- Returns `{ allowed: false, reason: '...' }` if at or over the limit.
- Handles `-1` (unlimited) automatically.
- For admins/staff, includes "The owner can upgrade" in the reason string.

**When to use:** Blocking a create/add action when the user is about to exceed a numeric cap.

```javascript
// Example — before adding a new staff member
const staffCheck = canPerformAction('staffMembers', currentStaff.length);
if (!staffCheck.allowed) {
  showToast(staffCheck.reason, 'warning');
  return;
}
// proceed with adding staff
```

### `getPlanLimit(key)`

Use when you need the **raw numeric limit** for display or calculation purposes.

```javascript
getPlanLimit(limitKey: string): number
```

- Returns the numeric limit, or `0` if no subscription.
- Returns `-1` if unlimited (treat as no cap in your code).
- For boolean features, returns `-1` if enabled, `0` if disabled.

**When to use:** Displaying "X of Y services used" progress indicators, calculating remaining capacity.

```javascript
// Example — show remaining gallery slots
const limit = getPlanLimit('galleryPhotos');    // e.g., 50
const used = currentPhotos.length;             // e.g., 23
if (limit > 0) {
  showLabel(`${used} / ${limit} photos used`);
}
```

---

## 7. Client-Side Enforcement Patterns

### Pattern 1: Hide a Navigation Item / Section

For features where the entire section should be invisible on lower plans:

```javascript
// In the section initialization or page load:
await waitForSubscription(); // always wait first

if (!hasFeature('staffPayments')) {
  document.querySelector('[data-section="payments"]').classList.add('hidden');
  document.getElementById('section-payments').classList.add('hidden');
  return; // don't initialize the section
}
// proceed to load section data
```

### Pattern 2: Block a Create/Add Action

For actions that would exceed a numeric limit:

```javascript
async function addNewService() {
  // Get current count first
  const activeCount = document.querySelectorAll('.service-active').length;

  const check = canPerformAction('activeServices', activeCount);
  if (!check.allowed) {
    showToast(check.reason, 'warning');
    // Optionally point them to the subscription settings:
    // navigateToSettingsTab('subscription');
    return;
  }
  // proceed with creating the service
}
```

### Pattern 3: Show an Upgrade Prompt Inside a Section

For sections that exist on all plans but have a cap, show a banner within the section:

```javascript
function renderGalleryUpgradeBanner() {
  const limit = getPlanLimit('galleryPhotos');
  const used = photos.length;

  if (limit === 0) {
    // Feature completely off — show full upsell
    return `<div class="upgrade-banner">
      Gallery is available on Pro and Premium plans.
      <button onclick="navigateToSettingsTab('subscription')">Upgrade Now</button>
    </div>`;
  }

  if (used >= limit) {
    // At the cap — show limit-reached message
    return `<div class="limit-banner">
      You've used all ${limit} gallery photos.
      Upgrade to Premium for 100 photos.
    </div>`;
  }

  return ''; // within limits, no banner needed
}
```

### Pattern 4: Disable a Button with a Tooltip

For actions that should be visible but non-functional:

```javascript
function setupInvoiceButton(btn) {
  if (!hasFeature('invoices')) {
    btn.disabled = true;
    btn.title = 'Invoice generation requires the Pro plan or higher.';
    btn.classList.add('opacity-50', 'cursor-not-allowed');
  }
}
```

### Pattern 5: Always Wait for Subscription First

The subscription listener is async. Never check plan features before it resolves:

```javascript
// CORRECT — wait for subscription to load before any feature check
document.addEventListener('DOMContentLoaded', async () => {
  await waitForSubscription();

  if (hasFeature('aiAssistant')) {
    initAIAssistant();
  }
});

// WRONG — subscription may not be loaded yet
document.addEventListener('DOMContentLoaded', () => {
  if (hasFeature('aiAssistant')) {  // currentPlan might still be null
    initAIAssistant();
  }
});
```

---

## 8. Server-Side Enforcement Patterns

Client-side checks can be bypassed by a technically savvy user. All numeric limits that have real cost implications (bookings, staff invitations, service activations, gallery uploads) are also enforced inside Cloud Functions using the **same limits object** mirrored from the client.

### The Server-Side Limits Object (in `functions/index.js`)

```javascript
const PLAN_LIMITS = {
  starter: {
    activeServices: 1,
    staffMembers: 3,
    bookingsPerMonth: 50,
    adminSeats: 1,
    galleryPhotos: 0
  },
  pro: {
    activeServices: 3,
    staffMembers: 10,
    bookingsPerMonth: -1,
    adminSeats: 2,
    galleryPhotos: 50
  },
  premium: {
    activeServices: 5,
    staffMembers: -1,
    bookingsPerMonth: -1,
    adminSeats: 5,
    galleryPhotos: 100
  }
};
```

This object lives in `functions/index.js` and must be kept in sync with the `PLANS.limits` object in `subscription.js`. They are currently identical for numeric keys.

### How Cloud Functions Read the Current Plan

Each enforced function follows the same pattern:
1. Get the `businessId` from the request data.
2. Read `businesses/{businessId}` to get `ownerId`.
3. Read `customers/{ownerId}/subscriptions` and find the active one.
4. Extract the `priceId` and look up the plan in the server-side `PLAN_LIMITS` object.
5. Apply the limit check.

### Existing Enforcement Examples

#### Booking Creation (`createBookingSecure`)

```javascript
// ── Plan limit check: bookingsPerMonth ──
const bookingPlanLimits = getPlanLimitsForBusiness(businessId);  // reads owner's sub
if (bookingPlanLimits && bookingPlanLimits.bookingsPerMonth !== -1) {
  // Count bookings created this calendar month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const bookingsThisMonth = await db.collection('bookings')
    .where('businessId', '==', businessId)
    .where('createdAt', '>=', startOfMonth)
    .get();

  if (bookingsThisMonth.size >= bookingPlanLimits.bookingsPerMonth) {
    throw new HttpsError('resource-exhausted',
      `Monthly booking limit (${bookingPlanLimits.bookingsPerMonth}) reached. Upgrade your plan.`
    );
  }
}
```

#### Service Activation (`setActiveServiceSecure`)

```javascript
// ── Plan limit check: activeServices ──
const svcPlanLimits = getPlanLimitsForBusiness(businessId);
if (svcPlanLimits && svcPlanLimits.activeServices !== -1) {
  const activeSnap = await db.collection('services')
    .where('businessId', '==', businessId)
    .where('isActive', '==', true)
    .get();

  if (activeSnap.size >= svcPlanLimits.activeServices) {
    throw new HttpsError('resource-exhausted',
      `Active service limit (${svcPlanLimits.activeServices}) reached. Upgrade your plan.`
    );
  }
}
```

#### Staff Invitation (`createInvitationSecure`)

```javascript
// ── Plan limit check: staffMembers / adminSeats ──
const invPlanLimits = getPlanLimitsForBusiness(businessId);
if (role === 'staff' && invPlanLimits.staffMembers !== -1) {
  // Count existing active staff
  const totalStaff = await countActiveStaff(businessId);
  if (totalStaff >= invPlanLimits.staffMembers) {
    throw new HttpsError('resource-exhausted',
      `Staff member limit (${invPlanLimits.staffMembers}) reached. Upgrade your plan.`
    );
  }
}
if (role === 'admin' && invPlanLimits.adminSeats !== -1) {
  const totalAdmins = await countActiveAdmins(businessId);
  if (totalAdmins >= invPlanLimits.adminSeats) {
    throw new HttpsError('resource-exhausted',
      `Admin seat limit (${invPlanLimits.adminSeats}) reached. Upgrade your plan.`
    );
  }
}
```

#### Gallery Upload (`uploadGalleryPhoto`)

```javascript
// ── Plan limit check: galleryPhotos ──
const galleryPlanLimits = getPlanLimitsForBusiness(businessId);
const gallerySnap = await db.collection('galleryPhotos')
  .where('businessId', '==', businessId)
  .get();

if (galleryPlanLimits.galleryPhotos !== -1 &&
    gallerySnap.size >= galleryPlanLimits.galleryPhotos) {
  throw new HttpsError('resource-exhausted',
    `Gallery photo limit (${galleryPlanLimits.galleryPhotos}) reached. Upgrade your plan.`
  );
}
```

---

## 9. Adding a New Restricted Feature

Follow this checklist every time you add a feature that should be gated behind a plan.

### Step 1: Decide the Gate Type

**Boolean gate** (feature is either fully on or fully off):
- Use a `boolean` value in `limits` (e.g., `invoices: true/false`).
- Client check: `hasFeature('myFeatureKey')`
- Server check: read the plan and check `plan.myFeatureKey === true`

**Numeric gate** (feature has a quantity cap):
- Use a number value in `limits`, with `-1` for unlimited (e.g., `myItems: 10`).
- Client check: `canPerformAction('myItems', currentCount)`
- Server check: query count and compare to plan limit

### Step 2: Add the Key to `PLANS.limits` in `subscription.js`

Open [`public/js/subscription.js`](public/js/subscription.js) and add the new key to all three plan `limits` objects:

```javascript
starter: {
  limits: {
    // ... existing keys ...
    myNewFeature: false  // or 0 for numeric
  }
},
pro: {
  limits: {
    // ... existing keys ...
    myNewFeature: true   // or 5 for numeric
  }
},
premium: {
  limits: {
    // ... existing keys ...
    myNewFeature: true   // or 20 for numeric
  }
}
```

Also update the `features` array in each plan if you want it to appear on the pricing page:

```javascript
starter: {
  features: [
    // ...
    { text: 'My New Feature', included: false }
  ]
},
pro: {
  features: [
    // ...
    { text: 'My New Feature', included: true }
  ]
}
```

### Step 3: Add the Key to `PLAN_LIMITS` in `functions/index.js`

Open [`functions/index.js`](functions/index.js) and add the same key to the server-side `PLAN_LIMITS` object (numeric keys only — booleans are not enforced server-side unless the feature involves a Cloud Function write):

```javascript
const PLAN_LIMITS = {
  starter:  { /* ... */ myNewFeature: 0 },
  pro:      { /* ... */ myNewFeature: 5 },
  premium:  { /* ... */ myNewFeature: 20 }
};
```

### Step 4: Add the Client-Side Check

In the section's initialization function (in `admin.html` or `staff.html`):

```javascript
// Boolean gate example
async function initMyNewSection() {
  await waitForSubscription();

  if (!hasFeature('myNewFeature')) {
    // Hide the nav item
    document.querySelector('[data-section="my-section"]')?.classList.add('hidden');
    return;
  }
  // load and render the section
}

// Numeric gate example — block the "Add" action
function addMyItem() {
  const currentCount = myItems.length;
  const check = canPerformAction('myNewFeature', currentCount);
  if (!check.allowed) {
    showToast(check.reason, 'warning');
    return;
  }
  // proceed
}
```

### Step 5: Add the Server-Side Check (Cloud Function)

Inside the Cloud Function that creates/modifies the gated resource:

```javascript
exports.createMyItemSecure = onCall(async (req) => {
  const { businessId } = req.data;

  // ... auth checks ...

  // ── Plan limit check: myNewFeature ──
  const planLimits = await getPlanLimitsForBusiness(businessId);
  if (planLimits && planLimits.myNewFeature !== -1) {
    const existingSnap = await db.collection('myItems')
      .where('businessId', '==', businessId)
      .get();

    if (existingSnap.size >= planLimits.myNewFeature) {
      throw new HttpsError('resource-exhausted',
        `Item limit (${planLimits.myNewFeature}) reached. Upgrade your plan for more.`
      );
    }
  }

  // ... proceed with creating the item ...
});
```

### Step 6: Bump Cache-Busting Versions

After modifying `subscription.js`, increment the version number on all HTML files that load it:

```html
<!-- Find and increment ?v=NNN in every HTML file that includes subscription.js -->
<script src="/js/subscription.js?v=124"></script>
```

Files that load `subscription.js`: `admin.html`, `staff.html`.

### Step 7: Test Both Enforcement Layers

1. **Client test (Starter plan):** Log in as a Starter subscriber. Verify the feature is hidden or blocked in the UI.
2. **Client test (Pro/Premium plan):** Verify the feature is visible and functional.
3. **Server test:** Use browser dev tools to call the Cloud Function directly (bypassing the client check) with a Starter account. Verify the function throws `resource-exhausted`.
4. **Edge case:** Hit the limit exactly — verify the `n`th item is allowed and the `n+1`th is blocked.

---

## 10. Paywall and Lockout Behavior

### Owner Without a Subscription: Hard Paywall

When an owner logs in and has no active subscription, `updateSubscriptionBanner()` calls `showPaywall()`, which:

1. Blurs the entire dashboard with `filter: blur(6px)`.
2. Sets `pointer-events: none` on the dashboard so nothing can be clicked behind the overlay.
3. Shows a full-screen overlay with the three pricing cards (same cards as the subscription tab in settings).
4. Locks all sidebar navigation items (`pointer-events-none`, `opacity-40`).
5. Sets `window._paywallActive = true`.

The paywall is removed automatically via `hidePaywall()` when the Firestore `onSnapshot` listener detects a new active subscription (typically within 10–30 seconds of completing Stripe checkout).

```javascript
// The real-time listener auto-dismisses the paywall
_subscriptionListener = db.collection('customers').doc(user.uid)
  .collection('subscriptions')
  .onSnapshot((snapshot) => {
    // ... detect active subscription ...
    window.currentPlan = resolvedPlan;
    updateSubscriptionBanner(); // calls hidePaywall() if active
  });
```

### Owner With `past_due` Status: Warning Banner

When the subscription is `past_due` (payment failed, Stripe is retrying):
- Dashboard remains **fully accessible**.
- A fixed amber banner appears at the top: "Payment Failed — Update payment method."
- The banner stays until the subscription moves to `active` (payment recovered) or `canceled`/`unpaid` (access lost, paywall shown).

### Staff/Admin When Owner's Subscription Lapses

When staff or an invited admin logs in and `checkOwnerSubscription(businessId)` returns `hasSubscription: false`:

`showExpiredLockout(ownerName)` is called, which:
1. Locks all nav items **except Settings**.
2. Hides all sections, shows the Settings section.
3. Injects a fixed red banner: "This business has an unpaid subscription. Contact [ownerName]."
4. Sets `window._businessLocked = true`.

Staff and admins cannot resolve this themselves — only the owner can reactivate the subscription.

### Checking Paywall State in Code

```javascript
if (window._paywallActive) {
  // owner has no subscription — don't attempt to load data
  return;
}

if (window._businessLocked) {
  // owner's subscription expired — staff/admin is locked out
  return;
}
```

---

## 11. Modifying Existing Plan Limits

To change a plan's limits (e.g., increase Starter from 1 to 2 active services), you must update **both** files to keep them in sync.

### File 1: `public/js/subscription.js`

Update the `limits` object for the relevant plan(s):

```javascript
starter: {
  limits: {
    activeServices: 2,  // was 1, now 2
    // ... rest unchanged
  }
}
```

Also update the `features` display text if the human-readable description changes:

```javascript
features: [
  { text: '2 Active Service Forms', included: true },  // was '1 Active Service Form'
  // ...
]
```

Then bump the script version on every HTML file that loads `subscription.js`:

```html
<!-- admin.html and staff.html -->
<script src="/js/subscription.js?v=125"></script>
```

### File 2: `functions/index.js`

Update the same key in the server-side `PLAN_LIMITS` object:

```javascript
const PLAN_LIMITS = {
  starter: {
    activeServices: 2,  // was 1, now 2
    // ...
  }
};
```

Then redeploy Cloud Functions:

```bash
firebase deploy --only functions
```

### File 3: `public/subscribe.html` (if pricing page shows the limit)

If the feature change affects what is displayed on the public pricing page, also update the feature list in `subscribe.html`. This is a marketing page only — it does not affect enforcement.

### Deployment Checklist for Limit Changes

- [ ] Updated `PLANS.limits` in `subscription.js`
- [ ] Updated `features` display text in `subscription.js` (if wording changes)
- [ ] Bumped `?v=` version on `subscription.js` in `admin.html`
- [ ] Bumped `?v=` version on `subscription.js` in `staff.html`
- [ ] Updated `PLAN_LIMITS` in `functions/index.js`
- [ ] Updated pricing comparison table in `subscribe.html` (if applicable)
- [ ] Ran `firebase deploy --only functions` to deploy the Cloud Function changes
- [ ] Ran `firebase deploy --only hosting` to deploy the updated frontend

---

## Appendix: Quick Reference

### All Limit Keys at a Glance

| Key | Gate Type | Starter | Pro | Premium |
|-----|-----------|---------|-----|---------|
| `activeServices` | numeric | 1 | 3 | 5 |
| `staffMembers` | numeric | 3 | 10 | unlimited |
| `bookingsPerMonth` | numeric | 50 | unlimited | unlimited |
| `adminSeats` | numeric | 1 | 2 | 5 |
| `galleryPhotos` | numeric | 0 | 50 | 100 |
| `invoices` | boolean | false | true | true |
| `csvExport` | boolean | false | true | true |
| `chat` | boolean | false | true | true |
| `teamChat` | boolean | false | false | true |
| `staffPayments` | boolean | false | true | true |
| `gallery` | boolean | false | true | true |
| `aiAssistant` | boolean | false | false | true |

### Decision Tree: Which Function to Use?

```
Is the feature either fully available or fully blocked?
  YES → Use hasFeature('key')

Does the feature have a quantity cap?
  YES → Use canPerformAction('key', currentCount) for action blocks
        Use getPlanLimit('key') for display/progress indicators

Do you need the raw number for a calculation or label?
  YES → Use getPlanLimit('key')
```

### Cloud Function Error Code for Limit Violations

Always use `resource-exhausted` when a plan limit is hit in a Cloud Function:

```javascript
throw new HttpsError('resource-exhausted', 'Human-readable reason.');
```

This maps to HTTP 429 and is distinguishable from auth errors (`permission-denied`) and validation errors (`invalid-argument`). The client can detect it specifically:

```javascript
try {
  await myCloudFunction({ ... });
} catch (err) {
  if (err.code === 'resource-exhausted') {
    showToast('You have reached your plan limit. Upgrade to continue.', 'warning');
    navigateToSettingsTab('subscription');
  }
}
```
