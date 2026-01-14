// customers-page.js - Customers list page
// PREVIOUS FAILURE: Line 18 referenced `db` without importing it, causing "db is not defined" error when adding customers

import { auth, db, app } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import { initRouter, navigateTo, getUrlParam } from './router.js';
import { listCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomer } from './customers.js';
import { formatPhone, formatDateTime } from './models.js';
import { toast, confirm, debounce, showModal } from './ui.js';

let customers = [];

async function init() {
  try {
    console.log('[customers-page.js] Initializing...');
    
    // Startup assertion - verify Firebase services and log readiness
    if (!auth || !db) {
      const errorMsg = 'Firebase services not initialized. Check firebase.js for errors.';
      console.error('[customers-page.js]', errorMsg);
      throw new Error(errorMsg);
    }
    console.log("Firebase ready:", { hasDb: !!db, hasAuth: !!auth, projectId: app?.options?.projectId });
    
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
              <button class="btn btn-text btn-danger" onclick="deleteCustomerHandler('${c.id}', '${(c.fullName || 'Unknown').replace(/'/g, "\\'")}')" style="padding: 4px 8px;">Delete</button>
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

window.deleteCustomerHandler = async function(customerId, customerName) {
  try {
    // Show confirmation modal with customer name
    const confirmed = await showModal(
      'Delete Customer',
      `<p>Are you sure you want to delete <strong>${customerName}</strong>?</p><p style="color: var(--danger); margin-top: 8px;">This action cannot be undone.</p>`,
      [
        { label: 'Cancel', value: false },
        { label: 'Delete', value: true, class: 'btn-danger' }
      ]
    );
    
    if (!confirmed) return;
    
    console.log('[customers-page.js] Deleting customer:', customerId);
    await deleteCustomer(customerId);
    await loadCustomers();
    toast(`Customer "${customerName}" deleted successfully`, 'success');
  } catch (error) {
    console.error('Error deleting customer:', error);
    const errorMsg = error?.message || 'Failed to delete customer';
    toast(errorMsg, 'error');
  }
};

function openCustomerModal(customer = null) {
  const modal = document.getElementById('customerModal');
  const modalTitle = document.getElementById('modalTitle');
  const form = document.getElementById('customerForm');
  const customerIdInput = document.getElementById('customerId');
  const errorDiv = document.getElementById('customerFormError');
  const submitBtn = document.getElementById('btnSubmit');
  
  // Always reset form first to clear all fields including hidden inputs
  if (form) form.reset();
  
  // Clear error display
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  }
  
  // Reset submit button state
  if (submitBtn) {
    submitBtn.disabled = false;
  }
  
  // Determine mode: EDIT if customer object provided with valid id, otherwise CREATE
  const isEditMode = customer && customer.id;
  
  if (isEditMode) {
    // EDIT MODE: Populate fields with customer data
    if (customerIdInput) customerIdInput.value = customer.id;
    if (modalTitle) modalTitle.textContent = 'Edit Customer';
    if (submitBtn) submitBtn.textContent = 'Save Changes';
    
    // Populate all fields
    const firstNameEl = document.getElementById('firstName');
    const lastNameEl = document.getElementById('lastName');
    const phoneRawEl = document.getElementById('phoneRaw');
    const emailEl = document.getElementById('email');
    const statusEl = document.getElementById('status');
    const sourceEl = document.getElementById('source');
    const notesEl = document.getElementById('notes');
    
    if (firstNameEl) firstNameEl.value = customer.firstName || '';
    if (lastNameEl) lastNameEl.value = customer.lastName || '';
    if (phoneRawEl) phoneRawEl.value = customer.phoneRaw || '';
    if (emailEl) emailEl.value = customer.email || '';
    if (statusEl) statusEl.value = customer.status || 'lead';
    if (sourceEl) sourceEl.value = customer.source || '';
    if (notesEl) notesEl.value = customer.notes || '';
  } else {
    // CREATE MODE: Clear all fields and set to create mode
    if (customerIdInput) customerIdInput.value = '';
    if (modalTitle) modalTitle.textContent = 'New Customer';
    if (submitBtn) submitBtn.textContent = 'Create Customer';
  }
  
  // Show modal
  if (modal) modal.classList.remove('hidden');
  
  console.log('[customers-page.js] Customer modal opened, mode:', isEditMode ? 'EDIT' : 'CREATE', isEditMode ? `(id: ${customer.id})` : '');
}

function closeCustomerModal() {
  const modal = document.getElementById('customerModal');
  const form = document.getElementById('customerForm');
  const customerIdInput = document.getElementById('customerId');
  const errorDiv = document.getElementById('customerFormError');
  
  if (modal) modal.classList.add('hidden');
  
  // Reset form and clear state to prevent sticky edit mode
  if (form) form.reset();
  if (customerIdInput) customerIdInput.value = '';
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  }
  
  console.log('[customers-page.js] Customer modal closed, state cleared');
}

async function handleCustomerSubmit(e) {
  e.preventDefault();
  
  const submitBtn = document.getElementById('btnSubmit');
  const errorDiv = document.getElementById('customerFormError');
  const customerIdInput = document.getElementById('customerId');
  const customerId = customerIdInput ? customerIdInput.value.trim() : '';
  
  // Clear previous errors
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  }
  
  // Disable submit button and show loading state
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }
  
  try {
    // Gather form data
    const formData = {
      firstName: document.getElementById('firstName').value.trim(),
      lastName: document.getElementById('lastName').value.trim(),
      phoneRaw: document.getElementById('phoneRaw').value.trim(),
      email: document.getElementById('email').value.trim(),
      status: document.getElementById('status').value,
      source: document.getElementById('source').value.trim(),
      notes: document.getElementById('notes').value.trim(),
    };
    
    // Determine mode: EDIT if customerId exists and is not empty, otherwise CREATE
    const isEditMode = customerId && customerId.length > 0;
    
    console.log('[customers-page.js] Submitting customer form, mode:', isEditMode ? 'EDIT' : 'CREATE', isEditMode ? `(id: ${customerId})` : '');
    console.log('[customers-page.js] Form data:', formData);
    
    if (isEditMode) {
      // EDIT MODE: Update existing customer
      console.log('[customers-page.js] Updating customer:', customerId);
      await updateCustomer(customerId, formData);
      toast('Customer updated successfully', 'success');
    } else {
      // CREATE MODE: Create new customer
      console.log('[customers-page.js] Creating new customer');
      const newCustomerId = await createCustomer(formData);
      console.log('[customers-page.js] New customer created with ID:', newCustomerId);
      toast('Customer created successfully', 'success');
    }
    
    // Close modal and refresh list
    closeCustomerModal();
    await loadCustomers();
  } catch (error) {
    console.error('[customers-page.js] Error saving customer:', error);
    console.error('[customers-page.js] Error stack:', error.stack);
    
    const errorMsg = error?.message || 'Failed to save customer. Please try again.';
    
    // Show error in form
    if (errorDiv) {
      errorDiv.textContent = errorMsg;
      errorDiv.style.display = 'block';
    }
    
    // Also show toast
    toast(errorMsg, 'error');
  } finally {
    // Re-enable submit button (text will be reset by closeCustomerModal if successful)
    if (submitBtn) {
      submitBtn.disabled = false;
      // Don't reset text here - it will be set correctly when modal opens next time
    }
  }
}

init();
