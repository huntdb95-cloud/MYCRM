// models.js - Schema helpers and validators

/**
 * Normalize phone number to E.164 format
 * @param {string} phone - Raw phone input
 * @returns {string|null} - E.164 formatted phone or null if invalid
 */
export function normalizePhone(phone) {
  if (!phone) return null;
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length === 0) return null;
  
  // If 10 digits, assume US (+1)
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  // If 11 digits and starts with 1, treat as US
  if (digits.length === 11 && digits[0] === '1') {
    return `+${digits}`;
  }
  
  // If already starts with +, validate it's all digits after +
  if (phone.trim().startsWith('+')) {
    const afterPlus = phone.replace(/[^\d]/g, '');
    if (afterPlus.length >= 10) {
      return `+${afterPlus}`;
    }
  }
  
  // Return null if we can't normalize
  return null;
}

/**
 * Validate customer data
 */
export function validateCustomer(data) {
  const errors = [];
  
  if (!data.firstName && !data.fullName) {
    errors.push('First name or full name is required');
  }
  
  if (data.phoneRaw && !normalizePhone(data.phoneRaw)) {
    errors.push('Invalid phone number format');
  }
  
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Invalid email format');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create customer document data
 */
export function createCustomerData(formData) {
  const phoneE164 = normalizePhone(formData.phoneRaw);
  
  return {
    fullName: formData.fullName || `${formData.firstName || ''} ${formData.lastName || ''}`.trim() || 'Unknown',
    firstName: formData.firstName || null,
    lastName: formData.lastName || null,
    phoneE164: phoneE164,
    phoneRaw: formData.phoneRaw || null,
    email: formData.email || null,
    address: {
      street: formData.street || null,
      city: formData.city || null,
      state: formData.state || null,
      zip: formData.zip || null,
    },
    preferredLanguage: formData.preferredLanguage || 'en',
    tags: formData.tags ? (Array.isArray(formData.tags) ? formData.tags : formData.tags.split(',').map(t => t.trim()).filter(Boolean)) : [],
    status: formData.status || 'lead',
    source: formData.source || null,
    assignedToUid: formData.assignedToUid || null,
    lastContactAt: null,
    lastMessageSnippet: null,
  };
}

/**
 * Format phone for display
 */
export function formatPhone(phoneE164) {
  if (!phoneE164) return '';
  if (phoneE164.startsWith('+1')) {
    const digits = phoneE164.slice(2);
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
  }
  return phoneE164;
}

/**
 * Format date for display
 */
export function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

/**
 * Format datetime for display
 */
export function formatDateTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}
