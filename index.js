// index.js (ESM module)

// Firebase core
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-analytics.js";

// Auth
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

// Firestore
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ======= YOUR FIREBASE CONFIG =======
const firebaseConfig = {
  apiKey: "AIzaSyDJq_7uSW2V78G9vEBSEUfBxSdiUWzLN-Q",
  authDomain: "mycrm-6aaf1.firebaseapp.com",
  projectId: "mycrm-6aaf1",
  storageBucket: "mycrm-6aaf1.firebasestorage.app",
  messagingSenderId: "743664044169",
  appId: "1:743664044169:web:e03088be017c3153a1de58",
  measurementId: "G-Q38C3V5VN8",
};

// Init
const app = initializeApp(firebaseConfig);
getAnalytics(app);

const auth = getAuth(app);
const db = getFirestore(app);

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
  ui.status.textContent = msg;
  ui.status.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function showSignedIn(user) {
  ui.pillOut.classList.add("hidden");
  ui.pillIn.classList.remove("hidden");
  ui.btnLogout.classList.remove("hidden");

  ui.boxOut.classList.add("hidden");
  ui.boxIn.classList.remove("hidden");

  ui.userLine.textContent = `${user.email} • UID: ${user.uid}`;
}

function showSignedOut() {
  ui.pillOut.classList.remove("hidden");
  ui.pillIn.classList.add("hidden");
  ui.btnLogout.classList.add("hidden");

  ui.boxOut.classList.remove("hidden");
  ui.boxIn.classList.add("hidden");
}

// ======= USER PROFILE DOC (users/{uid}) =======
async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // Create a basic profile document
    await setDoc(ref, {
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      role: "admin", // starter default; change to "agent" later if you want
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    // Touch updatedAt (optional, but handy)
    await setDoc(
      ref,
      { updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
}

// ======= AUTH ACTIONS =======
async function login(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

async function signup(email, password) {
  await createUserWithEmailAndPassword(auth, email, password);
}

async function logout() {
  await signOut(auth);
}

// ======= BUTTON HANDLERS =======
ui.btnLogin.addEventListener("click", async () => {
  const email = ui.email.value.trim();
  const password = ui.password.value;

  if (!email || !password) return setStatus("Enter email + password.", true);

  try {
    setStatus("Logging in...");
    await login(email, password);
    setStatus("Logged in.");
  } catch (e) {
    setStatus(`Login failed: ${e?.message || e}`, true);
  }
});

ui.btnSignup.addEventListener("click", async () => {
  const email = ui.email.value.trim();
  const password = ui.password.value;

  if (!email || !password) return setStatus("Enter email + password.", true);
  if (password.length < 6) return setStatus("Password must be at least 6 characters.", true);

  try {
    setStatus("Creating account...");
    await signup(email, password);
    setStatus("Account created. You are signed in.");
  } catch (e) {
    setStatus(`Signup failed: ${e?.message || e}`, true);
  }
});

ui.btnLogout.addEventListener("click", async () => {
  try {
    await logout();
  } catch (e) {
    // no-op
  }
});

// ======= DASHBOARD BUTTON =======
// You can change this to your real app page later (app.html, dashboard.html, etc.)
ui.btnGoDashboard.addEventListener("click", () => {
  // Example: location.href = "/app.html";
  ui.statusAuthed.textContent = "Dashboard not created yet. Create app.html and redirect here.";
});

// ======= AUTH STATE LISTENER =======
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showSignedOut();
    return;
  }

  try {
    await ensureUserProfile(user);
    showSignedIn(user);
  } catch (e) {
    showSignedIn(user);
    ui.statusAuthed.textContent = `Signed in, but profile doc update failed: ${e?.message || e}`;
  }
});
