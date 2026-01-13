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
 */
export async function listUploads(customerId) {
  try {
    let q = query(getUploadsRef());
    
    if (customerId) {
      q = query(q, where('customerId', '==', customerId));
    }
    
    q = query(q, orderBy('createdAt', 'desc'));
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error listing uploads:', error);
    toast(error.message || 'Failed to load uploads', 'error');
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
