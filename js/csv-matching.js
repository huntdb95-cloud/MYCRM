// csv-matching.js - Customer matching and similarity utilities for CSV import

/**
 * Normalize string for matching (lowercase, trim, remove punctuation, collapse spaces)
 */
export function normalizeForMatching(str) {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ')  // Replace punctuation with space
    .replace(/\s+/g, ' ')       // Collapse multiple spaces
    .trim();
}

/**
 * Normalize address string with common abbreviation expansion
 */
export function normalizeAddress(str) {
  if (!str || typeof str !== 'string') return '';
  
  let normalized = normalizeForMatching(str);
  
  // Expand common address abbreviations
  const abbreviations = {
    ' st ': ' street ',
    ' st$': ' street',
    ' rd ': ' road ',
    ' rd$': ' road',
    ' ave ': ' avenue ',
    ' ave$': ' avenue',
    ' ln ': ' lane ',
    ' ln$': ' lane',
    ' dr ': ' drive ',
    ' dr$': ' drive',
    ' blvd ': ' boulevard ',
    ' blvd$': ' boulevard',
    ' ct ': ' court ',
    ' ct$': ' court',
    ' pl ': ' place ',
    ' pl$': ' place',
    ' pkwy ': ' parkway ',
    ' pkwy$': ' parkway',
    ' apt ': ' apartment ',
    ' apt$': ' apartment',
    ' ste ': ' suite ',
    ' ste$': ' suite',
    ' #': ' ',
    ' unit ': ' ',
    ' unit$': ''
  };
  
  for (const [abbr, full] of Object.entries(abbreviations)) {
    normalized = normalized.replace(new RegExp(abbr, 'gi'), full);
  }
  
  // Remove extra spaces again
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Calculate string similarity using Dice coefficient (bigrams)
 * Returns a value between 0 and 1, where 1 is identical
 */
export function stringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;
  
  // Get bigrams (2-character sequences)
  function getBigrams(str) {
    const bigrams = new Set();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  }
  
  const bigrams1 = getBigrams(str1);
  const bigrams2 = getBigrams(str2);
  
  if (bigrams1.size === 0 && bigrams2.size === 0) return 1;
  if (bigrams1.size === 0 || bigrams2.size === 0) return 0;
  
  // Count intersection
  let intersection = 0;
  for (const bigram of bigrams1) {
    if (bigrams2.has(bigram)) {
      intersection++;
    }
  }
  
  // Dice coefficient: 2 * intersection / (size1 + size2)
  return (2 * intersection) / (bigrams1.size + bigrams2.size);
}

/**
 * Calculate address similarity
 */
export function addressSimilarity(addr1, addr2) {
  const norm1 = normalizeAddress(addr1);
  const norm2 = normalizeAddress(addr2);
  
  if (norm1 === norm2) return 1;
  if (!norm1 || !norm2) return 0;
  
  return stringSimilarity(norm1, norm2);
}

/**
 * Calculate name similarity
 */
export function nameSimilarity(name1, name2) {
  const norm1 = normalizeForMatching(name1);
  const norm2 = normalizeForMatching(name2);
  
  if (norm1 === norm2) return 1;
  if (!norm1 || !norm2) return 0;
  
  return stringSimilarity(norm1, norm2);
}

/**
 * Match an imported customer against existing customers
 * Returns array of matches with scores, sorted by score descending
 */
export function findMatches(importedCustomer, existingCustomers) {
  const matches = [];
  
  const importedName = normalizeForMatching(importedCustomer.insuredName || '');
  const importedAddr = normalizeAddress(importedCustomer.address || '');
  const importedZip = (importedCustomer.zip || '').trim();
  const importedCity = normalizeForMatching(importedCustomer.city || '');
  const importedState = (importedCustomer.state || '').trim().toUpperCase();
  
  for (const existing of existingCustomers) {
    const existingName = normalizeForMatching(existing.fullName || existing.insuredName || '');
    const existingAddr = normalizeAddress(existing.address?.street || existing.address || '');
    const existingZip = (existing.address?.zip || existing.zip || '').trim();
    const existingCity = normalizeForMatching(existing.address?.city || existing.city || '');
    const existingState = (existing.address?.state || existing.state || '').trim().toUpperCase();
    
    // Calculate similarity scores
    const nameScore = nameSimilarity(importedName, existingName);
    const addrScore = addressSimilarity(importedAddr, existingAddr);
    
    // Determine match strength
    let matchStrength = 'none';
    let totalScore = 0;
    
    // Strong match criteria
    if (importedZip && importedZip === existingZip && addrScore >= 0.85) {
      matchStrength = 'strong';
      totalScore = 0.9 + (nameScore * 0.1);
    } else if (nameScore >= 0.92 && (importedCity === existingCity || importedState === existingState || importedZip === existingZip)) {
      matchStrength = 'strong';
      totalScore = 0.85 + (addrScore * 0.15);
    }
    // Possible match criteria
    else if (nameScore >= 0.85) {
      matchStrength = 'possible';
      totalScore = nameScore * 0.6 + addrScore * 0.4;
    } else if (importedZip && importedZip === existingZip && addrScore >= 0.75) {
      matchStrength = 'possible';
      totalScore = addrScore * 0.7 + nameScore * 0.3;
    }
    
    if (matchStrength !== 'none') {
      matches.push({
        customer: existing,
        matchStrength,
        score: totalScore,
        nameScore,
        addrScore,
        zipMatch: importedZip === existingZip,
        cityMatch: importedCity === existingCity,
        stateMatch: importedState === existingState
      });
    }
  }
  
  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  
  // Return top 3 matches
  return matches.slice(0, 3);
}

/**
 * Group CSV rows by customer (same name + address + zip)
 * Returns array of customer groups with their policies
 */
export function groupRowsByCustomer(processedRows) {
  const groups = new Map();
  
  for (const row of processedRows) {
    if (!row.valid || !row.data) continue;
    
    const data = row.data;
    const key = `${normalizeForMatching(data.insuredName)}|${normalizeAddress(data.address)}|${data.zip}`.trim();
    
    if (!groups.has(key)) {
      groups.set(key, {
        customerData: {
          insuredName: data.insuredName,
          address: data.address,
          city: data.city,
          state: data.state,
          zip: data.zip,
        },
        policies: []
      });
    }
    
    groups.get(key).policies.push({
      policyTypeNormalized: data.policyTypeNormalized,
      rawPolicyType: data.rawPolicyType,
      effectiveDate: data.effectiveDate,
      expirationDate: data.expirationDate,
      insuranceCompany: data.insuranceCompany,
      premium: data.premium,
      rowIndex: row.rowIndex
    });
  }
  
  return Array.from(groups.values());
}
