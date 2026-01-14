// customers.js - Customer CRUD operations

import { db, storage, auth } from './firebase.js';
import { userStore } from './auth-guard.js';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  Timestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { normalizePhone, createCustomerData, validateCustomer } from './models.js';
import { toast } from './ui.js';

/**
 * Get customers collection reference
 */
function getCustomersRef() {
  return collection(db, 'agencies', userStore.agencyId, 'customers');
}

/**
 * Get phone index reference
 */
function getPhoneIndexRef(phoneE164) {
  return doc(db, 'agencies', userStore.agencyId, 'phoneIndex', phoneE164);
}

/**
 * Create customer
 */
export async function createCustomer(data) {
  try {
    // Verify auth before proceeding
    if (!auth?.currentUser) {
      throw new Error('You must be signed in to create customers');
    }
    
    if (!userStore.agencyId) {
      throw new Error('Agency ID not available. Please refresh and try again.');
    }
    
    const validation = validateCustomer(data);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }
    
    const customerData = createCustomerData(data);
    customerData.createdAt = serverTimestamp();
    customerData.updatedAt = serverTimestamp();
    
    const customerPath = `agencies/${userStore.agencyId}/customers`;
    console.log('[customers.js] Creating customer:', {
      uid: auth?.currentUser?.uid,
      agencyId: userStore.agencyId,
      role: userStore.role,
      path: customerPath,
      customerDataKeys: Object.keys(customerData)
    });
    
    const customerRef = doc(getCustomersRef());
    await setDoc(customerRef, customerData);
    
    // Update phone index if phone exists
    if (customerData.phoneE164) {
      await setDoc(getPhoneIndexRef(customerData.phoneE164), {
        customerId: customerRef.id,
        updatedAt: serverTimestamp(),
      });
    }
    
    // Toast handled by caller
    return customerRef.id;
  } catch (error) {
    console.error('[customers.js] Error creating customer:', error);
    console.error('[customers.js] Error code:', error.code);
    console.error('[customers.js] Error message:', error.message);
    console.error('[customers.js] Auth state at error:', {
      hasAuth: !!auth,
      currentUser: auth?.currentUser ? { uid: auth.currentUser.uid } : null,
      userStore: { uid: userStore.uid, role: userStore.role, agencyId: userStore.agencyId }
    });
    // Toast handled by caller
    throw error;
  }
}

/**
 * Update customer
 */
export async function updateCustomer(customerId, updates) {
  try {
    const customerRef = doc(getCustomersRef(), customerId);
    const customerSnap = await getDoc(customerRef);
    
    if (!customerSnap.exists()) {
      throw new Error('Customer not found');
    }
    
    const oldData = customerSnap.data();
    const newData = { ...oldData, ...updates };
    
    // If phone changed, update phone index
    if (updates.phoneRaw && normalizePhone(updates.phoneRaw) !== oldData.phoneE164) {
      const newPhoneE164 = normalizePhone(updates.phoneRaw);
      
      // Remove old phone index entry
      if (oldData.phoneE164) {
        const oldIndexRef = getPhoneIndexRef(oldData.phoneE164);
        await deleteDoc(oldIndexRef);
      }
      
      // Add new phone index entry
      if (newPhoneE164) {
        await setDoc(getPhoneIndexRef(newPhoneE164), {
          customerId: customerId,
          updatedAt: serverTimestamp(),
        });
        newData.phoneE164 = newPhoneE164;
      }
    }
    
    newData.updatedAt = serverTimestamp();
    await updateDoc(customerRef, newData);
    
    // Toast handled by caller
  } catch (error) {
    console.error('Error updating customer:', error);
    console.error('Customer ID attempted:', customerId);
    // Toast handled by caller
    throw error;
  }
}

/**
 * Get customer by ID
 */
export async function getCustomer(customerId) {
  const customerRef = doc(getCustomersRef(), customerId);
  const customerSnap = await getDoc(customerRef);
  
  if (!customerSnap.exists()) {
    return null;
  }
  
  return {
    id: customerSnap.id,
    ...customerSnap.data()
  };
}

/**
 * Get customer by phone
 */
export async function getCustomerByPhone(phoneE164) {
  if (!phoneE164) return null;
  
  const indexRef = getPhoneIndexRef(phoneE164);
  const indexSnap = await getDoc(indexRef);
  
  if (!indexSnap.exists()) {
    return null;
  }
  
  const customerId = indexSnap.data().customerId;
  return getCustomer(customerId);
}

/**
 * List customers with filters
 */
