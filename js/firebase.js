// firebase.js - Firebase initialization and exports

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-functions.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDJq_7uSW2V78G9vEBSEUfBxSdiUWzLN-Q",
  authDomain: "mycrm-6aaf1.firebaseapp.com",
  projectId: "mycrm-6aaf1",
  storageBucket: "mycrm-6aaf1.firebasestorage.app",
  messagingSenderId: "743664044169",
  appId: "1:743664044169:web:e03088be017c3153a1de58",
  measurementId: "G-Q38C3V5VN8",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
getAnalytics(app);

// Export services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Helper to get callable function
export const getCallable = (name) => httpsCallable(functions, name);
