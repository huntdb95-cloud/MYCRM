// csv-import.js - CSV import utilities for customers and policies

/**
 * Normalize policy type string to canonical value
 */
export function normalizePolicyType(rawType) {
  if (!rawType || typeof rawType !== 'string') return null;
  
  // Normalize: lowercase, trim, remove extra spaces/punctuation
  const normalized = rawType.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
  
  // Policy type mappings
  const mappings = {
    'Workers Compensation': ['wc', 'workers comp', 'workers compensation', 'work comp'],
    'General Liability': ['gl', 'general liability'],
    'Tailored Protection Policy': ['tpp', 'tailored protection policy'],
    'Commercial Package Policy': ['cpp', 'commercial package policy'],
    'BOP': ['bop', 'business owners policy', 'business owner policy'],
    'Commercial Auto': ['commercial auto', 'comm auto', 'ca'],
    'Personal Auto': ['personal auto', 'pa'],
    'Homeowners': ['homeowners', 'ho', 'home'],
    'Dwelling Fire': ['dwelling fire', 'df', 'dp', 'dwelling'],
    'Life': ['life', 'life insurance'],
    'Health': ['health', 'health insurance'],
  };
  
  for (const [canonical, synonyms] of Object.entries(mappings)) {
    if (synonyms.includes(normalized)) {
      return canonical;
    }
  }
  
  return null; // Unknown policy type
}

/**
 * Parse date from various formats
 */
export function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  
  // Try different formats
  // MM/DD/YYYY or M/D/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime()) && 
        date.getFullYear() == year && 
        date.getMonth() == month - 1 && 
        date.getDate() == day) {
      return date;
    }
  }
  
  // YYYY-MM-DD
  const dashMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dashMatch) {
    const [, year, month, day] = dashMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime()) && 
        date.getFullYear() == year && 
        date.getMonth() == month - 1 && 
        date.getDate() == day) {
      return date;
    }
  }
  
  // MM-DD-YYYY
  const dashMatch2 = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch2) {
    const [, month, day, year] = dashMatch2;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime()) && 
        date.getFullYear() == year && 
        date.getMonth() == month - 1 && 
        date.getDate() == day) {
      return date;
    }
  }
  
  // Try native Date parsing as fallback
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  return null;
}

/**
 * Add one year to a date (handles leap years)
 */
export function addOneYear(date) {
  if (!date) return null;
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + 1);
  return result;
}

/**
 * Subtract one year from a date
 */
export function subtractOneYear(date) {
  if (!date) return null;
  const result = new Date(date);
  result.setFullYear(result.getFullYear() - 1);
  return result;
}

/**
 * Parse premium value (removes $ and commas)
 */
export function parsePremium(premiumStr) {
  if (!premiumStr) return null;
  
  // Remove $ and commas, then parse as float
  const cleaned = String(premiumStr).replace(/[$,\s]/g, '');
  const parsed = parseFloat(cleaned);
  
  if (isNaN(parsed) || parsed < 0) {
    return null;
  }
  
  return parsed;
}

/**
 * Map CSV header to field name
 */
export function mapHeaderToField(header, mappings) {
  if (!header) return null;
  
  const normalized = header.toLowerCase().trim();
  
  for (const [field, aliases] of Object.entries(mappings)) {
    if (aliases.includes(normalized)) {
      return field;
    }
  }
  
  return null;
}

/**
 * Create header mapping from CSV headers
 */
export function createHeaderMapping(csvHeaders) {
  const fieldMappings = {
    insuredName: ['insured name', 'insured', 'name', 'client', 'customer', 'full name'],
    address: ['address', 'street', 'street address', 'addr'],
    city: ['city'],
    state: ['state', 'st'],
    zip: ['zip', 'zipcode', 'postal', 'postal code', 'zip code'],
    policyType: ['policy type', 'type', 'line', 'lob', 'policy', 'line of business'],
    effectiveDate: ['effective', 'effective date', 'eff date', 'eff', 'effective date', 'effective date start'],
    expirationDate: ['expiration', 'expiration date', 'exp date', 'exp', 'expires', 'expiration date end'],
    insuranceCompany: ['company', 'carrier', 'insurance company', 'insurer', 'insurance carrier'],
    premium: ['premium', 'written premium', 'annual premium', 'total premium', 'premium amount'],
  };
  
  const mapping = {};
  const missingFields = [];
  
  // Map each header to a field
  for (const header of csvHeaders) {
    const field = mapHeaderToField(header, fieldMappings);
    if (field) {
      mapping[field] = header;
    }
  }
  
  // Check for required fields
  const requiredFields = ['insuredName', 'address', 'city', 'state', 'zip', 'policyType', 'insuranceCompany', 'premium'];
  for (const field of requiredFields) {
    if (!mapping[field]) {
      missingFields.push(field);
    }
  }
  
  // Check for at least one date field
  if (!mapping['effectiveDate'] && !mapping['expirationDate']) {
    missingFields.push('effectiveDate or expirationDate');
  }
  
  return {
    mapping,
    missingFields: missingFields.length > 0 ? missingFields : null
  };
}