export async function listCustomers(filters = {}) {
  try {
    // Verify agencyId is available
    if (!userStore.agencyId) {
      throw new Error('No agencyId available. Please sign in again.');
    }
    
    console.log('[customers.js] Listing customers for agencyId:', userStore.agencyId);
    
    // Build query without orderBy first (safer - avoids index issues)
    // We'll sort client-side instead
    let q = query(getCustomersRef());
    
    if (filters.assignedToUid) {
      q = query(q, where('assignedToUid', '==', filters.assignedToUid));
    }
    
    if (filters.status) {
      q = query(q, where('status', '==', filters.status));
    }
    
    if (filters.search) {
      // Note: Firestore doesn't support full-text search natively
      // This is a simple prefix match on fullName
      // For production, consider Algolia or similar
      q = query(q, where('fullName', '>=', filters.search));
      q = query(q, where('fullName', '<=', filters.search + '\uf8ff'));
    }
    
    if (filters.limit) {
      q = query(q, limit(filters.limit));
    }
    
    console.log('[customers.js] Executing query...');
    const snapshot = await getDocs(q);
    console.log('[customers.js] Query returned', snapshot.docs.length, 'documents');
    
    let customers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Sort client-side by createdAt descending (newest first)
    // Handle cases where createdAt might be missing or in different formats
    customers.sort((a, b) => {
      const aTime = a.createdAt?.seconds ?? a.createdAt?.toMillis?.() ?? (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const bTime = b.createdAt?.seconds ?? b.createdAt?.toMillis?.() ?? (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return bTime - aTime; // Descending order
    });
    
    return customers;
  } catch (error) {
    console.error('[customers.js] Error listing customers:', error);
    console.error('[customers.js] Error code:', error.code);
    console.error('[customers.js] Error message:', error.message);
    console.error('[customers.js] AgencyId at error:', userStore.agencyId);
    // Don't show toast here - let the caller handle UI feedback
    throw error;
  }
}

/**
 * Delete customer
 */
export async function deleteCustomer(customerId) {
  try {
    const customerRef = doc(getCustomersRef(), customerId);
    const customerSnap = await getDoc(customerRef);
    
    if (!customerSnap.exists()) {
      throw new Error('Customer not found');
    }
    
    const customerData = customerSnap.data();
    
    // Remove phone index entry
    if (customerData.phoneE164) {
      await deleteDoc(getPhoneIndexRef(customerData.phoneE164));
    }
    
    // Delete customer
    await deleteDoc(customerRef);
    
    toast('Customer deleted successfully', 'success');
  } catch (error) {
    console.error('Error deleting customer:', error);
    toast(error.message || 'Failed to delete customer', 'error');
    throw error;
  }
}

/**
 * Update customer last contact
 */
export async function updateLastContact(customerId, messageSnippet) {
  try {
    const customerRef = doc(getCustomersRef(), customerId);
    await updateDoc(customerRef, {
      lastContactAt: serverTimestamp(),
      lastMessageSnippet: messageSnippet || null,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating last contact:', error);
  }
}

/**
 * Get policies collection reference for a customer
 */
function getPoliciesRef(customerId) {
  return collection(db, 'agencies', userStore.agencyId, 'customers', customerId, 'policies');
}

/**
 * Normalize address fields for deduplication
 */
function normalizeAddress(str) {
  if (!str) return '';
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Find customer by name, address, and zip (for deduplication)
 */
export async function findCustomerByNameAddressZip(insuredName, address, zip) {
  try {
    const normalizedName = normalizeAddress(insuredName);
    const normalizedAddress = normalizeAddress(address);
    const normalizedZip = normalizeAddress(zip);
    
    // Search for customers with matching name prefix (case-insensitive search not supported by Firestore)
    // We'll search using the raw name and filter in memory
    // Note: This is not perfect but works for deduplication
    const searchName = insuredName.trim().substring(0, 20); // Use first 20 chars for prefix match
    let q = query(
      getCustomersRef(),
      where('fullName', '>=', searchName),
      where('fullName', '<=', searchName + '\uf8ff'),
      limit(100) // Limit for performance
    );
    
    const snapshot = await getDocs(q);
    
    // Filter for exact match on normalized name + address + zip
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const customerAddress = data.address || {};
      const customerName = normalizeAddress(data.fullName || '');
      const customerAddressStr = normalizeAddress(customerAddress.street || '');
      const customerZip = normalizeAddress(customerAddress.zip || '');
      
      if (customerName === normalizedName && 
          customerAddressStr === normalizedAddress && 
          customerZip === normalizedZip) {
        return {
          id: docSnap.id,
          ...data
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding customer by name/address/zip:', error);
    return null;
  }
}

/**
 * Check if policy already exists (by customerId + policyType + effectiveDate + insuranceCompany + premium)
 */
export async function findExistingPolicy(customerId, policyTypeNormalized, effectiveDate, insuranceCompany, premium) {
  try {
    const policiesRef = getPoliciesRef(customerId);
    const snapshot = await getDocs(policiesRef);
    
    // Convert effectiveDate to comparable format
    const effDate = effectiveDate instanceof Date ? effectiveDate : new Date(effectiveDate);
    const effDateStr = effDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const existingEffDate = data.effectiveDate?.toDate ? data.effectiveDate.toDate() : new Date(data.effectiveDate);
      const existingEffDateStr = existingEffDate.toISOString().split('T')[0];
      
      // Compare policy type, effective date, company, and premium (within 0.01 tolerance for floating point)
      if (data.policyTypeNormalized === policyTypeNormalized &&
          existingEffDateStr === effDateStr &&
          (data.insuranceCompany || '').trim().toLowerCase() === (insuranceCompany || '').trim().toLowerCase() &&
          Math.abs((data.premium || 0) - premium) < 0.01) {
        return {
          id: docSnap.id,
          ...data
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding existing policy:', error);
    return null;
  }
}

/**
 * Import CSV data (customers and policies) with batching and deduplication
 */
export async function importCSVData(processedRows, progressCallback) {
  const results = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };
  
  const BATCH_SIZE = 400; // Firestore batch limit is 500, use 400 to be safe
  
  try {
    // Process rows in batches
    const validRows = processedRows.filter(r => r.valid && r.data);
    const invalidRows = processedRows.filter(r => !r.valid);
    
    results.skipped += invalidRows.length;
    results.errors = invalidRows.map(r => ({
      row: r.rowIndex,
      errors: r.errors
    }));
    
    // Group operations by batch
    let currentBatch = writeBatch(db);
    let batchOpCount = 0;
    let batchNumber = 1;
    const totalBatches = Math.ceil(validRows.length / (BATCH_SIZE / 2)); // Estimate: ~2 ops per row
    
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const rowData = row.data;
      
      try {
        // Find or create customer
        let customer = await findCustomerByNameAddressZip(
          rowData.insuredName,
          rowData.address,
          rowData.zip
        );
        
        let customerId;
        let isNewCustomer = false;
        
        if (customer) {
          // Update existing customer
          customerId = customer.id;
          const customerRef = doc(getCustomersRef(), customerId);
          currentBatch.update(customerRef, {
            updatedAt: serverTimestamp(),
            // Update address fields if they changed
            'address.street': rowData.address,
            'address.city': rowData.city,
            'address.state': rowData.state,
            'address.zip': rowData.zip,
          });
          batchOpCount++;
          results.updated++;
        } else {
          // Create new customer
          customerId = doc(getCustomersRef()).id;
          const customerRef = doc(getCustomersRef(), customerId);
          currentBatch.set(customerRef, {
            fullName: rowData.insuredName,
            firstName: null,
            lastName: null,
            phoneE164: null,
            phoneRaw: null,
            email: null,
            notes: null,
            address: {
              street: rowData.address,
              city: rowData.city,
              state: rowData.state,
              zip: rowData.zip,
            },
            preferredLanguage: 'en',
            tags: [],
            status: 'lead',
            source: 'CSV Import',
            assignedToUid: null,
            lastContactAt: null,
            lastMessageSnippet: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batchOpCount++;
          results.imported++;
          isNewCustomer = true;
        }
        
        // Check if policy already exists
        const existingPolicy = await findExistingPolicy(
          customerId,
          rowData.policyTypeNormalized,
          rowData.effectiveDate,
          rowData.insuranceCompany,
          rowData.premium
        );
        
        if (!existingPolicy) {
          // Create new policy
          const policyRef = doc(getPoliciesRef(customerId));
          const effectiveTimestamp = Timestamp.fromDate(rowData.effectiveDate);
          const expirationTimestamp = Timestamp.fromDate(rowData.expirationDate);
          
          currentBatch.set(policyRef, {
            policyTypeNormalized: rowData.policyTypeNormalized,
            rawPolicyType: rowData.rawPolicyType,
            effectiveDate: effectiveTimestamp,
            expirationDate: expirationTimestamp,
            insuranceCompany: rowData.insuranceCompany,
            premium: rowData.premium,
            status: 'active',
            importedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batchOpCount++;
        } else {
          // Policy already exists, skip
          results.skipped++;
        }
        
        // Commit batch if we're approaching the limit
        if (batchOpCount >= BATCH_SIZE - 10) {
          await currentBatch.commit();
          if (progressCallback) {
            progressCallback(batchNumber, totalBatches);
          }
          currentBatch = writeBatch(db);
          batchOpCount = 0;
          batchNumber++;
        }
      } catch (error) {
        console.error(`Error processing row ${row.rowIndex}:`, error);
        results.errors.push({
          row: row.rowIndex,
          errors: [error.message || 'Unknown error']
        });
        results.skipped++;
      }
    }
    
    // Commit remaining batch
    if (batchOpCount > 0) {
      await currentBatch.commit();
      if (progressCallback) {
        progressCallback(batchNumber, totalBatches);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error importing CSV data:', error);
    throw error;
  }
}
