// firebase.js - Bulletproof Firebase initialization and exports

console.log('[firebase.js] Module loading...');

// Import Firebase modules (must be at top level)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-analytics.js";
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

// Initialize state tracking
let initializationState = {
  app: null,
  auth: null,
  db: null,
  storage: null,
  functions: null,
  analytics: null,
  initialized: false,
  errors: []
};

// Error banner element (created on first error)
let errorBanner = null;

/**
 * Show initialization error banner
 */
function showErrorBanner(error, details = {}) {
  if (!errorBanner) {
    errorBanner = document.createElement('div');
    errorBanner.id = 'initErrorBanner';
    errorBanner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, rgba(251, 113, 133, 0.95), rgba(220, 38, 38, 0.95));
      color: white;
      padding: 20px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      font-family: system-ui, -apple-system, sans-serif;
    `;
    document.body.insertBefore(errorBanner, document.body.firstChild);
  }
  
  const errorMessage = error?.message || String(error);
  const errorStack = error?.stack || '';
  
  errorBanner.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto;">
      <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700;">
        ⚠️ Initialization Error
      </h3>
      <div style="margin-bottom: 12px; font-size: 14px; line-height: 1.6;">
        <strong>Error:</strong> ${escapeHtml(errorMessage)}
      </div>
      ${errorStack ? `<details style="margin-top: 12px;"><summary style="cursor: pointer; font-weight: 600;">Stack Trace</summary><pre style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; margin-top: 8px;">${escapeHtml(errorStack)}</pre></details>` : ''}
      ${details.url ? `<div style="margin-top: 8px; font-size: 12px; opacity: 0.9;">URL: ${escapeHtml(details.url)}</div>` : ''}
      ${details.isFileProtocol ? `<div style="margin-top: 8px; padding: 8px; background: rgba(255,255,255,0.2); border-radius: 6px; font-size: 13px;"><strong>⚠️ File Protocol Detected:</strong> Firebase will not work with file:// URLs. Use localhost or deploy to hosting.</div>` : ''}
      <div style="margin-top: 16px; font-size: 13px; opacity: 0.9;">
        <strong>Common causes:</strong>
        <ul style="margin: 8px 0 0 20px; padding: 0;">
          <li>Firebase config is incorrect or missing</li>
          <li>Network connectivity issues</li>
          <li>Running from file:// protocol (use localhost or hosting)</li>
          <li>Browser blocking Firebase requests (check console for CORS errors)</li>
        </ul>
      </div>
      <button onclick="this.parentElement.parentElement.parentElement.remove(); location.reload();" style="margin-top: 16px; padding: 8px 16px; background: white; color: #dc2626; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
        Dismiss & Reload
      </button>
    </div>
  `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Create debug panel
 */
function createDebugPanel() {
  const panel = document.createElement('div');
  panel.id = 'firebaseDebugPanel';
  panel.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(18, 27, 46, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 16px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #e9f0ff;
    z-index: 9999;
    max-width: 400px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(8px);
  `;
  
  function updatePanel() {
    const isFileProtocol = window.location.protocol === 'file:';
    const url = window.location.href;
    
    panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <strong style="color: #5eead4;">Firebase Debug</strong>
        <button onclick="document.getElementById('firebaseDebugPanel').remove();" style="background: transparent; border: none; color: #9fb0d0; cursor: pointer; font-size: 16px;">×</button>
      </div>
      <div style="line-height: 1.8;">
        <div><strong>URL:</strong> ${escapeHtml(url.substring(0, 50))}${url.length > 50 ? '...' : ''}</div>
        <div><strong>Protocol:</strong> <span style="color: ${isFileProtocol ? '#fb7185' : '#5eead4'}">${window.location.protocol}</span></div>
        ${isFileProtocol ? '<div style="color: #fbbf24; margin-top: 8px; padding: 8px; background: rgba(251, 191, 36, 0.1); border-radius: 6px; font-size: 10px;">⚠️ Firebase will fail under file:// — use localhost or hosting</div>' : ''}
        <div><strong>Project ID:</strong> ${firebaseConfig.projectId || 'N/A'}</div>
        <div><strong>Auth:</strong> <span style="color: ${initializationState.auth ? '#5eead4' : '#fb7185'}">${initializationState.auth ? '✓' : '✗'}</span></div>
        <div><strong>Firestore:</strong> <span style="color: ${initializationState.db ? '#5eead4' : '#fb7185'}">${initializationState.db ? '✓' : '✗'}</span></div>
        <div><strong>Storage:</strong> <span style="color: ${initializationState.storage ? '#5eead4' : '#fb7185'}">${initializationState.storage ? '✓' : '✗'}</span></div>
        <div><strong>Functions:</strong> <span style="color: ${initializationState.functions ? '#5eead4' : '#fb7185'}">${initializationState.functions ? '✓' : '✗'}</span></div>
        <div><strong>Analytics:</strong> <span style="color: ${initializationState.analytics ? '#5eead4' : '#fb7185'}">${initializationState.analytics ? '✓' : '✗'}</span></div>
        ${initializationState.errors.length > 0 ? `<div style="margin-top: 8px; color: #fb7185;"><strong>Errors:</strong> ${initializationState.errors.length}</div>` : ''}
      </div>
    `;
  }
  
  updatePanel();
  setInterval(updatePanel, 2000); // Update every 2 seconds
  
  document.body.appendChild(panel);
  
  // Show warning if file:// protocol
  if (window.location.protocol === 'file:') {
    console.warn('[firebase.js] WARNING: Running on file:// protocol. Firebase will not work. Use localhost or deploy to hosting.');
  }
}

// Initialize Firebase with comprehensive error handling
try {
  console.log('[firebase.js] Initializing Firebase...');
  
  // Check for file:// protocol
  const isFileProtocol = window.location.protocol === 'file:';
  if (isFileProtocol) {
    console.warn('[firebase.js] WARNING: file:// protocol detected. Firebase requires HTTP/HTTPS.');
  }
  
  // Validate config
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error('Firebase config is missing required fields (apiKey, projectId)');
  }
  
  // Initialize Firebase app
  try {
    console.log('[firebase.js] Initializing Firebase app...');
    initializationState.app = initializeApp(firebaseConfig);
    console.log('[firebase.js] ✓ Firebase app initialized');
  } catch (appError) {
    throw new Error(`Firebase app initialization failed: ${appError.message}`);
  }
  
  // Initialize Analytics (non-critical, wrap in try/catch)
  // Analytics can be blocked by ad blockers (ERR_BLOCKED_BY_CLIENT)
  try {
    initializationState.analytics = getAnalytics(initializationState.app);
    console.log('[firebase.js] ✓ Analytics initialized');
  } catch (analyticsError) {
    // Check if blocked by client (ad blocker)
    const isBlocked = analyticsError.message?.includes('blocked') || 
                      analyticsError.message?.includes('gtag') ||
                      analyticsError.code === 'ERR_BLOCKED_BY_CLIENT';
    
    if (isBlocked) {
      console.warn('[firebase.js] Analytics blocked by client (ad blocker); continuing.');
    } else {
      console.warn('[firebase.js] Analytics initialization failed (non-critical):', analyticsError);
    }
    initializationState.errors.push({ type: 'analytics', error: analyticsError });
  }
  
  // Initialize Auth
  try {
    initializationState.auth = getAuth(initializationState.app);
    console.log('[firebase.js] ✓ Auth initialized');
  } catch (authError) {
    throw new Error(`Auth initialization failed: ${authError.message}`);
  }
  
  // Initialize Firestore
  try {
    initializationState.db = getFirestore(initializationState.app);
    console.log('[firebase.js] ✓ Firestore initialized');
  } catch (dbError) {
    throw new Error(`Firestore initialization failed: ${dbError.message}`);
  }
  
  // Initialize Storage
  try {
    initializationState.storage = getStorage(initializationState.app);
    console.log('[firebase.js] ✓ Storage initialized');
  } catch (storageError) {
    console.warn('[firebase.js] Storage initialization failed (non-critical):', storageError);
    initializationState.errors.push({ type: 'storage', error: storageError });
  }
  
  // Initialize Functions
  try {
    initializationState.functions = getFunctions(initializationState.app);
    console.log('[firebase.js] ✓ Functions initialized');
  } catch (functionsError) {
    console.warn('[firebase.js] Functions initialization failed (non-critical):', functionsError);
    initializationState.errors.push({ type: 'functions', error: functionsError });
  }
  
  // Mark as initialized
  initializationState.initialized = true;
  console.log('[firebase.js] ✓ Firebase initialization complete');
  
  // Create debug panel (only in development or if errors occurred)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '' || initializationState.errors.length > 0) {
    setTimeout(() => createDebugPanel(), 500);
  }
  
} catch (topLevelError) {
  console.error('[firebase.js] Top-level initialization error:', topLevelError);
  console.error('[firebase.js] Stack trace:', topLevelError.stack);
  initializationState.errors.push({ type: 'top-level', error: topLevelError });
  showErrorBanner(topLevelError, {
    url: window.location.href,
    isFileProtocol: window.location.protocol === 'file:'
  });
}

// Export services (will be null if initialization failed)
export const app = initializationState.app;
export const auth = initializationState.auth;
export const db = initializationState.db;
export const storage = initializationState.storage;
export const functions = initializationState.functions;
export { serverTimestamp };

// Helper to get callable function
export const getCallable = (name) => {
  if (!initializationState.functions) {
    throw new Error('Functions not initialized. Check Firebase initialization errors.');
  }
  return httpsCallable(initializationState.functions, name);
};

// Export initialization state for debugging
export const getInitializationState = () => ({ ...initializationState });

// Export firebaseConfig for reference
export { firebaseConfig };
