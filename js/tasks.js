// tasks.js - Task management

import { db } from './firebase.js';
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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { toast } from './ui.js';

/**
 * Get tasks collection reference
 */
function getTasksRef() {
  return collection(db, 'agencies', userStore.agencyId, 'tasks');
}

/**
 * Create task
 */
export async function createTask(data) {
  try {
    if (!data.title || !data.title.trim()) {
      throw new Error('Task title is required');
    }
    
    const taskData = {
      title: data.title.trim(),
      description: data.description || null,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      priority: data.priority || 'med',
      status: data.status || 'open',
      customerId: data.customerId || null,
      assignedToUid: data.assignedToUid || userStore.uid,
      createdByUid: userStore.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    const taskRef = doc(getTasksRef());
    await setDoc(taskRef, taskData);
    
    toast('Task created successfully', 'success');
    return taskRef.id;
  } catch (error) {
    console.error('Error creating task:', error);
    toast(error.message || 'Failed to create task', 'error');
    throw error;
  }
}

/**
 * Update task
 */
export async function updateTask(taskId, updates) {
  try {
    const taskRef = doc(getTasksRef(), taskId);
    const taskSnap = await getDoc(taskRef);
    
    if (!taskSnap.exists()) {
      throw new Error('Task not found');
    }
    
    const updateData = {
      ...updates,
      updatedAt: serverTimestamp(),
    };
    
    if (updates.dueAt) {
      updateData.dueAt = new Date(updates.dueAt);
    }
    
    await updateDoc(taskRef, updateData);
    
    toast('Task updated successfully', 'success');
  } catch (error) {
    console.error('Error updating task:', error);
    toast(error.message || 'Failed to update task', 'error');
    throw error;
  }
}

/**
 * Get task by ID
 */
export async function getTask(taskId) {
  const taskRef = doc(getTasksRef(), taskId);
  const taskSnap = await getDoc(taskRef);
  
  if (!taskSnap.exists()) {
    return null;
  }
  
  return {
    id: taskSnap.id,
    ...taskSnap.data()
  };
}

/**
 * List tasks with filters
 */
export async function listTasks(filters = {}) {
  try {
    let q = query(getTasksRef());
    
    if (filters.assignedToUid) {
      q = query(q, where('assignedToUid', '==', filters.assignedToUid));
    }
    
    if (filters.status) {
      q = query(q, where('status', '==', filters.status));
    }
    
    if (filters.customerId) {
      q = query(q, where('customerId', '==', filters.customerId));
    }
    
    // Sort by due date or created date
    if (filters.sortBy === 'dueAt') {
      q = query(q, orderBy('dueAt', 'asc'));
    } else {
      q = query(q, orderBy('createdAt', 'desc'));
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error listing tasks:', error);
    toast(error.message || 'Failed to load tasks', 'error');
    throw error;
  }
}

/**
 * Delete task
 */
export async function deleteTask(taskId) {
  try {
    const taskRef = doc(getTasksRef(), taskId);
    const taskSnap = await getDoc(taskRef);
    
    if (!taskSnap.exists()) {
      throw new Error('Task not found');
    }
    
    await deleteDoc(taskRef);
    
    toast('Task deleted successfully', 'success');
  } catch (error) {
    console.error('Error deleting task:', error);
    toast(error.message || 'Failed to delete task', 'error');
    throw error;
  }
}
