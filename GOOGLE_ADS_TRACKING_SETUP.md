# Google Ads Conversion Tracking Setup

**Pristine Clean Services**
Last Updated: March 28, 2026

---

## Overview

Google Ads conversion tracking (`AW-18037100956`) has been added site-wide alongside the existing GA4 (`G-65SGS6S839`) and GTM (`GTM-NPQCLFBX`) tags. This tracks when visitors from Google Ads submit a quote request form, so you can measure which ads drive real leads.

---

## What Was Added

### 1. Global Site Tag (All 20 Pages)

Every page's existing `gtag` block now includes the Google Ads config:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-65SGS6S839"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-65SGS6S839');      // GA4 (existing)
  gtag('config', 'AW-18037100956');     // Google Ads (new)
</script>
```

This loads once per page view. Since both configs share the same `gtag.js` script, there's **no extra network request** — one script handles both GA4 and Google Ads.

**Pages updated:**
- `index.html` (home)
- `pages/contact.html`
- `pages/policy.html`
- `pages/privacy-policy.html`
- All 11 service pages in `pages/services/`
- All 5 blog pages in `blogs/`

### 2. Conversion Event on Form Submission (`assets/js/hero-form.js`)

When a user successfully submits the quote form (`#heroQuoteForm`), two events fire:

```js
// Unique ID prevents counting the same submission twice
const transactionId = 'pcs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

// GA4 event (existing, now with transaction_id)
gtag('event', 'form_submission', {
    'event_category': 'engagement',
    'event_label': 'quote_form',
    'transaction_id': transactionId
});

// Google Ads conversion event (new)
gtag('event', 'conversion', {
    'send_to': 'AW-18037100956',
    'transaction_id': transactionId
});
```

---

## How It Works Across Multiple Forms

### The Same Form on 14 Pages

The `#heroQuoteForm` appears on **14 different pages** (home, contact, and all service pages). They all share the same `hero-form.js` script, so:

- The conversion event fires **only on successful submission** (after Firebase write succeeds)
- It does **not** fire on page load, form validation errors, rate-limit blocks, or failed submissions
- Every page with the form is tracked identically — no special per-page configuration needed

### Blog Newsletter Forms

The 5 blog pages have newsletter signup forms. These are currently **placeholder UI** with no backend or submit handler. They do **not** trigger any conversion events. If you add functionality to these later, you'd add a similar `gtag('event', 'conversion', ...)` call in their submit handler.

---

## How Duplicate Tracking Is Prevented

### Problem
A user could submit the form on the home page, then navigate to a service page and submit again. Or the same form could theoretically fire events twice due to a double-click.

### Solution: `transaction_id`

Each form submission generates a **unique `transaction_id`** like `pcs_1711648923456_k7x2m9abc`. Google Ads uses this ID to automatically deduplicate conversions:

- If the same `transaction_id` is received twice, Google counts it **once**
- Different submissions get different IDs (timestamp + random string), so they're counted separately
- This is Google's recommended approach for deduplication

### Additional Safeguards Already in Place

1. **Rate limiting** — `hero-form.js` blocks resubmission within 60 seconds via `localStorage` (`lastFormSubmit` key)
2. **Button disabling** — The submit button is disabled during submission, preventing double-clicks
3. **Event fires only on success** — The conversion event is inside the `try` block, after the Firebase write succeeds. If the write fails, no conversion is tracked

---

## How to Verify It's Working

### Google Ads Tag Assistant

1. Install the [Google Tag Assistant](https://tagassistant.google.com/) Chrome extension
2. Visit any page on the site
3. You should see both `G-65SGS6S839` (GA4) and `AW-18037100956` (Google Ads) firing
4. Submit the form — you should see a `conversion` event sent to `AW-18037100956`

### Google Ads Dashboard

1. Go to **Google Ads > Goals > Conversions**
2. Create a new conversion action (if not already done):
   - Category: **Lead / Submit lead form**
   - Conversion source: **Website**
   - Use the tag already installed on site
3. Conversions should start appearing within 24-48 hours of the first form submission from an ad click

### Real-Time Check in GA4

1. Go to **GA4 > Reports > Realtime**
2. Submit the form on the site
3. You should see the `form_submission` event appear in real-time

---

## Setting Up a Specific Conversion Action (Optional but Recommended)

If you want to track a specific conversion (e.g., "Quote Request"), you'll need to:

1. In Google Ads, go to **Goals > Conversions > New conversion action**
2. Choose **Website** > enter the site URL
3. Set up a manual conversion:
   - Name: `Quote Request`
   - Category: `Submit lead form`
   - Value: Set a value per lead if desired
4. You'll get a **Conversion ID** and **Conversion Label** (e.g., `AW-18037100956/AbCdEf...`)
5. Update the `send_to` in `hero-form.js`:
   ```js
   gtag('event', 'conversion', {
       'send_to': 'AW-18037100956/YOUR_CONVERSION_LABEL',
       'transaction_id': transactionId
   });
   ```

Until a specific conversion label is configured, the current setup sends a generic conversion to the account, which Google Ads can still use for optimization.

---

## Tags Currently Active on the Site

| Tag | ID | Purpose | Scope |
|-----|----|---------|-------|
| GA4 | `G-65SGS6S839` | Website analytics | All pages |
| Google Ads | `AW-18037100956` | Ad conversion tracking | All pages |
| GTM | `GTM-NPQCLFBX` | Tag management container | All pages |
| Firebase Analytics | `G-3CD96F6J65` | Firebase project analytics | Via Firebase SDK in hero-form.js |

---

## File Changes Summary

| File | Change |
|------|--------|
| All 20 `.html` pages | Added `gtag('config', 'AW-18037100956')` to existing gtag block |
| `assets/js/hero-form.js` | Added `conversion` event with `transaction_id` on form success |
| `GOOGLE_ADS_TRACKING_SETUP.md` | This documentation file |
