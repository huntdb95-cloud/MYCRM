// settings-page.js - Settings page

import { auth, db } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import { initRouter, navigateTo } from './router.js';
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
  
  // Copy webhook URLs
  const btnCopyInboundSms = document.getElementById('btnCopyInboundSms');
  if (btnCopyInboundSms) {
    btnCopyInboundSms.addEventListener('click', () => {
      const url = document.getElementById('inboundSmsWebhookUrl')?.value || '';
      copyToClipboard(url, 'Inbound SMS webhook URL copied to clipboard');
    });
  }
  
  const btnCopyStatusCallback = document.getElementById('btnCopyStatusCallback');
  if (btnCopyStatusCallback) {
    btnCopyStatusCallback.addEventListener('click', () => {
      const url = document.getElementById('statusCallbackUrl')?.value || '';
      copyToClipboard(url, 'Status callback URL copied to clipboard');
    });
  }
  
  const btnCopyVoice = document.getElementById('btnCopyVoice');
  if (btnCopyVoice) {
    btnCopyVoice.addEventListener('click', () => {
      const url = document.getElementById('voiceWebhookUrl')?.value || '';
      copyToClipboard(url, 'Voice webhook URL copied to clipboard');
    });
  }
}

function copyToClipboard(text, successMessage) {
  if (!text) return;
  
  navigator.clipboard.writeText(text).then(() => {
    toast(successMessage, 'success');
  }).catch(err => {
    console.error('Failed to copy:', err);
    toast('Failed to copy to clipboard', 'error');
  });
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
      const autoReplyEnabled = document.getElementById('autoReplyEnabled');
      
      if (twilioNumber) twilioNumber.value = twilioData.twilioNumber || twilioData.twilioNumberE164 || '';
      if (autoReplyEnabled) autoReplyEnabled.checked = twilioData.autoReplyEnabled || false;
    }
    
    // Webhook URLs are read-only and always show the same values
    // (They're already set in the HTML)
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
    const autoReplyEnabled = document.getElementById('autoReplyEnabled')?.checked || false;
    
    const twilioRef = doc(db, 'agencies', userStore.agencyId, 'settings', 'twilio');
    await setDoc(twilioRef, {
      twilioNumber: twilioNumber || null,
      twilioNumberE164: twilioNumber || null, // Store both for compatibility
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
