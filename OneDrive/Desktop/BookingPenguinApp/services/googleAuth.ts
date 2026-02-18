/**
 * Google Sign-In Service
 *
 * IMPORTANT: Google Sign-In requires a development build (EAS Build or `npx expo run:ios/android`).
 * It does NOT work in Expo Go.
 *
 * Setup steps when ready for a dev build:
 *
 * 1. Install packages:
 *    npx expo install @react-native-google-signin/google-signin expo-dev-client
 *
 * 2. Add config plugin to app.json:
 *    "plugins": [
 *      "expo-router",
 *      "@react-native-google-signin/google-signin"
 *    ]
 *
 * 3. Add iOS GoogleService-Info.plist and Android google-services.json from Firebase Console
 *
 * 4. Configure webClientId from Firebase Console -> Authentication -> Sign-in method -> Google
 *    (Use the Web client ID from the Google Cloud Console OAuth 2.0 credentials)
 *
 * 5. Build with EAS: eas build --profile development --platform ios/android
 *
 * 6. Uncomment the real implementation below and remove the stub.
 */

import { Alert } from 'react-native';

const WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

let _googleSignInConfigured = false;

export function configureGoogleSignIn() {
  // STUB: Uncomment when @react-native-google-signin/google-signin is installed
  //
  // import { GoogleSignin } from '@react-native-google-signin/google-signin';
  // GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  // _googleSignInConfigured = true;

  _googleSignInConfigured = false;
}

export async function getGoogleIdToken(): Promise<string | null> {
  if (!_googleSignInConfigured) {
    Alert.alert(
      'Google Sign-In Unavailable',
      'Google Sign-In requires a development build. It is not available in Expo Go.\n\n' +
      'To enable:\n' +
      '1. Run: npx expo install @react-native-google-signin/google-signin expo-dev-client\n' +
      '2. Create a development build with EAS\n' +
      '3. Install the dev build on your device'
    );
    return null;
  }

  // STUB: Uncomment when @react-native-google-signin/google-signin is installed
  //
  // try {
  //   const { GoogleSignin } = require('@react-native-google-signin/google-signin');
  //   await GoogleSignin.hasPlayServices();
  //   const userInfo = await GoogleSignin.signIn();
  //   return userInfo.data?.idToken || null;
  // } catch (error: any) {
  //   if (error.code === 'SIGN_IN_CANCELLED') return null;
  //   throw error;
  // }

  return null;
}

export async function signOutGoogle(): Promise<void> {
  // STUB: Uncomment when @react-native-google-signin/google-signin is installed
  //
  // try {
  //   const { GoogleSignin } = require('@react-native-google-signin/google-signin');
  //   await GoogleSignin.signOut();
  // } catch { /* ignore */ }
}
