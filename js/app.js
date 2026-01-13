// app.js - Dashboard page logic

import { auth, db } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import {
  collection,
  query,
  where,
  getDocs,
  getCountFromServer,
  orderBy,
  limit,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Initialize
async function init() {
  try {
    console.log('[app.js] Initializing dashboard...');
    
    // Verify Firebase services
    if (!auth || !db) {
      throw new Error('Firebase services not initialized. Check firebase.js for errors.');
    }
    
    // Wait for auth guard (handles redirect if not logged in)
    await initAuthGuard();
    
    // Setup UI
    setupUI();
    
    // Load dashboard data
    await loadDashboard();
    
    console.log('[app.js] Dashboard initialized successfully');
  } catch (error) {
    console.error('[app.js] Failed to initialize app:', error);
    console.error('[app.js] Error stack:', error.stack);
    const errorMessage = error?.message || String(error);
    showError(`Failed to initialize dashboard: ${errorMessage}`);
  }
}

function setupUI() {
  // User info in sidebar
  const userNameEl = document.getElementById('userName');
  const userRoleEl = document.getElementById('userRole');
  
  if (userNameEl) {
    userNameEl.textContent = userStore.displayName || userStore.email || 'User';
  }
  if (userRoleEl) {
    userRoleEl.textContent = userStore.role || '—';
  }
  
  // User menu in top bar
  const userMenuEmail = document.getElementById('userMenuEmail');
  const userMenuRole = document.getElementById('userMenuRole');
  const dropdownEmail = document.getElementById('dropdownEmail');
  const dropdownRole = document.getElementById('dropdownRole');
  
  if (userMenuEmail) userMenuEmail.textContent = userStore.email || '—';
  if (userMenuRole) userMenuRole.textContent = userStore.role || '—';
  if (dropdownEmail) dropdownEmail.textContent = userStore.email || '—';
  if (dropdownRole) dropdownRole.textContent = userStore.role || '—';
  
  // User menu toggle
  const btnUserMenuToggle = document.getElementById('btnUserMenuToggle');
  const userMenuDropdown = document.getElementById('userMenuDropdown');
  if (btnUserMenuToggle && userMenuDropdown) {
    btnUserMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenuDropdown.classList.toggle('show');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      userMenuDropdown.classList.remove('show');
    });
  }
  
  // Logout buttons
  const btnLogout = document.getElementById('btnLogout');
  const btnLogoutTop = document.getElementById('btnLogoutTop');
  
  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = '/index.html';
    } catch (error) {
      console.error('Logout error:', error);
      showError('Failed to log out');
    }
  };
  
  if (btnLogout) btnLogout.addEventListener('click', handleLogout);
  if (btnLogoutTop) btnLogoutTop.addEventListener('click', handleLogout);
  
  // Menu toggle (mobile)
  const btnMenuToggle = document.getElementById('btnMenuToggle');
  const sidebar = document.getElementById('sidebar');
  if (btnMenuToggle && sidebar) {
    btnMenuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
  
  // New Customer button
  const btnNewCustomer = document.getElementById('btnNewCustomer');
  if (btnNewCustomer) {
    btnNewCustomer.addEventListener('click', () => {
      window.location.href = '/customers.html?new=1';
    });
  }
  
  // Global search
  const globalSearch = document.getElementById('globalSearch');
  if (globalSearch) {
    globalSearch.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const query = globalSearch.value.trim();
        if (query) {
          window.location.href = `/customers.html?search=${encodeURIComponent(query)}`;
        }
      }
    });
  }
}

