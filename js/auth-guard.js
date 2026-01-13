// auth-guard.js - Route protection and user context

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Global user context store
export const userStore = {
  uid: null,
  email: null,
  agencyId: null,
  role: null,
  displayName: null,
};

/**
 * Initialize auth guard - redirects to index.html if not logged in
 * Returns promise that resolves when user is loaded
 */
export async function initAuthGuard() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // Not logged in - redirect to index
        if (window.location.pathname !== '/index.html' && !window.location.pathname.endsWith('/')) {
          window.location.href = '/index.html';
        }
        resolve(null);
        return;
      }
      
      try {
        // Load user profile and agency
        await loadUserContext(user);
        resolve(userStore);
      } catch (error) {
        console.error('Failed to load user context:', error);
        reject(error);
      }
    });
  });
}

/**
 * Load user context (agency, role, etc.)
 */
async function loadUserContext(user) {
  userStore.uid = user.uid;
  userStore.email = user.email;
  
  // First, try to find user in any agency
  const usersRef = collection(db, 'agencies');
  const agenciesSnapshot = await getDocs(usersRef);
  
  let foundAgency = null;
  let userDoc = null;
  
  for (const agencyDoc of agenciesSnapshot.docs) {
    const userRef = doc(db, 'agencies', agencyDoc.id, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      foundAgency = agencyDoc.id;
      userDoc = userSnap.data();
      break;
    }
  }
  
  // If no agency found, create default agency and add user as admin
  if (!foundAgency) {
    foundAgency = await createDefaultAgency(user);
    const userRef = doc(db, 'agencies', foundAgency, 'users', user.uid);
    userDoc = (await getDoc(userRef)).data();
  }
  
  userStore.agencyId = foundAgency;
  userStore.role = userDoc?.role || 'agent';
  userStore.displayName = userDoc?.displayName || user.email?.split('@')[0] || 'User';
}

/**
 * Create default agency for new user
 */
async function createDefaultAgency(user) {
  const agencyRef = doc(collection(db, 'agencies'));
  const agencyId = agencyRef.id;
  
  await setDoc(agencyRef, {
    name: 'Default Agency',
    createdAt: serverTimestamp(),
  });
  
  // Add user as admin
  const userRef = doc(db, 'agencies', agencyId, 'users', user.uid);
  await setDoc(userRef, {
    role: 'admin',
    displayName: user.displayName || user.email?.split('@')[0] || 'Admin',
    email: user.email,
    phone: null,
    createdAt: serverTimestamp(),
  });
  
  return agencyId;
}

/**
 * Check if user has required role
 */
export function hasRole(...roles) {
  return roles.includes(userStore.role);
}

/**
 * Require role - throws if user doesn't have required role
 */
export function requireRole(...roles) {
  if (!hasRole(...roles)) {
    throw new Error(`Access denied. Required role: ${roles.join(' or ')}`);
  }
}