/**
 * Parse CSV text into rows
 */
export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }
  
  // Simple CSV parser (handles quoted fields)
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fields = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (char === '"') {
        if (inQuotes && line[j + 1] === '"') {
          // Escaped quote
          currentField += '"';
          j++;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    
    // Add last field
    fields.push(currentField.trim());
    rows.push(fields);
  }
  
  return rows;
}

/**
 * Validate and process a CSV row
 */
export function processCSVRow(row, headerMapping, csvHeaders, rowIndex) {
  const data = {};
  
  // Extract data using header mapping
  for (const [field, csvHeader] of Object.entries(headerMapping)) {
    const headerIndex = csvHeaders.indexOf(csvHeader);
    if (headerIndex >= 0 && headerIndex < row.length) {
      data[field] = row[headerIndex];
    } else {
      data[field] = '';
    }
  }
  
  // Validate and normalize
  const result = {
    rowIndex: rowIndex + 1, // 1-based for display
    valid: true,
    errors: [],
    data: null
  };
  
  // Required fields
  if (!data.insuredName || !data.insuredName.trim()) {
    result.valid = false;
    result.errors.push('Missing insured name');
  }
  
  if (!data.address || !data.address.trim()) {
    result.valid = false;
    result.errors.push('Missing address');
  }
  
  if (!data.city || !data.city.trim()) {
    result.valid = false;
    result.errors.push('Missing city');
  }
  
  if (!data.state || !data.state.trim()) {
    result.valid = false;
    result.errors.push('Missing state');
  }
  
  if (!data.zip || !data.zip.trim()) {
    result.valid = false;
    result.errors.push('Missing zip');
  }
  
  // Policy type
  const policyTypeNormalized = normalizePolicyType(data.policyType);
  if (!policyTypeNormalized) {
    result.valid = false;
    result.errors.push(`Unknown policy type: ${data.policyType || 'empty'}`);
  }
  
  // Insurance company
  if (!data.insuranceCompany || !data.insuranceCompany.trim()) {
    result.valid = false;
    result.errors.push('Missing insurance company');
  }
  
  // Premium
  const premium = parsePremium(data.premium);
  if (premium === null) {
    result.valid = false;
    result.errors.push(`Invalid premium: ${data.premium || 'empty'}`);
  }
  
  // Dates
  let effectiveDate = data.effectiveDate ? parseDate(data.effectiveDate) : null;
  let expirationDate = data.expirationDate ? parseDate(data.expirationDate) : null;
  
  const isProgressive = data.insuranceCompany && 
    data.insuranceCompany.toLowerCase().includes('progressive');
  
  if (isProgressive) {
    // Progressive requires both dates
    if (!effectiveDate || !expirationDate) {
      result.valid = false;
      result.errors.push('Progressive policy requires both effective and expiration dates');
    }
  } else {
    // Non-Progressive: compute missing date
    if (!effectiveDate && !expirationDate) {
      result.valid = false;
      result.errors.push('Missing both effective and expiration dates');
    } else if (effectiveDate && !expirationDate) {
      expirationDate = addOneYear(effectiveDate);
    } else if (expirationDate && !effectiveDate) {
      effectiveDate = subtractOneYear(expirationDate);
    }
  }
  
  if (!effectiveDate || !expirationDate) {
    result.valid = false;
    if (!result.errors.some(e => e.includes('date'))) {
      result.errors.push('Invalid date(s)');
    }
  }
  
  if (result.valid) {
    result.data = {
      insuredName: data.insuredName.trim(),
      address: data.address.trim(),
      city: data.city.trim(),
      state: data.state.trim().toUpperCase(),
      zip: data.zip.trim(),
      policyTypeNormalized,
      rawPolicyType: data.policyType.trim(),
      effectiveDate,
      expirationDate,
      insuranceCompany: data.insuranceCompany.trim(),
      premium,
    };
  }
  
  return result;
}
