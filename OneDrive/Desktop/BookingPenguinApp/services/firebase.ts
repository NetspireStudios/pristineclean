import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
// @ts-expect-error getReactNativePersistence exists at runtime but is missing from TS types in firebase v12
import { getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: 'AIzaSyDNDgnMzJS4jcUWzSvc3HGZ3TQ8Aqdwj88',
  authDomain: 'bookingsharks.firebaseapp.com',
  projectId: 'bookingsharks',
  storageBucket: 'bookingsharks.firebasestorage.app',
  messagingSenderId: '1001909127976',
  appId: '1:1001909127976:web:88594c6d27950ded1b9e1d',
};

const app = initializeApp(firebaseConfig);

const auth =
  Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });

const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'us-central1');

export { app, auth, db, storage, functions };
