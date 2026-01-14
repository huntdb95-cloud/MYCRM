// index.js (ESM module)

console.log('[index.js] Module loading...');

// Import from centralized Firebase module
import { auth } from './js/firebase.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
// Verify Firebase services are initialized
if (!auth) {
  const error = new Error('Auth service not initialized. Check firebase.js for errors.');
  console.error('[index.js]', error);
  // Error banner should already be shown by firebase.js
  throw error;
}

// ======= UI HELPERS =======
const $ = (id) => document.getElementById(id);

const ui = {
  pillOut: $("pillSignedOut"),
  pillIn: $("pillSignedIn"),
  btnLogout: $("btnLogout"),

  boxOut: $("authBoxSignedOut"),
  boxIn: $("authBoxSignedIn"),

  email: $("email"),
  password: $("password"),
  btnLogin: $("btnLogin"),
  btnSignup: $("btnSignup"),
  status: $("status"),

  userLine: $("userLine"),
  btnGoDashboard: $("btnGoDashboard"),
  statusAuthed: $("statusAuthed"),
};

function setStatus(msg, isError = false) {
  if (ui.status) {
    ui.status.textContent = msg;
    ui.status.style.color = isError ? "var(--danger)" : "var(--muted)";
  }
}

function showSignedIn(user) {
  if (ui.pillOut) ui.pillOut.classList.add("hidden");
  if (ui.pillIn) ui.pillIn.classList.remove("hidden");
  if (ui.btnLogout) ui.btnLogout.classList.remove("hidden");

  if (ui.boxOut) ui.boxOut.classList.add("hidden");
  if (ui.boxIn) ui.boxIn.classList.remove("hidden");

  if (ui.userLine) {
    ui.userLine.textContent = `${user.email} • UID: ${user.uid}`;
  }
}

function showSignedOut() {
  if (ui.pillOut) ui.pillOut.classList.remove("hidden");
  if (ui.pillIn) ui.pillIn.classList.add("hidden");
  if (ui.btnLogout) ui.btnLogout.classList.add("hidden");

  if (ui.boxOut) ui.boxOut.classList.remove("hidden");
  if (ui.boxIn) ui.boxIn.classList.add("hidden");
}

// ======= USER PROFILE DOC =======
// NOTE: Profile is handled by auth-guard.js bootstrap flow
// which creates agency membership at agencies/{agencyId}/users/{uid}
// This matches the Firestore rules structure

// ======= AUTH ACTIONS =======
async function login(email, password) {
  if (!auth) {
    throw new Error('Auth not initialized');
  }
  await signInWithEmailAndPassword(auth, email, password);
}

async function signup(email, password) {
  if (!auth) {
    throw new Error('Auth not initialized');
  }
  await createUserWithEmailAndPassword(auth, email, password);
}

async function logout() {
  if (!auth) {
    throw new Error('Auth not initialized');
  }
  await signOut(auth);
}

// ======= BUTTON HANDLERS =======
if (ui.btnLogin) {
  ui.btnLogin.addEventListener("click", async () => {
    const email = ui.email?.value.trim();
    const password = ui.password?.value;

    if (!email || !password) return setStatus("Enter email + password.", true);

    try {
      setStatus("Logging in...");
      await login(email, password);
      setStatus("Logged in.");
    } catch (e) {
      const errorMsg = e?.message || String(e);
      console.error('[index.js] Login error:', e);
      setStatus(`Login failed: ${errorMsg}`, true);
    }
  });
}

if (ui.btnSignup) {
  ui.btnSignup.addEventListener("click", async () => {
    const email = ui.email?.value.trim();
    const password = ui.password?.value;

    if (!email || !password) return setStatus("Enter email + password.", true);
    if (password.length < 6) return setStatus("Password must be at least 6 characters.", true);

    try {
      setStatus("Creating account...");
      await signup(email, password);
      setStatus("Account created. You are signed in.");
    } catch (e) {
      const errorMsg = e?.message || String(e);
      console.error('[index.js] Signup error:', e);
      setStatus(`Signup failed: ${errorMsg}`, true);
    }
  });
}

if (ui.btnLogout) {
  ui.btnLogout.addEventListener("click", async () => {
    try {
      await logout();
    } catch (e) {
      console.error('[index.js] Logout error:', e);
      // no-op
    }
  });
}

// ======= DASHBOARD BUTTON =======
if (ui.btnGoDashboard) {
  ui.btnGoDashboard.addEventListener("click", () => {
    window.location.href = "/app.html";
  });
}

// ======= AUTH STATE LISTENER =======
try {
  if (!auth) {
    throw new Error('Auth service not initialized');
  }
  
  onAuthStateChanged(auth, async (user) => {
    try {
      if (!user) {
        showSignedOut();
        return;
      }

      // User is signed in - show UI
      // Profile/agency bootstrap is handled by auth-guard.js when user navigates to app pages
      showSignedIn(user);
      
      // Auto-redirect to app if on index page
      if (window.location.pathname === '/index.html' || window.location.pathname === '/') {
        setTimeout(() => {
          window.location.href = "/app.html";
        }, 1000);
      }
    } catch (error) {
      console.error('[index.js] Error in onAuthStateChanged callback:', error);
      // Don't crash the app, just log the error
    }
  });
} catch (authError) {
  console.error('[index.js] Failed to set up auth state listener:', authError);
  setStatus(`Auth initialization failed: ${authError?.message || authError}`, true);
}

console.log('[index.js] Module loaded and initialized');