async function loadDashboard() {
  try {
    const agencyId = userStore.agencyId;
    if (!agencyId) {
      showError('No agency found');
      return;
    }
    
    // Load all dashboard data in parallel
    const [
      customersSnapshot,
      policiesSnapshot,
      renewalsSnapshot,
      tasksSnapshot,
      conversationsSnapshot
    ] = await Promise.all([
      getCustomers(agencyId),
      getPolicies(agencyId),
      getRenewals(agencyId),
      getTasksDueSoon(agencyId),
      getRecentConversations(agencyId)
    ]);
    
    // Calculate portfolio metrics
    const totalCustomers = customersSnapshot.size;
    const { activePoliciesCount, totalPremium } = calculatePolicyMetrics(policiesSnapshot);
    const renewalsCount = renewalsSnapshot.size;
    
    // Update snapshot cards
    updateSnapshotCard('totalCustomers', totalCustomers, totalCustomers === 0);
    updateSnapshotCard('activePolicies', activePoliciesCount, activePoliciesCount === 0);
    updateSnapshotCard('totalPremium', formatCurrency(totalPremium), totalPremium === 0);
    updateSnapshotCard('renewalsCount', renewalsCount, renewalsCount === 0);
    
    // Render widgets
    renderRenewalsWidget(renewalsSnapshot, agencyId);
    renderTasksWidget(tasksSnapshot);
    renderCrosssellWidget(customersSnapshot, agencyId);
    renderConversationsWidget(conversationsSnapshot, agencyId);
    
    // Show/hide getting started banner
    const hasData = totalCustomers > 0 || activePoliciesCount > 0;
    const gettingStartedBanner = document.getElementById('gettingStartedBanner');
    if (gettingStartedBanner) {
      gettingStartedBanner.classList.toggle('hidden', hasData);
    }
    
  } catch (error) {
    console.error('Error loading dashboard:', error);
    showError('Failed to load dashboard data');
  }
}

// Firestore queries
async function getCustomers(agencyId) {
  const customersRef = collection(db, 'agencies', agencyId, 'customers');
  return await getDocs(customersRef);
}

async function getPolicies(agencyId) {
  // Query all policies across all customers
  // Note: This requires a collection group query which needs an index
  // For now, we'll query policies from customers we have
  const customersRef = collection(db, 'agencies', agencyId, 'customers');
  const customersSnapshot = await getDocs(customersRef);
  
  const allPolicies = [];
  for (const customerDoc of customersSnapshot.docs) {
    const policiesRef = collection(db, 'agencies', agencyId, 'customers', customerDoc.id, 'policies');
    const policiesSnapshot = await getDocs(policiesRef);
    policiesSnapshot.forEach(doc => {
      allPolicies.push({ id: doc.id, customerId: customerDoc.id, ...doc.data() });
    });
  }
  
  return allPolicies;
}

async function getRenewals(agencyId) {
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(now.getDate() + 30);
  
  const customersRef = collection(db, 'agencies', agencyId, 'customers');
  const customersSnapshot = await getDocs(customersRef);
  
  const renewals = [];
  for (const customerDoc of customersSnapshot.docs) {
    const policiesRef = collection(db, 'agencies', agencyId, 'customers', customerDoc.id, 'policies');
    const policiesSnapshot = await getDocs(policiesRef);
    
    policiesSnapshot.forEach(doc => {
      const policy = doc.data();
      if (policy.status === 'active' && policy.expirationDate) {
        const expirationDate = policy.expirationDate.toDate ? policy.expirationDate.toDate() : new Date(policy.expirationDate);
        if (expirationDate >= now && expirationDate <= thirtyDaysFromNow) {
          renewals.push({
            id: doc.id,
            customerId: customerDoc.id,
            customerName: customerDoc.data().fullName || 'Unknown',
            ...policy
          });
        }
      }
    });
  }
  
  // Sort by expiration date
  renewals.sort((a, b) => {
    const dateA = a.expirationDate.toDate ? a.expirationDate.toDate() : new Date(a.expirationDate);
    const dateB = b.expirationDate.toDate ? b.expirationDate.toDate() : new Date(b.expirationDate);
    return dateA - dateB;
  });
  
  return renewals.slice(0, 8);
}

async function getTasksDueSoon(agencyId) {
  const now = new Date();
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(now.getDate() + 7);
  
  const tasksRef = collection(db, 'agencies', agencyId, 'tasks');
  
  // Query all tasks and filter in memory (simpler than complex queries)
  // Note: For production, consider creating a composite index:
  // Collection: tasks, Fields: status (ASC), dueAt (ASC)
  // Or: assignedToUid (ASC), status (ASC), dueAt (ASC)
  let q;
  if (userStore.role !== 'admin') {
    q = query(tasksRef, where('assignedToUid', '==', userStore.uid));
  } else {
    q = query(tasksRef);
  }
  
  try {
    const snapshot = await getDocs(q);
    const tasks = [];
    snapshot.forEach(doc => {
      const task = { id: doc.id, ...doc.data() };
      // Filter out done tasks and check due date
      if (task.status !== 'done' && task.dueAt) {
        const dueDate = task.dueAt.toDate ? task.dueAt.toDate() : new Date(task.dueAt);
        if (dueDate <= sevenDaysFromNow && dueDate >= now) {
          tasks.push(task);
        }
      }
    });
    // Sort by due date
    tasks.sort((a, b) => {
      const dateA = a.dueAt.toDate ? a.dueAt.toDate() : new Date(a.dueAt);
      const dateB = b.dueAt.toDate ? b.dueAt.toDate() : new Date(b.dueAt);
      return dateA - dateB;
    });
    return tasks.slice(0, 8);
  } catch (error) {
    // If query fails, return empty array
    console.warn('Tasks query failed:', error);
    return [];
  }
}

