// customer-page.js - Customer detail page

import { auth, db } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import { initRouter, navigateTo, getUrlParam } from './router.js';
import { getCustomer, updateCustomer } from './customers.js';
import { getConversationForCustomer, getMessages, sendSms, subscribeToMessages } from './messages.js';
import { listTasks, createTask } from './tasks.js';
import { listUploads, uploadFile } from './uploads.js';
import { formatPhone, formatDateTime, formatDateOnly, addMonths, addYears, normalizeToDate } from './models.js';
import { toast } from './ui.js';
import { collection, doc, getDocs, getDoc, setDoc, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { updatePremium, recalculateRenewals } from './lib/metrics.js';

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
  
  // Edit customer button
  const btnEdit = document.getElementById('btnEdit');
  if (btnEdit) {
    btnEdit.addEventListener('click', handleEditClick);
  }
  
  // New policy button
  const btnNewPolicy = document.getElementById('btnNewPolicy');
  if (btnNewPolicy) {
    btnNewPolicy.addEventListener('click', () => openPolicyModal());
  }
  
  // Check role and set edit button state
  updateEditButtonState();
}

let isEditMode = false;

function updateEditButtonState() {
  const btnEdit = document.getElementById('btnEdit');
  if (!btnEdit) return;
  
  const currentUser = auth?.currentUser;
  const isSignedIn = !!currentUser;
  const role = userStore.role;
  const canEdit = isSignedIn && (role === 'admin' || role === 'agent');
  
  if (!isSignedIn) {
    btnEdit.disabled = true;
    btnEdit.title = 'Please sign in to edit customers';
  } else if (!canEdit) {
    btnEdit.disabled = true;
    btnEdit.title = 'You do not have permission to edit customers. View only.';
  } else {
    btnEdit.disabled = false;
    btnEdit.title = '';
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
    renderCustomerInfo();
    
    // Load overview
    loadOverview();
    
    // Update edit button state after customer loads
    updateEditButtonState();
  } catch (error) {
    console.error('Error loading customer:', error);
    toast('Failed to load customer', 'error');
  }
}

function renderCustomerInfo() {
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
}

