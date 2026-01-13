// customer-page.js - Customer detail page

import { auth } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import { initRouter, navigateTo, getUrlParam } from './router.js';
import { getCustomer, updateCustomer } from './customers.js';
import { getConversationForCustomer, getMessages, sendSms, subscribeToMessages } from './messages.js';
import { listTasks, createTask } from './tasks.js';
import { listUploads, uploadFile } from './uploads.js';
import { formatPhone, formatDateTime } from './models.js';
import { toast } from './ui.js';
import { collection, doc, getDocs, setDoc, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { db } from './firebase.js';

let customerId = null;
let customer = null;
let conversationId = null;

async function init() {
  try {
    console.log('[customer-page.js] Initializing...');
    
    // Verify Firebase services
    if (!auth || !db) {
      throw new Error('Firebase services not initialized. Check firebase.js for errors.');
    }
    
    customerId = getUrlParam('id');
    if (!customerId) {
      toast('Customer ID required', 'error');
      navigateTo('/customers.html');
      return;
    }
    
    await initAuthGuard();
    initRouter();
    setupUI();
    await loadCustomer();
    
    // Check hash for tab
    const hash = window.location.hash.slice(1);
    if (hash) {
      switchTab(hash);
    }
    
    console.log('[customer-page.js] Initialized successfully');
  } catch (error) {
    console.error('[customer-page.js] Failed to initialize:', error);
    console.error('[customer-page.js] Error stack:', error.stack);
    const errorMessage = error?.message || String(error);
    toast(`Failed to initialize: ${errorMessage}`, 'error');
  }
}

function setupUI() {
  // User info
  const userNameEl = document.getElementById('userName');
  const userRoleEl = document.getElementById('userRole');
  if (userNameEl) userNameEl.textContent = userStore.displayName || userStore.email || 'User';
  if (userRoleEl) userRoleEl.textContent = userStore.role || '—';
  
  // Logout
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await signOut(auth);
        navigateTo('/index.html');
      } catch (error) {
        toast('Failed to log out', 'error');
      }
    });
  }
  
  // Menu toggle
  const btnMenuToggle = document.getElementById('btnMenuToggle');
  const sidebar = document.getElementById('sidebar');
  if (btnMenuToggle && sidebar) {
    btnMenuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
  
  // Tabs
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      switchTab(tabName);
    });
  });
  
  // Send message
  const btnSendMessage = document.getElementById('btnSendMessage');
  const messageInput = document.getElementById('messageInput');
  if (btnSendMessage && messageInput) {
    btnSendMessage.addEventListener('click', handleSendMessage);
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSendMessage();
      }
    });
  }
  
  // Add note
  const btnAddNote = document.getElementById('btnAddNote');
  if (btnAddNote) {
    btnAddNote.addEventListener('click', handleAddNote);
  }
  
  // New task
  const btnNewTask = document.getElementById('btnNewTask');
  if (btnNewTask) {
    btnNewTask.addEventListener('click', () => {
      navigateTo(`/tasks.html?action=new&customerId=${customerId}`);
    });
  }
  
  // Upload document
  const btnUpload = document.getElementById('btnUpload');
  const fileInput = document.getElementById('fileInput');
  if (btnUpload && fileInput) {
    btnUpload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          await uploadFile(file, customerId);
          await loadDocuments();
          fileInput.value = '';
        } catch (error) {
          console.error('Error uploading file:', error);
        }
      }
    });
  }
}

function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.getAttribute('data-tab') === tabName) {
      tab.classList.add('active');
    }
  });
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  const tabContent = document.getElementById(`tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
  if (tabContent) {
    tabContent.classList.add('active');
  }
  
  // Load tab data
  if (tabName === 'messages') {
    loadMessages();
  } else if (tabName === 'notes') {
    loadNotes();
  } else if (tabName === 'tasks') {
    loadTasks();
  } else if (tabName === 'documents') {
    loadDocuments();
  } else if (tabName === 'policies') {
    loadPolicies();
  }
}

async function loadCustomer() {
  try {
    customer = await getCustomer(customerId);
    if (!customer) {
      toast('Customer not found', 'error');
      navigateTo('/customers.html');
      return;
    }
    
    // Update UI
    const customerName = document.getElementById('customerName');
    if (customerName) customerName.textContent = customer.fullName || 'Unknown';
    
    const customerPhone = document.getElementById('customerPhone');
    if (customerPhone) customerPhone.textContent = customer.phoneE164 ? formatPhone(customer.phoneE164) : '—';
    
    const customerEmail = document.getElementById('customerEmail');
    if (customerEmail) customerEmail.textContent = customer.email || '—';
    
    const customerStatus = document.getElementById('customerStatus');
    if (customerStatus) customerStatus.textContent = customer.status || 'lead';
    
    const lastContact = document.getElementById('lastContact');
    if (lastContact) lastContact.textContent = customer.lastContactAt ? formatDateTime(customer.lastContactAt) : '—';
    
    // Load overview
    loadOverview();
  } catch (error) {
    console.error('Error loading customer:', error);
    toast('Failed to load customer', 'error');
  }
}

function loadOverview() {
  const customerDetails = document.getElementById('customerDetails');
  if (!customerDetails) return;
  
  customerDetails.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
      <div>
        <div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">Full Name</div>
        <div>${customer.fullName || '—'}</div>
      </div>
      <div>
        <div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">Phone</div>
        <div>${customer.phoneE164 ? formatPhone(customer.phoneE164) : '—'}</div>
      </div>
      <div>
        <div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">Email</div>
        <div>${customer.email || '—'}</div>
      </div>
      <div>
        <div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">Status</div>
        <div><span class="badge badge-info">${customer.status || 'lead'}</span></div>
      </div>
      <div>
        <div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">Source</div>
        <div>${customer.source || '—'}</div>
      </div>
      <div>
        <div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">Created</div>
        <div>${customer.createdAt ? formatDateTime(customer.createdAt) : '—'}</div>
      </div>
    </div>
  `;
}