async function getRecentConversations(agencyId) {
  const conversationsRef = collection(db, 'agencies', agencyId, 'conversations');
  const q = query(conversationsRef, orderBy('lastMessageAt', 'desc'), limit(8));
  
  try {
    return await getDocs(q);
  } catch (error) {
    // If query fails (index not created), return empty
    console.warn('Conversations query failed (index may be needed):', error);
    return { size: 0, forEach: () => {} };
  }
}

// Calculate metrics
function calculatePolicyMetrics(policies) {
  let activePoliciesCount = 0;
  let totalPremium = 0;
  
  policies.forEach(policy => {
    if (policy.status === 'active') {
      activePoliciesCount++;
      if (policy.premium && typeof policy.premium === 'number') {
        totalPremium += policy.premium;
      }
    }
  });
  
  // Fallback: if no policies found, try to use customer.totalPremium
  if (activePoliciesCount === 0) {
    // This would require querying customers for totalPremium field
    // For now, return 0
  }
  
  return { activePoliciesCount, totalPremium };
}

// Render widgets
function renderRenewalsWidget(renewals, agencyId) {
  const widget = document.getElementById('renewalsWidget');
  if (!widget) return;
  
  if (renewals.length === 0) {
    widget.innerHTML = `
      <p class="empty-state">
        No renewals in the next 30 days.<br/>
        <small style="color: var(--muted);">Add policies to track renewals</small>
      </p>
    `;
    return;
  }
  
  widget.innerHTML = renewals.map(renewal => {
    const expirationDate = renewal.expirationDate.toDate ? renewal.expirationDate.toDate() : new Date(renewal.expirationDate);
    return `
      <div class="list-item" onclick="window.location.href='/customer.html?id=${renewal.customerId}'">
        <div class="list-item-main">
          <div class="list-item-title">${renewal.customerName}</div>
          <div class="list-item-subtitle">${renewal.policyType || renewal.carrier || 'Policy'} • Expires ${formatDate(expirationDate)}</div>
        </div>
        <div class="list-item-meta">${formatCurrency(renewal.premium || 0)}</div>
      </div>
    `;
  }).join('');
}

function renderTasksWidget(tasks) {
  const widget = document.getElementById('tasksWidget');
  if (!widget) return;
  
  if (tasks.length === 0) {
    widget.innerHTML = `
      <p class="empty-state">
        No tasks due in the next 7 days.<br/>
        <small style="color: var(--muted);"><a href="/tasks.html" style="color: var(--accent);">Create a task</a> to get started</small>
      </p>
    `;
    return;
  }
  
  widget.innerHTML = tasks.map(task => {
    const dueDate = task.dueAt ? (task.dueAt.toDate ? task.dueAt.toDate() : new Date(task.dueAt)) : null;
    return `
      <div class="list-item" onclick="window.location.href='/tasks.html?focus=${task.id}'">
        <div class="list-item-main">
          <div class="list-item-title">${task.title || 'Untitled Task'}</div>
          <div class="list-item-subtitle">${dueDate ? formatDate(dueDate) : 'No due date'}</div>
        </div>
        <div class="list-item-meta priority-${task.priority || 'med'}">${task.priority || 'med'}</div>
      </div>
    `;
  }).join('');
}

