// uploads.js - Document uploads

import { db, storage } from './firebase.js';
import { userStore } from './auth-guard.js';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { toast } from './ui.js';

/**
 * Get uploads collection reference
 */
function getUploadsRef() {
  return collection(db, 'agencies', userStore.agencyId, 'uploads');
}

/**
 * Upload file
 */
export async function uploadFile(file, customerId) {
  try {
    if (!file) {
      throw new Error('No file selected');
    }
    
    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name}`;
    const storagePath = `agencies/${userStore.agencyId}/uploads/${fileName}`;
    
    // Upload to Storage
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    
    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);
    
    // Create upload document
    const uploadRef = doc(getUploadsRef());
    const uploadData = {
      customerId: customerId || null,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      storagePath: storagePath,
      downloadURL: downloadURL,
      uploadedByUid: userStore.uid,
      createdAt: serverTimestamp(),
    };
    
    await setDoc(uploadRef, uploadData);
    
    toast('File uploaded successfully', 'success');
    return {
      id: uploadRef.id,
      ...uploadData
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    toast(error.message || 'Failed to upload file', 'error');
    throw error;
  }
}

/**
 * List uploads for customer
 * 
 * REQUIRED COMPOSITE INDEX:
 * Collection: uploads (or collectionGroup: uploads)
 * Fields: customerId (Ascending), createdAt (Descending), __name__ (Descending)
 * 
 * If index is missing, falls back to query without orderBy and sorts client-side.
 */
export async function listUploads(customerId) {
  try {
    if (!userStore.agencyId) {
      throw new Error('Agency ID not available');
    }
    
    const uploadsRef = getUploadsRef();
    let q = query(uploadsRef);
    
    if (customerId) {
      q = query(q, where('customerId', '==', customerId));
    }
    
    // Try query with orderBy (requires composite index)
    try {
      q = query(q, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (indexError) {
      // Check if this is a missing index error
      if (indexError.code === 'failed-precondition' && 
          (indexError.message?.includes('index') || indexError.message?.includes('requires an index'))) {
        
        console.warn('[uploads.js] Composite index missing, using fallback query', {
          errorCode: indexError.code,
          errorMessage: indexError.message,
          customerId,
          agencyId: userStore.agencyId
        });
        
        // Fallback: Query without orderBy, then sort client-side
        let fallbackQ = query(uploadsRef);
        if (customerId) {
          fallbackQ = query(fallbackQ, where('customerId', '==', customerId));
        }
        
        const snapshot = await getDocs(fallbackQ);
        const uploads = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Sort client-side by createdAt (descending)
        uploads.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
          const bTime = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
          return bTime - aTime; // Descending
        });
        
        // Show user-friendly message about index building
        console.info('[uploads.js] Using fallback query (index building). Results sorted client-side.');
        
        return uploads;
      }
      
      // Re-throw if it's not an index error
      throw indexError;
    }
  } catch (error) {
    console.error('[uploads.js] Error listing uploads', {
      errorCode: error.code,
      errorMessage: error.message,
      customerId,
      agencyId: userStore.agencyId,
      stack: error.stack
    });
    
    // Show user-friendly error message
    if (error.code === 'failed-precondition' && error.message?.includes('index')) {
      toast('Database index is building. Please retry in a minute.', 'info');
    } else {
      toast(error.message || 'Failed to load uploads', 'error');
    }
    
    throw error;
  }
}

/**
 * Delete upload
 */
export async function deleteUpload(uploadId) {
  try {
    const uploadRef = doc(getUploadsRef(), uploadId);
    const uploadSnap = await getDoc(uploadRef);
    
    if (!uploadSnap.exists()) {
      throw new Error('Upload not found');
    }
    
    const uploadData = uploadSnap.data();
    
    // Delete from Storage
    if (uploadData.storagePath) {
      const storageRef = ref(storage, uploadData.storagePath);
      try {
        await deleteObject(storageRef);
      } catch (error) {
        console.warn('Failed to delete storage file:', error);
      }
    }
    
    // Delete document
    await deleteDoc(uploadRef);
    
    toast('File deleted successfully', 'success');
  } catch (error) {
    console.error('Error deleting upload:', error);
    toast(error.message || 'Failed to delete file', 'error');
    throw error;
  }
}
