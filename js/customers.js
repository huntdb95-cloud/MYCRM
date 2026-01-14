// customers.js - Customer CRUD operations

import { db, storage } from './firebase.js';
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
  Timestamp
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
    const validation = validateCustomer(data);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }
    
    const customerData = createCustomerData(data);
    customerData.createdAt = serverTimestamp();
    customerData.updatedAt = serverTimestamp();
    
    const customerRef = doc(getCustomersRef());
    await setDoc(customerRef, customerData);
    
    // Update phone index if phone exists
    if (customerData.phoneE164) {
      await setDoc(getPhoneIndexRef(customerData.phoneE164), {
        customerId: customerRef.id,
        updatedAt: serverTimestamp(),
      });
    }
    
    toast('Customer created successfully', 'success');
    return customerRef.id;
  } catch (error) {
    console.error('Error creating customer:', error);
    toast(error.message || 'Failed to create customer', 'error');
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
    
    toast('Customer updated successfully', 'success');
  } catch (error) {
    console.error('Error updating customer:', error);
    toast(error.message || 'Failed to update customer', 'error');
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
    
    // Default sort by createdAt descending (newest first)
    // Use createdAt instead of lastContactAt so new customers appear
    q = query(q, orderBy('createdAt', 'desc'));
    
    if (filters.limit) {
      q = query(q, limit(filters.limit));
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error listing customers:', error);
    toast(error.message || 'Failed to load customers', 'error');
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
