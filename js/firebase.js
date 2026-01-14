// firebase.js - Firebase initialization and exports
// Single source of truth for Firebase services

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
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

// Initialize Firebase app (single initialization point)
export const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Export serverTimestamp for use in other modules
export { serverTimestamp };

// Helper to get callable function
export const getCallable = (name) => {
  return httpsCallable(functions, name);
};

// Debug log (only in dev)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '') {
  console.log("[firebase] initialized", app.name, "project:", app.options.projectId);
}