function loadOverview() {
  const customerDetails = document.getElementById('customerDetails');
  if (!customerDetails) return;
  
  if (isEditMode) {
    // Edit mode - show form
    const address = customer.address || {};
    customerDetails.innerHTML = `
      <form id="customerEditForm">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          <div class="form-group">
            <label class="form-label">First Name</label>
            <input type="text" id="editFirstName" class="form-input" value="${customer.firstName || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">Last Name</label>
            <input type="text" id="editLastName" class="form-input" value="${customer.lastName || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input type="tel" id="editPhoneRaw" class="form-input" value="${customer.phoneRaw || ''}" placeholder="(555) 123-4567" />
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" id="editEmail" class="form-input" value="${customer.email || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select id="editStatus" class="form-select">
              <option value="lead" ${customer.status === 'lead' ? 'selected' : ''}>Lead</option>
              <option value="quoted" ${customer.status === 'quoted' ? 'selected' : ''}>Quoted</option>
              <option value="active" ${customer.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="lapsed" ${customer.status === 'lapsed' ? 'selected' : ''}>Lapsed</option>
              <option value="closed" ${customer.status === 'closed' ? 'selected' : ''}>Closed</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Source</label>
            <input type="text" id="editSource" class="form-input" value="${customer.source || ''}" />
          </div>
          <div class="form-group" style="grid-column: 1 / -1;">
            <label class="form-label">Address Street</label>
            <input type="text" id="editAddressStreet" class="form-input" value="${address.street || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">City</label>
            <input type="text" id="editAddressCity" class="form-input" value="${address.city || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">State</label>
            <input type="text" id="editAddressState" class="form-input" value="${address.state || ''}" />
          </div>
          <div class="form-group">
            <label class="form-label">Zip</label>
            <input type="text" id="editAddressZip" class="form-input" value="${address.zip || ''}" />
          </div>
          <div class="form-group" style="grid-column: 1 / -1;">
            <label class="form-label">Notes</label>
            <textarea id="editNotes" class="form-input" rows="3">${customer.notes || ''}</textarea>
          </div>
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
          <button type="button" class="btn" id="btnCancelEdit">Cancel</button>
          <button type="submit" class="btn btn-primary" id="btnSaveEdit">Save Changes</button>
        </div>
      </form>
    `;
    
    // Wire up form handlers
    const form = document.getElementById('customerEditForm');
    if (form) {
      form.addEventListener('submit', handleSaveCustomer);
    }
    
    const btnCancelEdit = document.getElementById('btnCancelEdit');
    if (btnCancelEdit) {
      btnCancelEdit.addEventListener('click', () => {
        isEditMode = false;
        loadOverview();
        updateEditButtonState();
      });
    }
  } else {
    // View mode - show read-only info
    const address = customer.address || {};
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
        ${address.street ? `
        <div style="grid-column: 1 / -1;">
          <div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">Address</div>
          <div>${address.street || ''}${address.city ? `, ${address.city}` : ''}${address.state ? `, ${address.state}` : ''}${address.zip ? ` ${address.zip}` : ''}</div>
        </div>
        ` : ''}
        ${customer.notes ? `
        <div style="grid-column: 1 / -1;">
          <div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">Notes</div>
          <div>${customer.notes}</div>
        </div>
        ` : ''}
      </div>
    `;
  }
}

function handleEditClick() {
  const role = userStore.role;
  const canEdit = (role === 'admin' || role === 'agent');
  
  if (!canEdit) {
    toast('You do not have permission to edit customers', 'error');
    return;
  }
  
  if (isEditMode) {
    // Toggle back to view mode
    isEditMode = false;
    loadOverview();
    const btnEdit = document.getElementById('btnEdit');
    if (btnEdit) {
      btnEdit.textContent = 'Edit';
    }
  } else {
    // Enter edit mode
    isEditMode = true;
    loadOverview();
    const btnEdit = document.getElementById('btnEdit');
    if (btnEdit) {
      btnEdit.textContent = 'Cancel';
    }
  }
}

async function handleSaveCustomer(e) {
  e.preventDefault();
  
  const btnSaveEdit = document.getElementById('btnSaveEdit');
  if (btnSaveEdit) {
    btnSaveEdit.disabled = true;
    btnSaveEdit.textContent = 'Saving...';
  }
  
  try {
    // Gather form data
    const updates = {
      firstName: document.getElementById('editFirstName')?.value.trim() || null,
      lastName: document.getElementById('editLastName')?.value.trim() || null,
      phoneRaw: document.getElementById('editPhoneRaw')?.value.trim() || null,
      email: document.getElementById('editEmail')?.value.trim() || null,
      status: document.getElementById('editStatus')?.value || 'lead',
      source: document.getElementById('editSource')?.value.trim() || null,
      notes: document.getElementById('editNotes')?.value.trim() || null,
      address: {
        street: document.getElementById('editAddressStreet')?.value.trim() || null,
        city: document.getElementById('editAddressCity')?.value.trim() || null,
        state: document.getElementById('editAddressState')?.value.trim() || null,
        zip: document.getElementById('editAddressZip')?.value.trim() || null,
      }
    };
    
    console.log('[customer-page.js] Saving customer updates', {
      customerId,
      updates
    });
    
    await updateCustomer(customerId, updates);
    
    // Reload customer data
    await loadCustomer();
    
    // Exit edit mode
    isEditMode = false;
    loadOverview();
    updateEditButtonState();
    
    const btnEdit = document.getElementById('btnEdit');
    if (btnEdit) {
      btnEdit.textContent = 'Edit';
    }
    
    toast('Customer updated successfully', 'success');
  } catch (error) {
    console.error('[customer-page.js] Error saving customer:', error);
    
    let errorMsg = 'Failed to save customer';
    if (error.code === 'permission-denied' || error.code === 'PERMISSION_DENIED') {
      errorMsg = 'Permission denied. You may not have access to update customers.';
    } else if (error.message) {
      errorMsg = error.message;
    }
    
    toast(errorMsg, 'error');
    
    if (btnSaveEdit) {
      btnSaveEdit.disabled = false;
      btnSaveEdit.textContent = 'Save Changes';
    }
  }
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
  const documentsList = document.getElementById('documentsList');
  if (!documentsList) return;
  
  // Show loading state
  documentsList.innerHTML = '<p class="empty-state">Loading documents...</p>';
  
  try {
    const uploads = await listUploads(customerId);
    
    if (uploads.length === 0) {
      documentsList.innerHTML = '<p class="empty-state">No documents uploaded</p>';
      return;
    }
    
    documentsList.innerHTML = uploads.map(upload => {
      // Safely handle createdAt (could be Timestamp, Date, or missing)
      let createdAtDisplay = '—';
      if (upload.createdAt) {
        try {
          const createdAt = upload.createdAt?.toDate ? upload.createdAt.toDate() : new Date(upload.createdAt);
          createdAtDisplay = formatDateTime(createdAt);
        } catch (e) {
          console.warn('[customer-page.js] Invalid createdAt for upload:', upload.id, e);
        }
      }
      
      return `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${upload.fileName || 'Unknown file'}</div>
            <div class="list-item-subtitle">${createdAtDisplay}</div>
          </div>
          <a href="${upload.downloadURL || '#'}" target="_blank" class="btn btn-text">Download</a>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('[customer-page.js] Error loading documents:', error);
    
    // Show user-friendly error with retry option
    let errorMessage = 'Failed to load documents';
    if (error.code === 'failed-precondition' && error.message?.includes('index')) {
      errorMessage = 'Database index is building. Please retry in a minute.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    documentsList.innerHTML = `
      <div style="padding: 24px; text-align: center;">
        <div style="color: var(--danger); margin-bottom: 16px;">⚠️ ${errorMessage}</div>
        <button class="btn btn-primary" onclick="window.loadDocumentsRetry && window.loadDocumentsRetry()">Retry</button>
      </div>
    `;
    
    // Store retry function globally
    window.loadDocumentsRetry = loadDocuments;
    
    // Only show toast for non-index errors (index errors already handled in listUploads)
    if (!(error.code === 'failed-precondition' && error.message?.includes('index'))) {
      toast(errorMessage, 'error');
    }
  }
}

async function loadPolicies() {
  try {
    if (!userStore.agencyId) {
      const policiesList = document.getElementById('policiesList');
      if (policiesList) {
        policiesList.innerHTML = '<p class="empty-state">Agency ID not available</p>';
      }
      return;
    }
    
    const policiesRef = collection(db, 'agencies', userStore.agencyId, 'customers', customerId, 'policies');
    const q = query(policiesRef, orderBy('expirationDate', 'asc'));
    const snapshot = await getDocs(q);
    
    const policies = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log('[customer-page.js] Loaded policies', {
      customerId,
      count: policies.length
    });
    
    const policiesList = document.getElementById('policiesList');
    if (!policiesList) return;
    
    if (policies.length === 0) {
      policiesList.innerHTML = '<p class="empty-state">No policies found</p>';
      return;
    }
    
    policiesList.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Policy Type</th>
            <th>Insurance Company</th>
            <th>Effective Date</th>
            <th>Expiration Date</th>
            <th>Premium</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${policies.map(policy => {
            const effDate = policy.effectiveDate?.toDate ? policy.effectiveDate.toDate() : (policy.effectiveDate ? new Date(policy.effectiveDate) : null);
            const expDate = policy.expirationDate?.toDate ? policy.expirationDate.toDate() : (policy.expirationDate ? new Date(policy.expirationDate) : null);
            const premium = policy.premium != null ? `$${policy.premium.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
            
            return `
              <tr style="cursor: pointer;" onclick="editPolicy('${policy.id}')">
                <td>${policy.policyTypeNormalized || policy.policyType || policy.rawPolicyType || '—'}</td>
                <td>${policy.insuranceCompany || '—'}</td>
                <td>${effDate ? formatDateOnly(effDate) : '—'}</td>
                <td>${expDate ? formatDateOnly(expDate) : '—'}</td>
                <td>${premium}</td>
                <td><span class="badge badge-info">${policy.status || 'active'}</span></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (error) {
    console.error('[customer-page.js] Error loading policies:', error);
    const policiesList = document.getElementById('policiesList');
    if (policiesList) {
      policiesList.innerHTML = `<p class="empty-state" style="color: var(--danger);">Failed to load policies: ${error.message}</p>`;
    }
    toast('Failed to load policies', 'error');
  }
}

// Policy modal functions
let currentPolicyId = null;

window.editPolicy = async function(policyId) {
  try {
    if (!userStore.agencyId) {
      toast('Agency ID not available', 'error');
      return;
    }
    
    const policyRef = doc(db, 'agencies', userStore.agencyId, 'customers', customerId, 'policies', policyId);
    const policySnap = await getDoc(policyRef);
    
    if (!policySnap.exists()) {
      toast('Policy not found', 'error');
      return;
    }
    
    const policy = { id: policySnap.id, ...policySnap.data() };
    openPolicyModal(policy);
  } catch (error) {
    console.error('Error loading policy:', error);
    toast('Failed to load policy', 'error');
  }
};

function openPolicyModal(policy = null) {
  const modal = document.getElementById('policyModal');
  const modalTitle = document.getElementById('policyModalTitle');
  const form = document.getElementById('policyForm');
  const policyIdInput = document.getElementById('policyId');
  const errorDiv = document.getElementById('policyFormError');
  
  if (modal) modal.classList.remove('hidden');
  if (form) form.reset();
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  }
  
  const isEditMode = policy && policy.id;
  currentPolicyId = isEditMode ? policy.id : null;
  
  if (modalTitle) modalTitle.textContent = isEditMode ? 'Edit Policy' : 'New Policy';
  if (policyIdInput) policyIdInput.value = isEditMode ? policy.id : '';
  
  // Populate form fields if editing
  if (isEditMode) {
    const policyTypeEl = document.getElementById('policyType');
    const insuranceCompanyEl = document.getElementById('insuranceCompany');
    const effectiveDateEl = document.getElementById('effectiveDate');
    const expirationDateEl = document.getElementById('expirationDate');
    const premiumEl = document.getElementById('premium');
    const statusEl = document.getElementById('policyStatus');
    const termMonthsEl = document.getElementById('termMonths');
    const expirationManuallySetEl = document.getElementById('expirationManuallySet');
    
    if (policyTypeEl) policyTypeEl.value = policy.policyTypeNormalized || policy.policyType || '';
    if (insuranceCompanyEl) insuranceCompanyEl.value = policy.insuranceCompany || '';
    if (premiumEl) premiumEl.value = policy.premium != null ? policy.premium : '';
    if (statusEl) statusEl.value = policy.status || 'active';
    
    // Handle dates - format as YYYY-MM-DD in local timezone
    if (effectiveDateEl) {
      const effDate = normalizeToDate(policy.effectiveDate);
      if (effDate) {
        const year = effDate.getFullYear();
        const month = String(effDate.getMonth() + 1).padStart(2, '0');
        const day = String(effDate.getDate()).padStart(2, '0');
        effectiveDateEl.value = `${year}-${month}-${day}`;
      }
    }
    
    if (expirationDateEl) {
      const expDate = normalizeToDate(policy.expirationDate);
      if (expDate) {
        const year = expDate.getFullYear();
        const month = String(expDate.getMonth() + 1).padStart(2, '0');
        const day = String(expDate.getDate()).padStart(2, '0');
        expirationDateEl.value = `${year}-${month}-${day}`;
      }
    }
    
    // Handle Personal Auto term
    if (termMonthsEl) {
      termMonthsEl.value = policy.termMonths || '12';
    }
    
    if (expirationManuallySetEl) {
      expirationManuallySetEl.value = policy.expirationManuallySet ? 'true' : 'false';
    }
    
    // Update UI based on policy type
    updatePolicyTypeUI();
  } else {
    // New policy - set defaults
    const statusEl = document.getElementById('policyStatus');
    const termMonthsEl = document.getElementById('termMonths');
    if (statusEl) statusEl.value = 'active';
    if (termMonthsEl) termMonthsEl.value = '12';
    
    // Update UI
    updatePolicyTypeUI();
  }
}

function closePolicyModal() {
  const modal = document.getElementById('policyModal');
  if (modal) modal.classList.add('hidden');
  currentPolicyId = null;
}

function updatePolicyTypeUI() {
  const policyTypeEl = document.getElementById('policyType');
  const termGroupEl = document.getElementById('termMonthsGroup');
  const expirationManuallySetEl = document.getElementById('expirationManuallySet');
  
  if (!policyTypeEl || !termGroupEl) return;
  
  const policyType = policyTypeEl.value.toLowerCase();
  const isPersonalAuto = policyType === 'personal auto' || policyType === 'pa';
  
  termGroupEl.style.display = isPersonalAuto ? 'block' : 'none';
  
  // If policy type changed away from Personal Auto, reset manual flag and recalculate
  if (!isPersonalAuto && expirationManuallySetEl) {
    expirationManuallySetEl.value = 'false';
    recalculateExpiration();
  } else if (isPersonalAuto) {
    // When switching to Personal Auto, recalculate based on term
    recalculateExpiration();
  }
}

function recalculateExpiration() {
  const effectiveDateEl = document.getElementById('effectiveDate');
  const expirationDateEl = document.getElementById('expirationDate');
  const expirationManuallySetEl = document.getElementById('expirationManuallySet');
  const policyTypeEl = document.getElementById('policyType');
  const termMonthsEl = document.getElementById('termMonths');
  
  if (!effectiveDateEl || !expirationDateEl) return;
  
  // Don't recalculate if manually set
  if (expirationManuallySetEl && expirationManuallySetEl.value === 'true') {
    return;
  }
  
  const effectiveDateStr = effectiveDateEl.value;
  if (!effectiveDateStr) {
    expirationDateEl.value = '';
    return;
  }
  
  const effectiveDate = new Date(effectiveDateStr);
  if (isNaN(effectiveDate.getTime())) {
    return;
  }
  
  // Determine term length
  let months = 12; // Default 1 year
  
  const policyType = policyTypeEl ? policyTypeEl.value.toLowerCase() : '';
  const isPersonalAuto = policyType === 'personal auto' || policyType === 'pa';
  
  if (isPersonalAuto && termMonthsEl) {
    months = parseInt(termMonthsEl.value) || 12;
  }
  
  // Calculate expiration
  const expirationDate = addMonths(effectiveDate, months);
  // Format as YYYY-MM-DD in local timezone
  const year = expirationDate.getFullYear();
  const month = String(expirationDate.getMonth() + 1).padStart(2, '0');
  const day = String(expirationDate.getDate()).padStart(2, '0');
  expirationDateEl.value = `${year}-${month}-${day}`;
}

// Wire up event listeners for policy form
function setupPolicyForm() {
  const form = document.getElementById('policyForm');
  const btnCancelPolicy = document.getElementById('btnCancelPolicy');
  const policyModal = document.getElementById('policyModal');
  const effectiveDateEl = document.getElementById('effectiveDate');
  const policyTypeEl = document.getElementById('policyType');
  const termMonthsEl = document.getElementById('termMonths');
  const expirationDateEl = document.getElementById('expirationDate');
  
  if (form) {
    form.addEventListener('submit', handlePolicySubmit);
  }
  
  if (btnCancelPolicy) {
    btnCancelPolicy.addEventListener('click', closePolicyModal);
  }
  
  if (policyModal) {
    policyModal.addEventListener('click', (e) => {
      if (e.target === policyModal) {
        closePolicyModal();
      }
    });
  }
  
  // Auto-calculate expiration when effective date changes
  if (effectiveDateEl) {
    effectiveDateEl.addEventListener('change', recalculateExpiration);
    effectiveDateEl.addEventListener('input', recalculateExpiration);
  }
  
  // Update UI when policy type changes
  if (policyTypeEl) {
    policyTypeEl.addEventListener('change', () => {
      updatePolicyTypeUI();
      recalculateExpiration();
    });
  }
  
  // Update expiration when term changes (Personal Auto)
  if (termMonthsEl) {
    termMonthsEl.addEventListener('change', recalculateExpiration);
  }
  
  // Track manual expiration edits
  if (expirationDateEl) {
    expirationDateEl.addEventListener('change', () => {
      const expirationManuallySetEl = document.getElementById('expirationManuallySet');
      if (expirationManuallySetEl) {
        expirationManuallySetEl.value = 'true';
      }
    });
  }
}

async function handlePolicySubmit(e) {
  e.preventDefault();
  
  const submitBtn = document.querySelector('#policyForm button[type="submit"]');
  const errorDiv = document.getElementById('policyFormError');
  
  // Clear previous errors
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  }
  
  // Disable submit button
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }
  
  try {
    if (!userStore.agencyId) {
      throw new Error('Agency ID not available');
    }
    
    // Gather form data
    const policyTypeEl = document.getElementById('policyType');
    const insuranceCompanyEl = document.getElementById('insuranceCompany');
    const effectiveDateEl = document.getElementById('effectiveDate');
    const expirationDateEl = document.getElementById('expirationDate');
    const premiumEl = document.getElementById('premium');
    const statusEl = document.getElementById('policyStatus');
    const termMonthsEl = document.getElementById('termMonths');
    const expirationManuallySetEl = document.getElementById('expirationManuallySet');
    
    const policyType = policyTypeEl ? policyTypeEl.value.trim() : '';
    if (!policyType) {
      throw new Error('Policy type is required');
    }
    
    const effectiveDateStr = effectiveDateEl ? effectiveDateEl.value : '';
    if (!effectiveDateStr) {
      throw new Error('Effective date is required');
    }
    
    const expirationDateStr = expirationDateEl ? expirationDateEl.value : '';
    if (!expirationDateStr) {
      throw new Error('Expiration date is required');
    }
    
    // Convert dates to Firestore Timestamps (at noon local time to avoid timezone issues)
    const effectiveDate = new Date(effectiveDateStr);
    effectiveDate.setHours(12, 0, 0, 0);
    
    const expirationDate = new Date(expirationDateStr);
    expirationDate.setHours(12, 0, 0, 0);
    
    const { Timestamp } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
    
    const policyData = {
      policyTypeNormalized: policyType,
      policyType: policyType,
      insuranceCompany: insuranceCompanyEl ? insuranceCompanyEl.value.trim() || null : null,
      effectiveDate: Timestamp.fromDate(effectiveDate),
      expirationDate: Timestamp.fromDate(expirationDate),
      premium: premiumEl && premiumEl.value ? parseFloat(premiumEl.value) : null,
      status: statusEl ? statusEl.value : 'active',
      expirationManuallySet: expirationManuallySetEl ? expirationManuallySetEl.value === 'true' : false,
      agencyId: userStore.agencyId, // Denormalized field for collectionGroup queries
      customerId: customerId, // Denormalized field for easier access
    };
    
    // Add termMonths for Personal Auto
    const isPersonalAuto = policyType.toLowerCase() === 'personal auto' || policyType.toLowerCase() === 'pa';
    if (isPersonalAuto && termMonthsEl) {
      policyData.termMonths = parseInt(termMonthsEl.value) || 12;
    } else {
      // For non-Personal Auto, set to 12 for consistency
      policyData.termMonths = 12;
    }
    
    // Save policy
    const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
    
    let oldPremium = 0;
    let oldStatus = 'inactive';
    let oldExpirationDate = null;
    
    if (currentPolicyId) {
      // Get old policy data for metrics calculation
      const policyRef = doc(db, 'agencies', userStore.agencyId, 'customers', customerId, 'policies', currentPolicyId);
      const oldPolicySnap = await getDoc(policyRef);
      if (oldPolicySnap.exists()) {
        const oldPolicy = oldPolicySnap.data();
        oldPremium = (oldPolicy.status === 'active' && oldPolicy.premium) ? oldPolicy.premium : 0;
        oldStatus = oldPolicy.status || 'inactive';
        oldExpirationDate = oldPolicy.expirationDate;
      }
      
      // Update existing policy
      await setDoc(policyRef, {
        ...policyData,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      
      // Update metrics: adjust premium based on status change
      const newPremium = (policyData.status === 'active' && policyData.premium) ? policyData.premium : 0;
      const premiumDelta = newPremium - oldPremium;
      if (premiumDelta !== 0) {
        await updatePremium(userStore.agencyId, premiumDelta);
      }
      
      // Recalculate renewals if expiration date or status changed
      const expirationChanged = !oldExpirationDate || 
        (oldExpirationDate.toMillis && policyData.expirationDate.toMillis && 
         oldExpirationDate.toMillis() !== policyData.expirationDate.toMillis()) ||
        oldStatus !== policyData.status;
      if (expirationChanged) {
        await recalculateRenewals(userStore.agencyId);
      }
      
      toast('Policy updated successfully', 'success');
    } else {
      // Create new policy
      const policiesRef = collection(db, 'agencies', userStore.agencyId, 'customers', customerId, 'policies');
      const newPolicyRef = doc(policiesRef);
      await setDoc(newPolicyRef, {
        ...policyData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      // Update metrics: add premium if active
      if (policyData.status === 'active' && policyData.premium) {
        await updatePremium(userStore.agencyId, policyData.premium);
      }
      
      // Recalculate renewals for new policy
      await recalculateRenewals(userStore.agencyId);
      
      toast('Policy created successfully', 'success');
    }
    
    // Close modal and reload policies
    closePolicyModal();
    await loadPolicies();
  } catch (error) {
    console.error('Error saving policy:', error);
    
    const errorMsg = error.message || 'Failed to save policy';
    if (errorDiv) {
      errorDiv.textContent = errorMsg;
      errorDiv.style.display = 'block';
    }
    toast(errorMsg, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      const modalTitle = document.getElementById('policyModalTitle');
      submitBtn.textContent = (modalTitle && modalTitle.textContent === 'Edit Policy') ? 'Save Changes' : 'Create Policy';
    }
  }
}

// Initialize policy form when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupPolicyForm);
} else {
  setupPolicyForm();
}

init();
