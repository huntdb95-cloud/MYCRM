// app.js - Dashboard page logic

import { auth, db, app } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  getCountFromServer,
  orderBy,
  limit,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getDashboardSnapshot, getCacheAge, clearDashboardCache } from './lib/dashboardService.js';

// Helper to check if cached snapshot exists (synchronous)
function hasCachedSnapshot(agencyId) {
  try {
    const key = `dashboardSnapshot:${agencyId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const cached = JSON.parse(stored);
      const now = Date.now();
      const age = now - cached.fetchedAt;
      return age < cached.ttlMs;
    }
  } catch (error) {
    // Ignore
  }
  return false;
}

// Initialize
async function init() {
  try {
    console.log('[app.js] Initializing dashboard...');
    
    // Startup assertion - verify Firebase services and log readiness
    if (!auth || !db) {
      const errorMsg = 'Firebase services not initialized. Check firebase.js for errors.';
      console.error('[app.js]', errorMsg);
      throw new Error(errorMsg);
    }
    console.log("Firebase ready:", { hasDb: !!db, hasAuth: !!auth, projectId: app?.options?.projectId });
    
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
  const loadStartTime = performance.now();
  
  try {
    const agencyId = userStore.agencyId;
    if (!agencyId) {
      showError('No agency found');
      return;
    }
    
    // Check if we have cached data - if so, don't show loading states
    const hasCachedData = hasCachedSnapshot(agencyId);
    
    if (!hasCachedData) {
      // Only show loading states on first load (no cache)
      updateSnapshotCard('totalCustomers', '—', false);
      updateSnapshotCard('totalPremium', '—', false);
      updateSnapshotCard('renewalsCount', '—', false);
    }
    
    // Get dashboard snapshot (uses cache internally, returns cached immediately if available)
    const snapshot = await getDashboardSnapshot(agencyId, userStore.uid, userStore.role);
    
    // Render snapshot cards immediately
    updateSnapshotCard('totalCustomers', snapshot.totalCustomers, snapshot.totalCustomers === 0);
    updateSnapshotCard('totalPremium', formatCurrency(snapshot.totalPremium), snapshot.totalPremium === 0);
    updateSnapshotCard('renewalsCount', snapshot.renewals, snapshot.renewals === 0);
    
    // Render widgets
    renderRenewalsWidget(snapshot.renewalsSoon, agencyId);
    renderTasksWidget(snapshot.tasksDueSoon || []);
    renderCrosssellWidget(snapshot.crossSellOpportunities || [], agencyId);
    renderConversationsWidget(snapshot.recentConversations || [], agencyId);
    
    // Update "last updated" indicator
    updateLastUpdatedIndicator(agencyId);
    
    // Show/hide getting started banner
    const hasData = snapshot.totalCustomers > 0 || snapshot.totalPremium > 0;
    const gettingStartedBanner = document.getElementById('gettingStartedBanner');
    if (gettingStartedBanner) {
      gettingStartedBanner.classList.toggle('hidden', hasData);
    }
    
    const loadDuration = performance.now() - loadStartTime;
    console.log(`[app.js] Dashboard loaded in ${loadDuration.toFixed(2)}ms`);
    
  } catch (error) {
    console.error('Error loading dashboard:', error);
    showError('Failed to load dashboard data');
  }
}

// Update "last updated" indicator
function updateLastUpdatedIndicator(agencyId) {
  const cacheAge = getCacheAge(agencyId);
  const indicator = document.getElementById('dashboardLastUpdated');
  
  if (indicator && cacheAge !== null) {
    let text = '';
    if (cacheAge < 60) {
      text = `Updated ${cacheAge}s ago`;
    } else if (cacheAge < 3600) {
      const minutes = Math.floor(cacheAge / 60);
      text = `Updated ${minutes}m ago`;
    } else {
      const hours = Math.floor(cacheAge / 3600);
      text = `Updated ${hours}h ago`;
    }
    indicator.textContent = text;
    indicator.style.display = 'block';
  } else if (indicator) {
    indicator.style.display = 'none';
  }
}

// Calculate metrics
function calculatePolicyMetrics(policies) {
  let totalPremium = 0;
  
  policies.forEach(policy => {
    if (policy.status === 'active') {
      if (policy.premium && typeof policy.premium === 'number') {
        totalPremium += policy.premium;
      }
    }
  });
  
  return { totalPremium };
}

// Render widgets
function renderRenewalsWidget(renewals, agencyId) {
  const widget = document.getElementById('renewalsWidget');
  if (!widget) return;
  
  if (!renewals || renewals.length === 0) {
    widget.innerHTML = `
      <p class="empty-state">
        No renewals in the next 30 days.<br/>
        <small style="color: var(--muted);">Add policies to track renewals</small>
      </p>
    `;
    return;
  }
  
  widget.innerHTML = renewals.map(renewal => {
    const expirationDate = renewal.expirationDate || renewal.renewalDate || renewal.effectiveTo;
    const expDate = expirationDate.toDate ? expirationDate.toDate() : new Date(expirationDate);
    const customerName = renewal.customerName || 'Unknown';
    return `
      <div class="list-item" onclick="window.location.href='/customer.html?id=${renewal.customerId}'">
        <div class="list-item-main">
          <div class="list-item-title">${customerName}</div>
          <div class="list-item-subtitle">${renewal.policyType || renewal.carrier || 'Policy'} • Expires ${formatDate(expDate)}</div>
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

async function renderCrosssellWidget(customers, agencyId) {
  const widget = document.getElementById('crosssellWidget');
  if (!widget) return;
  
  // customers is already an array from dashboardService
  if (!customers || customers.length === 0) {
    widget.innerHTML = `
      <p class="empty-state">
        No cross-sell opportunities yet.<br/>
        <small style="color: var(--muted);">Customers with single policies will appear here</small>
      </p>
    `;
    return;
  }
  
  widget.innerHTML = customers.map(customer => {
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

async function renderConversationsWidget(conversations, agencyId) {
  const widget = document.getElementById('conversationsWidget');
  if (!widget) return;
  
  // conversations is already an array with customerName from dashboardService
  if (!conversations || conversations.length === 0) {
    widget.innerHTML = `
      <p class="empty-state">
        No conversations yet.<br/>
        <small style="color: var(--muted);">Enable Twilio to start receiving messages</small>
      </p>
    `;
    return;
  }
  
  widget.innerHTML = conversations.map(conv => {
    const lastMessageAt = conv.lastMessageAt ? (conv.lastMessageAt.toDate ? conv.lastMessageAt.toDate() : new Date(conv.lastMessageAt)) : null;
    const customerName = conv.customerName || 'Unknown Customer';
    return `
      <div class="list-item" onclick="window.location.href='/customer.html?id=${conv.customerId}#messages'">
        <div class="list-item-main">
          <div class="list-item-title">${customerName}</div>
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
