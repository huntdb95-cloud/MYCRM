// inbox-page.js - Inbox page

import { auth } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import { initRouter, navigateTo } from './router.js';
import { listConversations } from './messages.js';
import { getCustomer } from './customers.js';
import { formatDateTime } from './models.js';
import { toast, debounce } from './ui.js';

async function init() {
  try {
    await initAuthGuard();
    initRouter();
    setupUI();
    await loadConversations();
  } catch (error) {
    console.error('Failed to initialize:', error);
    toast('Failed to initialize page', 'error');
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
  
  // Search
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      loadConversations();
    }, 300));
  }
}

async function loadConversations() {
  try {
    const conversations = await listConversations(100);
    
    // Load customer info for each conversation
    const conversationsWithCustomers = await Promise.all(
      conversations.map(async (conv) => {
        try {
          const customer = await getCustomer(conv.customerId);
          return { ...conv, customer };
        } catch (error) {
          return { ...conv, customer: null };
        }
      })
    );
    
    renderConversations(conversationsWithCustomers);
  } catch (error) {
    console.error('Error loading conversations:', error);
    toast('Failed to load conversations', 'error');
  }
}

function renderConversations(conversations) {
  const conversationsList = document.getElementById('conversationsList');
  if (!conversationsList) return;
  
  const searchInput = document.getElementById('searchInput');
  const searchTerm = searchInput?.value.toLowerCase() || '';
  
  const filtered = conversations.filter(conv => {
    if (!searchTerm) return true;
    const customerName = conv.customer?.fullName || '';
    const snippet = conv.lastMessageSnippet || '';
    return customerName.toLowerCase().includes(searchTerm) || 
           snippet.toLowerCase().includes(searchTerm);
  });
  
  if (filtered.length === 0) {
    conversationsList.innerHTML = '<p class="empty-state">No conversations found</p>';
    return;
  }
  
  conversationsList.innerHTML = filtered.map(conv => {
    const customerName = conv.customer?.fullName || 'Unknown Customer';
    const unreadCount = conv.unreadCountByUid?.[userStore.uid] || 0;
    
    return `
      <div class="list-item" onclick="window.location.href='/customer.html?id=${conv.customerId}#messages'">
        <div class="list-item-main">
          <div class="list-item-title">
            ${customerName}
            ${unreadCount > 0 ? `<span class="badge badge-danger" style="margin-left: 8px;">${unreadCount}</span>` : ''}
          </div>
          <div class="list-item-subtitle">${conv.lastMessageSnippet || 'No messages'}</div>
        </div>
        <div class="list-item-meta">${conv.lastMessageAt ? formatDateTime(conv.lastMessageAt) : '—'}</div>
      </div>
    `;
  }).join('');
}

init();
