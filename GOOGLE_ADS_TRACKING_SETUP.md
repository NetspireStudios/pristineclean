# Google Ads Conversion Tracking Setup

**Pristine Clean Services**
Last Updated: March 28, 2026

---

## Overview

Google Ads conversion tracking is fully configured site-wide. There are **two layers** working together:

| Layer | What It Does | Where |
|-------|-------------|-------|
| **Global tag** `gtag('config', 'AW-18037100956')` | Tracks page views, enables remarketing audiences, and allows Google Ads to optimize ad delivery | Every page (20 HTML files) |
| **Conversion event** `send_to: 'AW-18037100956/3h-ZCIbAgZIcEJyj4ZhD'` | Tells Google Ads "a lead form was submitted" — this is the actual conversion Google counts | Fires in `hero-form.js` on successful quote form submission only |

The global tag on its own does **not** count conversions. It just sets up the connection. The conversion event with the label (`/3h-ZCIbAgZIcEJyj4ZhD`) is what actually registers a conversion in your Google Ads dashboard under "Submit lead form (1)".

---

## How the Two Pieces Work Together

```
User clicks Google Ad → lands on any page
                         ↓
         gtag('config', 'AW-18037100956')     ← Global tag fires on page load
         Records: "this user came from Ad campaign X"
         Enables: remarketing, audience building
         Does NOT count as a conversion yet
                         ↓
         User fills out quote form → submits
                         ↓
         Firebase write succeeds
                         ↓
         gtag('event', 'conversion', {        ← Conversion event fires
           'send_to': 'AW-18037100956/3h-ZCIbAgZIcEJyj4ZhD',
           'transaction_id': 'pcs_1711648923456_k7x2m9abc'
         })
                         ↓
         Google Ads records: "Ad campaign X generated a lead"
         This shows up in Google Ads dashboard as a conversion
```

**Without the global tag:** Google can't link the conversion back to the ad click.
**Without the conversion event:** Google sees the ad click but never knows if the user converted.
**Both together:** Full attribution — you see exactly which campaigns, keywords, and ads generate leads.

---

## What Was Added

### 1. Global Site Tag (All 20 Pages)

Every page's existing `gtag` block includes both GA4 and Google Ads:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-65SGS6S839"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-65SGS6S839');      // GA4 — website analytics
  gtag('config', 'AW-18037100956');     // Google Ads — remarketing + conversion setup
</script>
```

Both configs share the same `gtag.js` script — **no extra network request**.

**Pages with this tag:**
- `index.html` (home)
- `pages/contact.html`
- `pages/policy.html`
- `pages/privacy-policy.html`
- All 11 service pages in `pages/services/`
- All 5 blog pages in `blogs/`

### 2. Conversion Event — "Submit lead form (1)" (`assets/js/hero-form.js`)

When the quote form (`#heroQuoteForm`) is submitted successfully:

```js
const transactionId = 'pcs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

// GA4 event — appears in GA4 reports
gtag('event', 'form_submission', {
    'event_category': 'engagement',
    'event_label': 'quote_form',
    'transaction_id': transactionId
});

// Google Ads conversion — "Submit lead form (1)"
// The label /3h-ZCIbAgZIcEJyj4ZhD links to the specific conversion action in Google Ads
gtag('event', 'conversion', {
    'send_to': 'AW-18037100956/3h-ZCIbAgZIcEJyj4ZhD',
    'transaction_id': transactionId
});
```

**The conversion label (`3h-ZCIbAgZIcEJyj4ZhD`)** is the unique identifier for the "Submit lead form (1)" conversion action created in Google Ads. Without this label, Google wouldn't know which conversion action to credit.

---

## How It Works Across Multiple Forms

### The Same Form on 14 Pages

The `#heroQuoteForm` appears on **14 pages** (home, contact, and all service pages). They all load the same `hero-form.js`, so:

- The conversion fires **only on successful submission** (after Firebase write succeeds)
- It does **not** fire on page load, validation errors, rate-limit blocks, or failed submissions
- A user landing on `/services/deep-cleaning` from an ad and submitting the form is tracked identically to one landing on `/home`
- Google Ads will attribute the conversion to whichever ad/keyword brought them in, regardless of which page the form was on

