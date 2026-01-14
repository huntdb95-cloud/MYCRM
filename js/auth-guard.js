// auth-guard.js - Route protection and user context

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

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
  // Verify Firebase services are initialized
  if (!auth) {
    const error = new Error('Auth service not initialized. Check firebase.js for errors.');
    console.error('[auth-guard.js]', error);
    throw error;
  }
  
  if (!db) {
    const error = new Error('Firestore service not initialized. Check firebase.js for errors.');
    console.error('[auth-guard.js]', error);
    throw error;
  }
  
  return new Promise((resolve, reject) => {
    try {
      onAuthStateChanged(auth, async (user) => {
        try {
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
            console.error('[auth-guard.js] Failed to load user context:', error);
            console.error('[auth-guard.js] Error stack:', error.stack);
            console.error('[auth-guard.js] Error code:', error.code);
            console.error('[auth-guard.js] Error message:', error.message);
            reject(error);
          }
        } catch (callbackError) {
          console.error('[auth-guard.js] Error in onAuthStateChanged callback:', callbackError);
          // Don't reject the promise, just log the error
        }
      }, (error) => {
        // Error callback for onAuthStateChanged
        console.error('[auth-guard.js] onAuthStateChanged error:', error);
        reject(error);
      });
    } catch (setupError) {
      console.error('[auth-guard.js] Failed to set up auth state listener:', setupError);
      reject(setupError);
    }
  });
}

/**
 * Load user context (agency, role, etc.)
 * Uses deterministic userContext/{uid} pointer for fast lookup
 * 
 * Firestore reads performed:
 * 1. /userContext/{uid} - to get agencyId pointer
 * 2. /agencies/{agencyId}/users/{uid} - to get role and profile
 * 
 * If userContext doesn't exist, bootstrap creates:
 * - /agencies/{newAgencyId} - new agency doc
 * - /agencies/{newAgencyId}/users/{uid} - membership doc
 * - /userContext/{uid} - pointer to agencyId
 */