async function renderCrosssellWidget(customersSnapshot, agencyId) {
  const widget = document.getElementById('crosssellWidget');
  if (!widget) return;
  
  // Get customers with crossSellScore or policyCount == 1
  const customers = [];
  customersSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.crossSellScore > 0 || data.policyCount === 1) {
      customers.push({ id: doc.id, ...data });
    }
  });
  
  // Sort by crossSellScore descending
  customers.sort((a, b) => (b.crossSellScore || 0) - (a.crossSellScore || 0));
  
  if (customers.length === 0) {
    widget.innerHTML = `
      <p class="empty-state">
        No cross-sell opportunities yet.<br/>
        <small style="color: var(--muted);">Customers with single policies will appear here</small>
      </p>
    `;
    return;
  }
  
  widget.innerHTML = customers.slice(0, 8).map(customer => {
    return `
      <div class="list-item" onclick="window.location.href='/customer.html?id=${customer.id}'">
        <div class="list-item-main">
          <div class="list-item-title">${customer.fullName || 'Unknown'}</div>
          <div class="list-item-subtitle">${customer.policyCount || 0} policy${customer.policyCount !== 1 ? 's' : ''} • Score: ${customer.crossSellScore || 0}</div>
        </div>
        <div class="list-item-meta">${customer.status || 'lead'}</div>
      </div>
    `;
  }).join('');
}

async function renderConversationsWidget(conversationsSnapshot, agencyId) {
  const widget = document.getElementById('conversationsWidget');
  if (!widget) return;
  
  if (conversationsSnapshot.size === 0) {
    widget.innerHTML = `
      <p class="empty-state">
        No conversations yet.<br/>
        <small style="color: var(--muted);">Enable Twilio to start receiving messages</small>
      </p>
    `;
    return;
  }
  
  // Get customer names for conversations
  const customerIds = [];
  const conversations = [];
  conversationsSnapshot.forEach(doc => {
    const data = doc.data();
    customerIds.push(data.customerId);
    conversations.push({ id: doc.id, ...data });
  });
  
  // Fetch customer names in batch
  const customerNames = {};
  const customersRef = collection(db, 'agencies', agencyId, 'customers');
  const customersSnapshot = await getDocs(customersRef);
  customersSnapshot.forEach(doc => {
    if (customerIds.includes(doc.id)) {
      customerNames[doc.id] = doc.data().fullName || 'Unknown';
    }
  });
  
  widget.innerHTML = conversations.map(conv => {
    const lastMessageAt = conv.lastMessageAt ? (conv.lastMessageAt.toDate ? conv.lastMessageAt.toDate() : new Date(conv.lastMessageAt)) : null;
    return `
      <div class="list-item" onclick="window.location.href='/customer.html?id=${conv.customerId}#messages'">
        <div class="list-item-main">
          <div class="list-item-title">${customerNames[conv.customerId] || 'Unknown Customer'}</div>
          <div class="list-item-subtitle">${conv.lastMessageSnippet || 'No messages'}</div>
        </div>
        <div class="list-item-meta">${lastMessageAt ? formatDateTime(lastMessageAt) : '—'}</div>
      </div>
    `;
  }).join('');
}

// Helper functions
function updateSnapshotCard(id, value, isEmpty) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = isEmpty ? '0' : value;
  }
}

function formatCurrency(amount) {
  if (amount == null || amount === 0) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatDate(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : (date.toDate ? date.toDate() : new Date(date));
  return d.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return formatDate(date);
}

function showError(message) {
  const pageContent = document.getElementById('pageContent');
  if (pageContent) {
    const errorDetails = message || 'Unknown error occurred';
    pageContent.innerHTML = `
      <div class="card" style="text-align: center; padding: 40px;">
        <h3 style="color: var(--danger); margin-bottom: 16px;">⚠️ Initialization Error</h3>
        <p style="margin-bottom: 20px; color: var(--text);">${escapeHtml(errorDetails)}</p>
        <div style="margin-bottom: 20px; padding: 16px; background: rgba(251, 113, 133, 0.1); border-radius: 8px; text-align: left;">
          <strong style="color: var(--danger);">Common causes:</strong>
          <ul style="margin: 8px 0 0 20px; color: var(--muted);">
            <li>Firebase services not initialized (check console)</li>
            <li>Network connectivity issues</li>
            <li>Firestore rules blocking access</li>
            <li>User authentication failed</li>
          </ul>
        </div>
        <button class="btn btn-primary" onclick="window.location.reload()" style="margin-right: 12px;">Retry</button>
        <button class="btn" onclick="window.location.href='/index.html'">Go to Login</button>
      </div>
    `;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize on load
init();
