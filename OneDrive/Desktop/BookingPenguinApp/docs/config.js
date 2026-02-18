// ============================================================================
// BookingPenguin - Firebase Configuration
// ============================================================================

// Firebase SDK imports (using CDN compat version for simplicity)
// These are loaded via script tags in HTML files

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDNDgnMzJS4jcUWzSvc3HGZ3TQ8Aqdwj88",
  authDomain: "bookingsharks.firebaseapp.com",
  projectId: "bookingsharks",
  storageBucket: "bookingsharks.firebasestorage.app",
  messagingSenderId: "1001909127976",
  appId: "1:1001909127976:web:88594c6d27950ded1b9e1d",
  measurementId: "G-THERN2BM30"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();

// Detect Safari/Mac for special handling
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isPrivateBrowsing = (() => {
  try {
    localStorage.setItem('__test__', 'test');
    localStorage.removeItem('__test__');
    return false;
  } catch (e) {
    return true;
  }
})();

// Make browser detection available globally for other scripts
window.browserEnv = { isSafari, isMac, isIOS, isPrivateBrowsing };

// Log browser environment for debugging
console.log('[BookingPenguin] Browser environment:', { 
  isSafari, 
  isMac, 
  isIOS,
  isPrivateBrowsing,
  userAgent: navigator.userAgent 
});

// IMPORTANT: Skip persistence entirely on Safari/Mac/iOS
// Safari's IndexedDB implementation causes severe performance issues and hangs
// The app works fine without persistence - it just won't cache data offline
if (isSafari || isMac || isIOS || isPrivateBrowsing) {
  console.log('[BookingPenguin] Safari/Mac/iOS detected - skipping Firestore persistence for better performance');
} else {
  // Enable offline persistence only for Chrome/Firefox on Windows/Linux
  db.enablePersistence({ synchronizeTabs: true })
    .then(() => {
      console.log('[BookingPenguin] Firestore persistence enabled');
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.log('[BookingPenguin] Persistence failed: Multiple tabs open');
      } else if (err.code === 'unimplemented') {
        console.log('[BookingPenguin] Persistence not supported by browser');
      } else {
        console.log('[BookingPenguin] Persistence error:', err.message);
      }
    });
}

// Initialize Firebase Storage
const storage = firebase.storage();

// ═══════════════════════════════════════════════════════════════════════════════
// Firebase App Check (reCAPTCHA v3)
// ═══════════════════════════════════════════════════════════════════════════════
// App Check verifies that requests come from your real app, not bots or scripts.
//
// SETUP REQUIRED (one-time, in Firebase Console):
// 1. Go to https://console.firebase.google.com/project/bookingsharks/appcheck
// 2. Click your Web App → Register → choose reCAPTCHA v3
// 3. Go to https://www.google.com/recaptcha/admin to create a v3 site key
//    (add domains: bookingpenguin.com, bookingsharks.web.app, localhost)
// 4. Paste the site key below and set APP_CHECK_ENABLED = true
// 5. Deploy, then enable enforcement in Firebase Console for Cloud Functions
// ═══════════════════════════════════════════════════════════════════════════════
const APP_CHECK_ENABLED = false; // Set to true after completing Console setup
const APP_CHECK_RECAPTCHA_SITE_KEY = 'YOUR_RECAPTCHA_V3_SITE_KEY'; // Replace with real key

if (APP_CHECK_ENABLED && typeof firebase.appCheck === 'function') {
  try {
    const appCheck = firebase.appCheck();
    appCheck.activate(
      new firebase.appCheck.ReCaptchaV3Provider(APP_CHECK_RECAPTCHA_SITE_KEY),
      true // Auto-refresh tokens
    );
    console.log('[BookingPenguin] App Check initialized');
  } catch (e) {
    console.warn('[BookingPenguin] App Check initialization failed:', e.message);
  }
}

// Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Export for use in other files (global scope for vanilla JS)
window.auth = auth;
window.db = db;
window.storage = storage;
window.googleProvider = googleProvider;

console.log('[BookingPenguin] Firebase initialized successfully');