async function loadUserContext(user) {
  if (!db) {
    throw new Error('Firestore not initialized');
  }
  
  userStore.uid = user.uid;
  userStore.email = user.email;
  
  try {
    // STEP 1: Try to read userContext pointer (deterministic, no query needed)
    console.log('[auth-guard.js] Reading userContext for uid:', user.uid);
    const userContextRef = doc(db, 'userContext', user.uid);
    let userContextSnap;
    
    try {
      userContextSnap = await getDoc(userContextRef);
      console.log('[auth-guard.js] userContext read result:', userContextSnap.exists() ? 'exists' : 'not found');
    } catch (contextError) {
      console.error('[auth-guard.js] Failed to read userContext:', contextError);
      console.error('[auth-guard.js] Path attempted: userContext/' + user.uid);
      throw new Error(`Failed to read userContext: ${contextError.message}`);
    }
    
    let agencyId = null;
    
    if (userContextSnap.exists()) {
      // User has a context - get agencyId
      const contextData = userContextSnap.data();
      agencyId = contextData.agencyId;
      console.log('[auth-guard.js] Found agencyId from userContext:', agencyId);
    } else {
      // STEP 2: Bootstrap - create default agency and membership
      console.log('[auth-guard.js] No userContext found, bootstrapping...');
      agencyId = await bootstrapUserAgency(user);
    }
    
    if (!agencyId) {
      throw new Error('Failed to determine agencyId');
    }
    
    // STEP 3: Read membership doc to get role and profile
    console.log('[auth-guard.js] Reading membership doc: agencies/' + agencyId + '/users/' + user.uid);
    const membershipRef = doc(db, 'agencies', agencyId, 'users', user.uid);
    let membershipSnap;
    
    try {
      membershipSnap = await getDoc(membershipRef);
      console.log('[auth-guard.js] Membership read result:', membershipSnap.exists() ? 'exists' : 'not found');
    } catch (membershipError) {
      console.error('[auth-guard.js] Failed to read membership doc:', membershipError);
      console.error('[auth-guard.js] Path attempted: agencies/' + agencyId + '/users/' + user.uid);
      throw new Error(`Failed to read membership: ${membershipError.message}`);
    }
    
    if (!membershipSnap.exists()) {
      throw new Error(`Membership doc not found for agency ${agencyId}. Bootstrap may have failed.`);
    }
    
    const membershipData = membershipSnap.data();
    userStore.agencyId = agencyId;
    userStore.role = membershipData.role || 'agent';
    userStore.displayName = membershipData.displayName || user.email?.split('@')[0] || 'User';
    
    console.log('[auth-guard.js] User context loaded:', {
      agencyId: userStore.agencyId,
      role: userStore.role,
      displayName: userStore.displayName
    });
    
  } catch (error) {
    console.error('[auth-guard.js] Error loading user context:', error);
    console.error('[auth-guard.js] Error details:', {
      uid: user.uid,
      email: user.email,
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    console.error('[auth-guard.js] Last attempted path:', error.lastPath || 'unknown');
    throw error;
  }
}

/**
 * Bootstrap: Create default agency and membership for new user
 * Creates:
 * 1. /agencies/{newAgencyId} with createdByUid = user.uid
 * 2. /agencies/{newAgencyId}/users/{user.uid} with role="admin"
 * 3. /userContext/{user.uid} pointing to agencyId
 */
async function bootstrapUserAgency(user) {
  if (!db) {
    throw new Error('Firestore not initialized');
  }
  
  try {
    console.log('[auth-guard.js] Creating default agency for user:', user.uid);
    
    // STEP 1: Create agency doc
    const agencyRef = doc(collection(db, 'agencies'));
    const agencyId = agencyRef.id;
    
    console.log('[auth-guard.js] Creating agency doc: agencies/' + agencyId);
    try {
      await setDoc(agencyRef, {
        name: 'Default Agency',
        createdByUid: user.uid, // Required by rules
        isDefault: true,
        createdAt: serverTimestamp(),
      });
      console.log('[auth-guard.js] ✓ Agency doc created');
    } catch (agencyError) {
      console.error('[auth-guard.js] Failed to create agency doc:', agencyError);
      console.error('[auth-guard.js] Error details:', {
        uid: user.uid,
        agencyId: agencyId,
        path: 'agencies/' + agencyId,
        code: agencyError.code,
        message: agencyError.message
      });
      throw new Error(`Failed to create agency: ${agencyError.message}`);
    }
    
    // STEP 2: Create membership doc
    const membershipRef = doc(db, 'agencies', agencyId, 'users', user.uid);
    
    console.log('[auth-guard.js] Creating membership doc: agencies/' + agencyId + '/users/' + user.uid);
    try {
      await setDoc(membershipRef, {
        role: 'admin',
        displayName: user.displayName || user.email?.split('@')[0] || 'Admin',
        email: user.email,
        phone: null,
        createdAt: serverTimestamp(),
      });
      console.log('[auth-guard.js] ✓ Membership doc created');
    } catch (membershipError) {
      console.error('[auth-guard.js] Failed to create membership doc:', membershipError);
      console.error('[auth-guard.js] Error details:', {
        uid: user.uid,
        agencyId: agencyId,
        path: 'agencies/' + agencyId + '/users/' + user.uid,
        code: membershipError.code,
        message: membershipError.message
      });
      throw new Error(`Failed to create membership: ${membershipError.message}`);
    }
    
    // STEP 3: Create userContext pointer
    const userContextRef = doc(db, 'userContext', user.uid);
    
    console.log('[auth-guard.js] Creating userContext pointer: userContext/' + user.uid);
    try {
      await setDoc(userContextRef, {
        agencyId: agencyId,
        role: 'admin',
        createdAt: serverTimestamp(),
      });
      console.log('[auth-guard.js] ✓ UserContext pointer created');
    } catch (contextError) {
      console.error('[auth-guard.js] Failed to create userContext:', contextError);
      console.error('[auth-guard.js] Path attempted: userContext/' + user.uid);
      // Non-fatal - we can still proceed with agencyId
      console.warn('[auth-guard.js] Continuing without userContext pointer');
    }
    
    console.log('[auth-guard.js] Bootstrap complete, agencyId:', agencyId);
    return agencyId;
    
  } catch (error) {
    console.error('[auth-guard.js] Error in bootstrapUserAgency:', error);
    throw error;
  }
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
