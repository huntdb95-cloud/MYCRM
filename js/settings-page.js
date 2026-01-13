// settings-page.js - Settings page

import { auth } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import { initRouter, navigateTo } from './router.js';
import { db } from './firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { toast } from './ui.js';

async function init() {
  try {
    await initAuthGuard();
    initRouter();
    setupUI();
    await loadSettings();
  } catch (error) {
    console.error('Failed to initialize:', error);
    toast('Failed to initialize page', 'error');
  }
}

function setupUI() {
  // User info
  const userNameEl = document.getElementById('userName');
  const userRoleEl = document.getElementById('userRole');
  if (userNameEl) userNameEl.textContent = userStore.displayName || userStore.email || 'User';
  if (userRoleEl) userRoleEl.textContent = userStore.role || '—';
  
  // Logout
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await signOut(auth);
        navigateTo('/index.html');
      } catch (error) {
        toast('Failed to log out', 'error');
      }
    });
  }
  
  // Menu toggle
  const btnMenuToggle = document.getElementById('btnMenuToggle');
  const sidebar = document.getElementById('sidebar');
  if (btnMenuToggle && sidebar) {
    btnMenuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
  
  // Save profile
  const btnSaveProfile = document.getElementById('btnSaveProfile');
  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', handleSaveProfile);
  }
  
  // Save Twilio settings
  const btnSaveTwilio = document.getElementById('btnSaveTwilio');
  if (btnSaveTwilio) {
    btnSaveTwilio.addEventListener('click', handleSaveTwilio);
  }
}

async function loadSettings() {
  try {
    // Load user profile
    const userRef = doc(db, 'agencies', userStore.agencyId, 'users', userStore.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const userEmail = document.getElementById('userEmail');
      const userDisplayName = document.getElementById('userDisplayName');
      const userRoleDisplay = document.getElementById('userRoleDisplay');
      
      if (userEmail) userEmail.value = userData.email || userStore.email || '';
      if (userDisplayName) userDisplayName.value = userData.displayName || userStore.displayName || '';
      if (userRoleDisplay) userRoleDisplay.value = userData.role || userStore.role || '';
    }
    
    // Load Twilio settings
    const twilioRef = doc(db, 'agencies', userStore.agencyId, 'settings', 'twilio');
    const twilioSnap = await getDoc(twilioRef);
    
    if (twilioSnap.exists()) {
      const twilioData = twilioSnap.data();
      const twilioNumber = document.getElementById('twilioNumber');
      const webhookUrl = document.getElementById('webhookUrl');
      const autoReplyEnabled = document.getElementById('autoReplyEnabled');
      
      if (twilioNumber) twilioNumber.value = twilioData.twilioNumber || '';
      if (webhookUrl) webhookUrl.value = twilioData.statusCallbackUrl || '';
      if (autoReplyEnabled) autoReplyEnabled.checked = twilioData.autoReplyEnabled || false;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    toast('Failed to load settings', 'error');
  }
}

async function handleSaveProfile() {
  try {
    const userDisplayName = document.getElementById('userDisplayName')?.value.trim();
    
    const userRef = doc(db, 'agencies', userStore.agencyId, 'users', userStore.uid);
    await setDoc(userRef, {
      displayName: userDisplayName || null,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    
    userStore.displayName = userDisplayName || userStore.email?.split('@')[0] || 'User';
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = userStore.displayName;
    
    toast('Profile saved', 'success');
  } catch (error) {
    console.error('Error saving profile:', error);
    toast('Failed to save profile', 'error');
  }
}

async function handleSaveTwilio() {
  try {
    const twilioNumber = document.getElementById('twilioNumber')?.value.trim();
    const webhookUrl = document.getElementById('webhookUrl')?.value.trim();
    const autoReplyEnabled = document.getElementById('autoReplyEnabled')?.checked || false;
    
    const twilioRef = doc(db, 'agencies', userStore.agencyId, 'settings', 'twilio');
    await setDoc(twilioRef, {
      twilioNumber: twilioNumber || null,
      statusCallbackUrl: webhookUrl || null,
      autoReplyEnabled: autoReplyEnabled,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    
    toast('Twilio settings saved', 'success');
  } catch (error) {
    console.error('Error saving Twilio settings:', error);
    toast('Failed to save Twilio settings', 'error');
  }
}

init();
