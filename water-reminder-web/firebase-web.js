import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import {
  doc,
  getDoc,
  getFirestore,
  setDoc
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCW7JK4_B9yPu2CoYw_zLCIGfVTXHnDH6Q",
  authDomain: "water-web-db94d.firebaseapp.com",
  projectId: "water-web-db94d",
  storageBucket: "water-web-db94d.firebasestorage.app",
  messagingSenderId: "572794555267",
  appId: "1:572794555267:web:d7c0f39076094d66cec4b6",
  measurementId: "G-88EJ2P7420"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

export {
  auth,
  db,
  doc,
  getDoc,
  onAuthStateChanged,
  provider,
  setDoc,
  signInWithPopup,
  signOut
};
