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
    notes: formData.notes || null,
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

/**
 * Format date only (no time) for display - MM/DD/YYYY format
 * Supports Firestore Timestamp, JS Date, ISO string, null/undefined
 */
export function formatDateOnly(value) {
  if (!value) return '—';
  
  let date;
  if (value.toDate) {
    // Firestore Timestamp
    date = value.toDate();
  } else if (value instanceof Date) {
    // JS Date
    date = value;
  } else if (typeof value === 'string') {
    // ISO string or date string
    date = new Date(value);
    if (isNaN(date.getTime())) {
      return '—';
    }
  } else {
    return '—';
  }
  
  // Format as MM/DD/YYYY
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${month}/${day}/${year}`;
}

/**
 * Add months to a date, handling month-end correctly
 * @param {Date|Timestamp|string} dateInput - Input date
 * @param {number} months - Number of months to add
 * @returns {Date} - New date with months added
 */
export function addMonths(dateInput, months) {
  let date;
  if (dateInput.toDate) {
    date = new Date(dateInput.toDate());
  } else if (dateInput instanceof Date) {
    date = new Date(dateInput);
  } else {
    date = new Date(dateInput);
  }
  
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date input');
  }
  
  // Get the current day
  const day = date.getDate();
  
  // Set to first day of month to avoid overflow issues
  date.setDate(1);
  
  // Add months
  date.setMonth(date.getMonth() + months);
  
  // Get the last day of the target month
  const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  
  // Set the day, but cap at last day of month (handles Jan 31 + 1 month -> Feb 28/29)
  date.setDate(Math.min(day, lastDayOfMonth));
  
  return date;
}

/**
 * Add years to a date
 * @param {Date|Timestamp|string} dateInput - Input date
 * @param {number} years - Number of years to add
 * @returns {Date} - New date with years added
 */
export function addYears(dateInput, years) {
  return addMonths(dateInput, years * 12);
}

/**
 * Convert a date input to a Date object, handling various input types
 * @param {Date|Timestamp|string|null|undefined} dateInput - Input date
 * @returns {Date|null} - Date object or null if invalid
 */
export function normalizeToDate(dateInput) {
  if (!dateInput) return null;
  
  if (dateInput.toDate) {
    return dateInput.toDate();
  } else if (dateInput instanceof Date) {
    return new Date(dateInput);
  } else if (typeof dateInput === 'string') {
    const date = new Date(dateInput);
    return isNaN(date.getTime()) ? null : date;
  }
  
  return null;
}