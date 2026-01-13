// customers-page.js - Customers list page

import { auth } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import { initRouter, navigateTo, getUrlParam } from './router.js';
import { listCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomer } from './customers.js';
import { formatPhone, formatDateTime } from './models.js';
import { toast, confirm, debounce } from './ui.js';

let customers = [];

async function init() {
  try {
    console.log('[customers-page.js] Initializing...');
    
    // Verify Firebase services
    if (!auth || !db) {
      throw new Error('Firebase services not initialized. Check firebase.js for errors.');
    }
    
    await initAuthGuard();
    initRouter();
    setupUI();
    await loadCustomers();
    
    // Check if we should open modal for new customer
    if (getUrlParam('action') === 'new') {
      openCustomerModal();
    }
    
    console.log('[customers-page.js] Initialized successfully');
  } catch (error) {
    console.error('[customers-page.js] Failed to initialize:', error);
    console.error('[customers-page.js] Error stack:', error.stack);
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
  
  // New customer button
  const btnNewCustomer = document.getElementById('btnNewCustomer');
  if (btnNewCustomer) {
    btnNewCustomer.addEventListener('click', openCustomerModal);
  }
  
  // Search
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      loadCustomers();
    }, 300));
  }
  
  // Filters
  const filterStatus = document.getElementById('filterStatus');
  const filterAssigned = document.getElementById('filterAssigned');
  if (filterStatus) {
    filterStatus.addEventListener('change', loadCustomers);
  }
  if (filterAssigned) {
    filterAssigned.addEventListener('change', loadCustomers);
  }
  
  // Modal
  const customerModal = document.getElementById('customerModal');
  const btnCancel = document.getElementById('btnCancel');
  const customerForm = document.getElementById('customerForm');
  
  if (btnCancel) {
    btnCancel.addEventListener('click', closeCustomerModal);
  }
  
  if (customerForm) {
    customerForm.addEventListener('submit', handleCustomerSubmit);
  }
  
  if (customerModal) {
    customerModal.addEventListener('click', (e) => {
      if (e.target === customerModal) {
        closeCustomerModal();
      }
    });
  }
}

async function loadCustomers() {
  try {
    const searchInput = document.getElementById('searchInput');
    const filterStatus = document.getElementById('filterStatus');
    const filterAssigned = document.getElementById('filterAssigned');
    
    const filters = {};
    if (searchInput?.value.trim()) {
      filters.search = searchInput.value.trim();
    }
    if (filterStatus?.value) {
      filters.status = filterStatus.value;
    }
    if (filterAssigned?.value) {
      filters.assignedToUid = filterAssigned.value;
    }
    
    customers = await listCustomers(filters);
    renderCustomers();
  } catch (error) {
    console.error('Error loading customers:', error);
    toast('Failed to load customers', 'error');
  }
}

function renderCustomers() {
  const customersList = document.getElementById('customersList');
  if (!customersList) return;
  
  if (customers.length === 0) {
    customersList.innerHTML = '<p class="empty-state">No customers found</p>';
    return;
  }
  
  customersList.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Phone</th>
          <th>Email</th>
          <th>Status</th>
          <th>Last Contact</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${customers.map(c => `
          <tr>
            <td>
              <a href="/customer.html?id=${c.id}" style="color: var(--accent); text-decoration: none; font-weight: 600;">
                ${c.fullName || 'Unknown'}
              </a>
            </td>
            <td>${c.phoneE164 ? formatPhone(c.phoneE164) : '—'}</td>
            <td>${c.email || '—'}</td>
            <td><span class="badge badge-info">${c.status || 'lead'}</span></td>
            <td>${c.lastContactAt ? formatDateTime(c.lastContactAt) : '—'}</td>
            <td>
              <button class="btn btn-text" onclick="editCustomer('${c.id}')" style="padding: 4px 8px;">Edit</button>
              <button class="btn btn-text btn-danger" onclick="deleteCustomerHandler('${c.id}')" style="padding: 4px 8px;">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

window.editCustomer = async function(customerId) {
  try {
    const customer = await getCustomer(customerId);
    if (!customer) {
      toast('Customer not found', 'error');
      return;
    }
    
    openCustomerModal(customer);
  } catch (error) {
    console.error('Error loading customer:', error);
    toast('Failed to load customer', 'error');
  }
};

window.deleteCustomerHandler = async function(customerId) {
  const confirmed = await confirm('Are you sure you want to delete this customer?');
  if (!confirmed) return;
  
  try {
    await deleteCustomer(customerId);
    await loadCustomers();
  } catch (error) {
    console.error('Error deleting customer:', error);
  }
};

function openCustomerModal(customer = null) {
  const modal = document.getElementById('customerModal');
  const modalTitle = document.getElementById('modalTitle');
  const form = document.getElementById('customerForm');
  const customerId = document.getElementById('customerId');
  
  if (modal) modal.classList.remove('hidden');
  if (modalTitle) modalTitle.textContent = customer ? 'Edit Customer' : 'New Customer';
  if (form) form.reset();
  
  if (customer) {
    if (customerId) customerId.value = customer.id;
    if (document.getElementById('firstName')) document.getElementById('firstName').value = customer.firstName || '';
    if (document.getElementById('lastName')) document.getElementById('lastName').value = customer.lastName || '';
    if (document.getElementById('phoneRaw')) document.getElementById('phoneRaw').value = customer.phoneRaw || '';
    if (document.getElementById('email')) document.getElementById('email').value = customer.email || '';
    if (document.getElementById('status')) document.getElementById('status').value = customer.status || 'lead';
    if (document.getElementById('source')) document.getElementById('source').value = customer.source || '';
  } else {
    if (customerId) customerId.value = '';
  }
}

function closeCustomerModal() {
  const modal = document.getElementById('customerModal');
  if (modal) modal.classList.add('hidden');
}

async function handleCustomerSubmit(e) {
  e.preventDefault();
  
  try {
    const customerId = document.getElementById('customerId').value;
    const formData = {
      firstName: document.getElementById('firstName').value.trim(),
      lastName: document.getElementById('lastName').value.trim(),
      phoneRaw: document.getElementById('phoneRaw').value.trim(),
      email: document.getElementById('email').value.trim(),
      status: document.getElementById('status').value,
      source: document.getElementById('source').value.trim(),
    };
    
    if (customerId) {
      await updateCustomer(customerId, formData);
    } else {
      await createCustomer(formData);
    }
    
    closeCustomerModal();
    await loadCustomers();
  } catch (error) {
    console.error('Error saving customer:', error);
  }
}

init();
