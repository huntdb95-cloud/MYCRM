// pocoptin-page.js - SMS Proof of Consent Opt-In Page

import { db } from './firebase.js';
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

/**
 * Get user's IP address (for consent records)
 */
async function getUserIP() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.warn('[pocoptin-page] Failed to get IP address:', error);
    return 'unknown';
  }
}

/**
 * Normalize phone number to E.164 format
 */
function normalizePhoneToE164(phone) {
  if (!phone) return null;
  
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // If doesn't start with +, assume US (+1)
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = '+' + cleaned;
    } else {
      return null;
    }
  }
  
  // Validate E.164 format: + followed by 1-15 digits
  if (!/^\+[1-9]\d{1,14}$/.test(cleaned)) {
    return null;
  }
  
  return cleaned;
}

/**
 * Store consent record in Firestore
 */
async function storeConsentRecord(phoneE164, ipAddress, userAgent) {
  try {
    const consentData = {
      phoneE164: phoneE164,
      ipAddress: ipAddress,
      userAgent: userAgent,
      consentType: 'sms',
      source: 'web_optin',
      consentDate: serverTimestamp(),
      createdAt: serverTimestamp(),
      status: 'active',
      // Additional metadata for compliance
      website: window.location.origin,
      pageUrl: window.location.href,
    };
    
    // Store in 'sms_consents' collection
    const consentsRef = collection(db, 'sms_consents');
    const docRef = await addDoc(consentsRef, consentData);
    
    console.log('[pocoptin-page] Consent record stored:', docRef.id);
    return { success: true, consentId: docRef.id };
  } catch (error) {
    console.error('[pocoptin-page] Error storing consent record:', error);
    throw error;
  }
}

/**
 * Check if phone number already has consent
 */
async function checkExistingConsent(phoneE164) {
  try {
    const consentsRef = collection(db, 'sms_consents');
    const q = query(
      consentsRef,
      where('phoneE164', '==', phoneE164),
      where('status', '==', 'active'),
      orderBy('consentDate', 'desc'),
      limit(1)
    );
    
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.warn('[pocoptin-page] Error checking existing consent:', error);
    // If query fails (e.g., index not created), return false to allow submission
    return false;
  }
}

/**
 * Initialize the opt-in form
 */
async function init() {
  const form = document.getElementById('consentForm');
  const phoneInput = document.getElementById('phoneNumber');
  const consentCheckbox = document.getElementById('consentCheckbox');
  const submitBtn = document.getElementById('btnSubmit');
  const statusMessage = document.getElementById('statusMessage');

  if (!form || !phoneInput || !consentCheckbox || !submitBtn || !statusMessage) {
    console.error('[pocoptin-page] Required form elements not found');
    return;
  }

  // Hide status message initially
  statusMessage.classList.add('hidden');

  // Handle form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Reset status message
    statusMessage.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';

    try {
      // Get form values
      const phoneValue = phoneInput.value.trim();
      const hasConsent = consentCheckbox.checked;

      // Validate consent checkbox
      if (!hasConsent) {
        throw new Error('You must consent to receive text messages to continue.');
      }

      // Normalize phone number
      const phoneE164 = normalizePhoneToE164(phoneValue);
      if (!phoneE164) {
        throw new Error('Please enter a valid phone number with country code (e.g., +1 555 123 4567).');
      }

      // Check for existing consent (optional - you may want to allow re-opt-in)
      const existingConsent = await checkExistingConsent(phoneE164);
      if (existingConsent) {
        statusMessage.textContent = 'This phone number is already opted in. You will continue to receive messages.';
        statusMessage.className = 'status-message success';
        statusMessage.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Opt In to SMS';
        return;
      }

      // Get user metadata
      const ipAddress = await getUserIP();
      const userAgent = navigator.userAgent || 'unknown';

      // Store consent record
      const result = await storeConsentRecord(phoneE164, ipAddress, userAgent);

      if (result.success) {
        // Success message
        statusMessage.textContent = 'Thank you! You have successfully opted in to receive SMS messages. Message and data rates may apply. Reply STOP to opt out at any time.';
        statusMessage.className = 'status-message success';
        statusMessage.classList.remove('hidden');

        // Reset form
        form.reset();

        // Scroll to status message
        statusMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch (error) {
      console.error('[pocoptin-page] Form submission error:', error);
      
      // Error message
      statusMessage.textContent = error.message || 'An error occurred. Please try again later.';
      statusMessage.className = 'status-message error';
      statusMessage.classList.remove('hidden');

      // Scroll to status message
      statusMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Opt In to SMS';
    }
  });

  // Format phone number input (optional enhancement)
  phoneInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    
    // Auto-add +1 if user types 10 digits without country code
    if (value.length === 10 && !e.target.value.startsWith('+')) {
      value = '1' + value;
    }
    
    // Format: +1 (555) 123-4567
    if (value.length > 1) {
      const country = value.slice(0, 1);
      const area = value.slice(1, 4);
      const part1 = value.slice(4, 7);
      const part2 = value.slice(7, 11);
      
      let formatted = '+' + country;
      if (area) formatted += ' (' + area;
      if (part1) formatted += ') ' + part1;
      if (part2) formatted += '-' + part2;
      
      // Only update if formatting changed (avoid cursor jumping)
      const cursorPos = e.target.selectionStart;
      const oldValue = e.target.value;
      e.target.value = formatted;
      
      // Restore cursor position approximately
      if (cursorPos === oldValue.length) {
        e.target.setSelectionRange(formatted.length, formatted.length);
      }
    }
  });

  console.log('[pocoptin-page] Initialized successfully');
}

// Initialize on page load
init().catch(error => {
  console.error('[pocoptin-page] Failed to initialize:', error);
  
  // Show error to user
  const statusMessage = document.getElementById('statusMessage');
  if (statusMessage) {
    statusMessage.textContent = 'Failed to initialize form. Please refresh the page.';
    statusMessage.className = 'status-message error';
    statusMessage.classList.remove('hidden');
  }
});
