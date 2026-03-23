import { Capacitor } from '@capacitor/core';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import { firebaseConfig } from './firebase-config.js';

export const firebaseApp = initializeApp(firebaseConfig);

let authInstance;

export function getFirebaseAuth() {
  if (!authInstance) {
    authInstance = Capacitor.isNativePlatform()
      ? initializeAuth(firebaseApp, {
          persistence: indexedDBLocalPersistence,
        })
      : getAuth(firebaseApp);
  }

  return authInstance;
}

export const db = getFirestore(firebaseApp);
