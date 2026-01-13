// app.js - Main app shell logic

import { auth } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import { initRouter, navigateTo } from './router.js';
import { listCustomers } from './customers.js';
import { listConversations } from './messages.js';
import { listTasks } from './tasks.js';
import { formatDateTime, formatPhone } from './models.js';
import { toast } from './ui.js';

// Initialize
async function init() {
  try {
    // Wait for auth guard
    await initAuthGuard();
    
    // Initialize router
    initRouter();
    
    // Setup UI
    setupUI();
    
    // Load dashboard data
    loadDashboard();
  } catch (error) {
    console.error('Failed to initialize app:', error);
    toast('Failed to initialize app', 'error');
  }
}

function setupUI() {
  // User info
  const userNameEl = document.getElementById('userName');
  const userRoleEl = document.getElementById('userRole');
  
  if (userNameEl) {
    userNameEl.textContent = userStore.displayName || userStore.email || 'User';
  }
  if (userRoleEl) {
    userRoleEl.textContent = userStore.role || '—';
  }
  
  // Logout button
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
      navigateTo('/customers.html?action=new');
    });
  }
  
  // New Task button
  const btnNewTask = document.getElementById('btnNewTask');
  if (btnNewTask) {
    btnNewTask.addEventListener('click', () => {
      navigateTo('/tasks.html?action=new');
    });
  }
  
  // Global search
  const globalSearch = document.getElementById('globalSearch');
  if (globalSearch) {
    globalSearch.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const query = globalSearch.value.trim();
        if (query) {
          navigateTo(`/customers.html?search=${encodeURIComponent(query)}`);
        }
      }
    });
  }
}

async function loadDashboard() {
  try {
    // Load recent customers
    const customers = await listCustomers({ limit: 5 });
    const recentCustomersEl = document.getElementById('recentCustomers');
    if (recentCustomersEl) {
      if (customers.length === 0) {
        recentCustomersEl.innerHTML = '<p class="empty-state">No customers yet</p>';
      } else {
        recentCustomersEl.innerHTML = customers.map(c => `
          <div class="list-item" onclick="window.location.href='/customer.html?id=${c.id}'">
            <div class="list-item-main">
              <div class="list-item-title">${c.fullName || 'Unknown'}</div>
              <div class="list-item-subtitle">${c.phoneE164 ? formatPhone(c.phoneE164) : 'No phone'}</div>
            </div>
            <div class="list-item-meta">${c.status || 'lead'}</div>
          </div>
        `).join('');
      }
    }
    
    // Load recent conversations
    const conversations = await listConversations(5);
    const recentMessagesEl = document.getElementById('recentMessages');
    if (recentMessagesEl) {
      if (conversations.length === 0) {
        recentMessagesEl.innerHTML = '<p class="empty-state">No messages yet</p>';
      } else {
        recentMessagesEl.innerHTML = conversations.map(c => `
          <div class="list-item" onclick="window.location.href='/customer.html?id=${c.customerId}#messages'">
            <div class="list-item-main">
              <div class="list-item-title">${c.lastMessageSnippet || 'No messages'}</div>
              <div class="list-item-subtitle">${c.lastMessageAt ? formatDateTime(c.lastMessageAt) : '—'}</div>
            </div>
          </div>
        `).join('');
      }
    }
    
    // Load upcoming tasks
    const tasks = await listTasks({ status: 'open' });
    const upcomingTasksEl = document.getElementById('upcomingTasks');
    if (upcomingTasksEl) {
      const upcoming = tasks.filter(t => {
        if (!t.dueAt) return false;
        const due = t.dueAt.toDate ? t.dueAt.toDate() : new Date(t.dueAt);
        return due >= new Date();
      }).slice(0, 5);
      
      if (upcoming.length === 0) {
        upcomingTasksEl.innerHTML = '<p class="empty-state">No upcoming tasks</p>';
      } else {
        upcomingTasksEl.innerHTML = upcoming.map(t => `
          <div class="list-item" onclick="window.location.href='/tasks.html'">
            <div class="list-item-main">
              <div class="list-item-title">${t.title}</div>
              <div class="list-item-subtitle">${t.dueAt ? formatDateTime(t.dueAt) : 'No due date'}</div>
            </div>
            <div class="list-item-meta priority-${t.priority}">${t.priority}</div>
          </div>
        `).join('');
      }
    }
  } catch (error) {
    console.error('Error loading dashboard:', error);
    toast('Failed to load dashboard data', 'error');
  }
}

// Initialize on load
init();
