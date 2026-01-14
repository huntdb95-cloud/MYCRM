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
  serverTimestamp,
  Timestamp
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
    
    if (!data.dueDate) {
      throw new Error('Due date is required');
    }
    
    // Process due date and time
    const dueDate = new Date(data.dueDate);
    const hasTime = !!(data.dueTime && data.dueTime.trim());
    
    let dueAt;
    if (hasTime) {
      // Combine date and time
      const [hours, minutes] = data.dueTime.split(':');
      dueDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
      dueAt = Timestamp.fromDate(dueDate);
    } else {
      // Set to 12:00 PM local time for no-time tasks
      dueDate.setHours(12, 0, 0, 0);
      dueAt = Timestamp.fromDate(dueDate);
    }
    
    const taskData = {
      title: data.title.trim(),
      description: data.description || null,
      dueAt: dueAt,
      hasTime: hasTime,
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
    
    // Remove dueDate and dueTime from updateData if they exist (we'll process them)
    delete updateData.dueDate;
    delete updateData.dueTime;
    
    // Process due date and time if provided
    if (updates.dueDate) {
      const dueDate = new Date(updates.dueDate);
      const hasTime = !!(updates.dueTime && updates.dueTime.trim());
      
      if (hasTime) {
        // Combine date and time
        const [hours, minutes] = updates.dueTime.split(':');
        dueDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
        updateData.dueAt = Timestamp.fromDate(dueDate);
        updateData.hasTime = true;
      } else {
        // Set to 12:00 PM local time for no-time tasks
        dueDate.setHours(12, 0, 0, 0);
        updateData.dueAt = Timestamp.fromDate(dueDate);
        updateData.hasTime = false;
      }
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
    
    // Note: We'll do client-side sorting for proper ordering rules
    // Just fetch all tasks and sort in memory
    const snapshot = await getDocs(q);
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Client-side sorting will be done in tasks-page.js
    return tasks;
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