async function loadMessages() {
  try {
    // Get Twilio number from settings
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
    const twilioSettingsRef = doc(db, 'agencies', userStore.agencyId, 'settings', 'twilio');
    const twilioSettings = await getDoc(twilioSettingsRef);
    const twilioNumber = twilioSettings.exists() ? twilioSettings.data().twilioNumber : null;
    
    if (!twilioNumber) {
      const messageThread = document.getElementById('messageThread');
      if (messageThread) {
        messageThread.innerHTML = '<p class="empty-state">Twilio not configured. Please set up your Twilio number in Settings.</p>';
      }
      return;
    }
    
    let conversation = await getConversationForCustomer(customerId, twilioNumber);
    
    if (!conversation) {
      // Create conversation if it doesn't exist
      const { getOrCreateConversation } = await import('./messages.js');
      conversation = await getOrCreateConversation(customerId, customer.phoneE164, twilioNumber);
    }
    
    conversationId = conversation.id;
    
    // Subscribe to messages for real-time updates
    subscribeToMessages(conversationId, (messages) => {
      renderMessages(messages);
    });
  } catch (error) {
    console.error('Error loading messages:', error);
    toast('Failed to load messages', 'error');
  }
}

function renderMessages(messages) {
  const messageThread = document.getElementById('messageThread');
  if (!messageThread) return;
  
  if (messages.length === 0) {
    messageThread.innerHTML = '<p class="empty-state">No messages yet</p>';
    return;
  }
  
  messageThread.innerHTML = messages.map(msg => `
    <div class="message ${msg.direction}">
      <div class="message-bubble">${msg.body || ''}</div>
      <div class="message-time">${msg.createdAt ? formatDateTime(msg.createdAt) : '—'}</div>
    </div>
  `).join('');
  
  // Scroll to bottom
  messageThread.scrollTop = messageThread.scrollHeight;
}

async function handleSendMessage() {
  const messageInput = document.getElementById('messageInput');
  if (!messageInput) return;
  
  const body = messageInput.value.trim();
  if (!body) return;
  
  try {
    await sendSms(customerId, body);
    messageInput.value = '';
    // Messages will update via subscription
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

async function loadNotes() {
  try {
    const notesRef = collection(db, 'agencies', userStore.agencyId, 'customers', customerId, 'notes');
    const q = query(notesRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const notes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    const notesList = document.getElementById('notesList');
    if (!notesList) return;
    
    if (notes.length === 0) {
      notesList.innerHTML = '<p class="empty-state">No notes yet</p>';
      return;
    }
    
    notesList.innerHTML = notes.map(note => `
      <div class="card" style="margin-bottom: 12px;">
        <div style="font-size: 12px; color: var(--muted); margin-bottom: 8px;">
          ${note.createdAt ? formatDateTime(note.createdAt) : '—'}
        </div>
        <div>${note.text || ''}</div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading notes:', error);
    toast('Failed to load notes', 'error');
  }
}

async function handleAddNote() {
  const noteInput = document.getElementById('noteInput');
  if (!noteInput) return;
  
  const text = noteInput.value.trim();
  if (!text) return;
  
  try {
    const notesRef = collection(db, 'agencies', userStore.agencyId, 'customers', customerId, 'notes');
    const noteRef = doc(notesRef);
    await setDoc(noteRef, {
      text,
      createdByUid: userStore.uid,
      createdAt: serverTimestamp(),
    });
    
    noteInput.value = '';
    await loadNotes();
    toast('Note added', 'success');
  } catch (error) {
    console.error('Error adding note:', error);
    toast('Failed to add note', 'error');
  }
}

async function loadTasks() {
  try {
    const tasks = await listTasks({ customerId });
    
    const tasksList = document.getElementById('tasksList');
    if (!tasksList) return;
    
    if (tasks.length === 0) {
      tasksList.innerHTML = '<p class="empty-state">No tasks for this customer</p>';
      return;
    }
    
    tasksList.innerHTML = tasks.map(task => `
      <div class="list-item" onclick="window.location.href='/tasks.html'">
        <div class="list-item-main">
          <div class="list-item-title">${task.title}</div>
          <div class="list-item-subtitle">${task.dueAt ? formatDateTime(task.dueAt) : 'No due date'}</div>
        </div>
        <div class="list-item-meta priority-${task.priority}">${task.priority}</div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading tasks:', error);
    toast('Failed to load tasks', 'error');
  }
}

async function loadDocuments() {
  try {
    const uploads = await listUploads(customerId);
    
    const documentsList = document.getElementById('documentsList');
    if (!documentsList) return;
    
    if (uploads.length === 0) {
      documentsList.innerHTML = '<p class="empty-state">No documents uploaded</p>';
      return;
    }
    
    documentsList.innerHTML = uploads.map(upload => `
      <div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">${upload.fileName}</div>
          <div class="list-item-subtitle">${upload.createdAt ? formatDateTime(upload.createdAt) : '—'}</div>
        </div>
        <a href="${upload.downloadURL}" target="_blank" class="btn btn-text">Download</a>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading documents:', error);
    toast('Failed to load documents', 'error');
  }
}

async function loadPolicies() {
  // Placeholder - policies would be loaded from Firestore
  const policiesList = document.getElementById('policiesList');
  if (policiesList) {
    policiesList.innerHTML = '<p class="empty-state">Policies feature coming soon</p>';
  }
}

init();
