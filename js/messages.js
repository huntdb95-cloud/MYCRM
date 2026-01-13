// messages.js - SMS message handling

import { db, getCallable } from './firebase.js';
import { userStore } from './auth-guard.js';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getCustomerByPhone, updateLastContact } from './customers.js';
import { toast } from './ui.js';

/**
 * Get conversations collection reference
 */
function getConversationsRef() {
  return collection(db, 'agencies', userStore.agencyId, 'conversations');
}

/**
 * Get messages collection reference for a conversation
 */
function getMessagesRef(conversationId) {
  return collection(db, 'agencies', userStore.agencyId, 'conversations', conversationId, 'messages');
}

/**
 * Get or create conversation for customer and phone
 */
export async function getOrCreateConversation(customerId, phoneE164, twilioNumber) {
  // Try to find existing conversation
  const conversationsRef = getConversationsRef();
  let q = query(
    conversationsRef,
    where('customerId', '==', customerId),
    where('twilioNumber', '==', twilioNumber)
  );
  
  const snapshot = await getDocs(q);
  
  if (!snapshot.empty) {
    const conv = snapshot.docs[0];
    return {
      id: conv.id,
      ...conv.data()
    };
  }
  
  // Create new conversation
  const convRef = doc(conversationsRef);
  const convData = {
    customerId,
    phoneE164,
    twilioNumber,
    lastMessageAt: null,
    lastMessageSnippet: null,
    unreadCountByUid: {},
    createdAt: serverTimestamp(),
  };
  
  await setDoc(convRef, convData);
  
  return {
    id: convRef.id,
    ...convData
  };
}

/**
 * Get conversation by ID
 */
export async function getConversation(conversationId) {
  const convRef = doc(getConversationsRef(), conversationId);
  const convSnap = await getDoc(convRef);
  
  if (!convSnap.exists()) {
    return null;
  }
  
  return {
    id: convSnap.id,
    ...convSnap.data()
  };
}

/**
 * Get conversation for customer
 */
export async function getConversationForCustomer(customerId, twilioNumber) {
  const conversationsRef = getConversationsRef();
  const q = query(
    conversationsRef,
    where('customerId', '==', customerId),
    where('twilioNumber', '==', twilioNumber)
  );
  
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return null;
  }
  
  const conv = snapshot.docs[0];
  return {
    id: conv.id,
    ...conv.data()
  };
}

/**
 * List conversations
 */
export async function listConversations(limitCount = 50) {
  try {
    const conversationsRef = getConversationsRef();
    const q = query(
      conversationsRef,
      orderBy('lastMessageAt', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error listing conversations:', error);
    toast(error.message || 'Failed to load conversations', 'error');
    throw error;
  }
}

/**
 * Get messages for conversation
 */
export async function getMessages(conversationId, limitCount = 50) {
  try {
    const messagesRef = getMessagesRef(conversationId);
    const q = query(
      messagesRef,
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })).reverse(); // Reverse to show oldest first
  } catch (error) {
    console.error('Error getting messages:', error);
    toast(error.message || 'Failed to load messages', 'error');
    throw error;
  }
}

/**
 * Subscribe to messages for real-time updates
 */
export function subscribeToMessages(conversationId, callback) {
  const messagesRef = getMessagesRef(conversationId);
  const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(50));
  
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })).reverse();
    callback(messages);
  });
}

/**
 * Send SMS message
 */
export async function sendSms(customerId, body) {
  try {
    if (!body || !body.trim()) {
      throw new Error('Message body is required');
    }
    
    const sendSmsFn = getCallable('sendSms');
    const result = await sendSmsFn({
      agencyId: userStore.agencyId,
      customerId: customerId,
      body: body.trim(),
    });
    
    if (result.data.success) {
      toast('Message sent successfully', 'success');
      return result.data;
    } else {
      throw new Error(result.data.error || 'Failed to send message');
    }
  } catch (error) {
    console.error('Error sending SMS:', error);
    toast(error.message || 'Failed to send message', 'error');
    throw error;
  }
}

/**
 * Mark conversation as read
 */
export async function markConversationRead(conversationId) {
  try {
    const convRef = doc(getConversationsRef(), conversationId);
    const convSnap = await getDoc(convRef);
    
    if (!convSnap.exists()) {
      return;
    }
    
    const unreadCount = convSnap.data().unreadCountByUid || {};
    unreadCount[userStore.uid] = 0;
    
    await setDoc(convRef, {
      unreadCountByUid: unreadCount,
    }, { merge: true });
  } catch (error) {
    console.error('Error marking conversation as read:', error);
  }
}