### Blog Newsletter Forms

The 5 blog pages have newsletter signup forms. These are **placeholder UI** with no backend. They do **not** trigger any conversion events. If you wire them up later, add a similar `gtag('event', 'conversion', ...)` call in their submit handler.

---

## How Duplicate Tracking Is Prevented

### Problem
A user could submit the form, then navigate to another page and submit again. Or double-click the button. Or revisit the site and submit a second time.

### Solution: Three Layers of Protection

**Layer 1 — `transaction_id` (Google-level dedup)**
Each submission generates a unique ID like `pcs_1711648923456_k7x2m9abc`. If Google receives the same `transaction_id` twice, it counts it **once**. Different submissions always get different IDs.

**Layer 2 — 60-second rate limit (app-level)**
`hero-form.js` blocks resubmission within 60 seconds via `localStorage`. The form won't even attempt to submit.

**Layer 3 — Button disabling (UI-level)**
The submit button is disabled and shows a loading state during submission, preventing double-clicks.

**Layer 4 — Success-only firing (code-level)**
The conversion event is inside the `try` block, after Firebase confirms the write. If anything fails, no conversion is tracked.

### What About Legitimate Repeat Submissions?

If the same person submits the form again after 60 seconds (e.g., different service inquiry), that's a **new** `transaction_id` and counts as a separate conversion. This is correct behavior — it's a new lead.

---

## How to Verify It's Working

### Quick Test with Tag Assistant

1. Go to [tagassistant.google.com](https://tagassistant.google.com/)
2. Enter your site URL and click "Connect"
3. On the site, you should see:
   - `AW-18037100956` — Config (fires on page load)
   - `G-65SGS6S839` — Config (fires on page load)
4. Submit the quote form
5. You should see:
   - `AW-18037100956/3h-ZCIbAgZIcEJyj4ZhD` — Conversion (fires on submit)

### Google Ads Dashboard

1. Go to **Google Ads > Goals > Conversions**
2. Look for **"Submit lead form (1)"**
3. Status should show **"Recording conversions"** (may take up to 24-48 hours after the first real conversion)
4. Click into it to see conversion details, attribution, and which campaigns drive leads

### GA4 Realtime

1. Go to **GA4 > Reports > Realtime**
2. Submit the form
3. You'll see the `form_submission` event appear (this is the GA4 side, not Google Ads, but confirms the code is running)

---

## Tags Currently Active on the Site

| Tag | ID | Purpose | Fires On |
|-----|----|---------|----------|
| GA4 | `G-65SGS6S839` | Website analytics | Every page load |
| Google Ads (global) | `AW-18037100956` | Remarketing + conversion setup | Every page load |
| Google Ads (conversion) | `AW-18037100956/3h-ZCIbAgZIcEJyj4ZhD` | "Submit lead form" conversion | Quote form success only |
| GTM | `GTM-NPQCLFBX` | Tag management container | Every page load |
| Firebase Analytics | `G-3CD96F6J65` | Firebase project analytics | Via Firebase SDK |

---

## Adding More Conversion Actions in the Future

If you create additional conversion actions in Google Ads (e.g., phone call tracking, newsletter signup), add them to `hero-form.js` (or the relevant handler) with their own label:

```js
gtag('event', 'conversion', {
    'send_to': 'AW-18037100956/NEW_LABEL_HERE',
    'transaction_id': transactionId
});
```

Each conversion action gets its own unique label from Google Ads. You can fire multiple conversion events on the same user action if needed (e.g., "Lead" + "Engaged visitor"), and Google will track them separately.

---

## File Changes Summary

| File | Change |
|------|--------|
| All 20 `.html` pages | `gtag('config', 'AW-18037100956')` added to existing gtag block |
| `assets/js/hero-form.js` | Conversion event with `send_to: 'AW-18037100956/3h-ZCIbAgZIcEJyj4ZhD'` and `transaction_id` dedup |
| `GOOGLE_ADS_TRACKING_SETUP.md` | This documentation file |
