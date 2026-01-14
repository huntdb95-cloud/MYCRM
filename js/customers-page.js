// customers-page.js - Customers list page
// PREVIOUS FAILURE: Line 18 referenced `db` without importing it, causing "db is not defined" error when adding customers

import { auth, db, app } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import { initRouter, navigateTo, getUrlParam } from './router.js';
import { listCustomers, createCustomer, updateCustomer, deleteCustomer, getCustomer, importCSVData } from './customers.js';
import { formatPhone, formatDateTime } from './models.js';
import { toast, confirm, debounce, showModal } from './ui.js';
import { parseCSV, createHeaderMapping, processCSVRow } from './csv-import.js';

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
    
    // Check if we should open modal for new customer or CSV import
    if (getUrlParam('action') === 'new') {
      openCustomerModal();
    } else if (getUrlParam('import') === '1') {
      openCSVImportModal();
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
  
  // Auth Debug Indicator
  updateAuthDebug();
  updateCustomerButtonState();
  
  // Update auth debug when auth state changes
  if (auth) {
    auth.onAuthStateChanged(() => {
      updateAuthDebug();
      updateCustomerButtonState();
    });
  }
}

// Auth Debug Functions
function updateAuthDebug() {
  const authDebug = document.getElementById('authDebug');
  const authStatus = document.getElementById('authStatus');
  const authUid = document.getElementById('authUid');
  const authRole = document.getElementById('authRole');
  const authAgency = document.getElementById('authAgency');
  
  if (!authDebug) return;
  
  const currentUser = auth?.currentUser;
  const isSignedIn = !!currentUser;
  
  // Show debug indicator (always show for debugging)
  authDebug.style.display = 'block';
  
  if (authStatus) {
    authStatus.textContent = isSignedIn ? 'YES' : 'NO';
    authStatus.style.color = isSignedIn ? 'var(--success)' : 'var(--danger)';
  }
  
  if (authUid) {
    authUid.textContent = currentUser?.uid || '—';
  }
  
  if (authRole) {
    authRole.textContent = userStore.role || '—';
  }
  
  if (authAgency) {
    authAgency.textContent = userStore.agencyId || '—';
  }
  
  // Log to console
  console.log('[customers-page.js] Auth Debug:', {
    signedIn: isSignedIn,
    uid: currentUser?.uid,
    email: currentUser?.email,
    role: userStore.role,
    agencyId: userStore.agencyId
  });
}

function updateCustomerButtonState() {
  const btnNewCustomer = document.getElementById('btnNewCustomer');
  const currentUser = auth?.currentUser;
  const isSignedIn = !!currentUser;
  const hasPermission = isSignedIn && (userStore.role === 'admin' || userStore.role === 'agent');
  
  if (btnNewCustomer) {
    if (!isSignedIn) {
      btnNewCustomer.disabled = true;
      btnNewCustomer.title = 'Please sign in to manage customers';
    } else if (!hasPermission) {
      btnNewCustomer.disabled = true;
      btnNewCustomer.title = 'Your account does not have access. Contact admin.';
    } else {
      btnNewCustomer.disabled = false;
      btnNewCustomer.title = '';
    }
  }
  
  // Show permission message if needed
  const pageContent = document.querySelector('.page-content');
  if (pageContent) {
    let permissionMsg = pageContent.querySelector('#permissionMessage');
    if (!isSignedIn) {
      if (!permissionMsg) {
        permissionMsg = document.createElement('div');
        permissionMsg.id = 'permissionMessage';
        permissionMsg.style.cssText = 'padding: 16px; margin-bottom: 20px; background: rgba(251, 113, 133, 0.15); border: 1px solid rgba(251, 113, 133, 0.3); border-radius: 8px; color: var(--danger);';
        pageContent.insertBefore(permissionMsg, pageContent.firstChild);
      }
      permissionMsg.textContent = 'Please sign in to manage customers.';
      permissionMsg.style.display = 'block';
    } else if (!hasPermission) {
      if (!permissionMsg) {
        permissionMsg = document.createElement('div');
        permissionMsg.id = 'permissionMessage';
        permissionMsg.style.cssText = 'padding: 16px; margin-bottom: 20px; background: rgba(251, 113, 133, 0.15); border: 1px solid rgba(251, 113, 133, 0.3); border-radius: 8px; color: var(--danger);';
        pageContent.insertBefore(permissionMsg, pageContent.firstChild);
      }
      permissionMsg.textContent = 'Your account does not have access. Contact admin.';
      permissionMsg.style.display = 'block';
    } else if (permissionMsg) {
      permissionMsg.style.display = 'none';
    }
  }
  
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
  
  // CSV Import
  setupCSVImport();
}

// CSV Import State
let csvImportData = null;
let csvProcessedRows = null;

function setupCSVImport() {
  const csvFileInput = document.getElementById('csvFileInput');
  const btnCancelImport = document.getElementById('btnCancelImport');
  const btnImportCSV = document.getElementById('btnImportCSV');
  const btnCloseImport = document.getElementById('btnCloseImport');
  const btnDownloadErrors = document.getElementById('btnDownloadErrors');
  const csvImportModal = document.getElementById('csvImportModal');
  
  if (csvFileInput) {
    csvFileInput.addEventListener('change', handleCSVFileSelect);
  }
  
  if (btnCancelImport) {
    btnCancelImport.addEventListener('click', closeCSVImportModal);
  }
  
  if (btnImportCSV) {
    btnImportCSV.addEventListener('click', handleCSVImport);
  }
  
  if (btnCloseImport) {
    btnCloseImport.addEventListener('click', () => {
      closeCSVImportModal();
      loadCustomers(); // Refresh customer list
    });
  }
  
  if (btnDownloadErrors) {
    btnDownloadErrors.addEventListener('click', downloadErrorReport);
  }
  
  if (csvImportModal) {
    csvImportModal.addEventListener('click', (e) => {
      if (e.target === csvImportModal) {
        closeCSVImportModal();
      }
    });
  }
}

function openCSVImportModal() {
  const modal = document.getElementById('csvImportModal');
  if (modal) {
    modal.classList.remove('hidden');
    // Clear previous state
    csvImportData = null;
    csvProcessedRows = null;
    document.getElementById('csvFileInput').value = '';
    document.getElementById('csvPreview').style.display = 'none';
    document.getElementById('csvImportProgress').style.display = 'none';
    document.getElementById('csvImportResults').style.display = 'none';
    document.getElementById('csvImportError').style.display = 'none';
  }
}

function closeCSVImportModal() {
  const modal = document.getElementById('csvImportModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function handleCSVFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const errorDiv = document.getElementById('csvImportError');
  const previewDiv = document.getElementById('csvPreview');
  const previewStats = document.getElementById('csvPreviewStats');
  const previewTable = document.getElementById('csvPreviewTable');
  
  errorDiv.style.display = 'none';
  previewDiv.style.display = 'none';
  
  try {
    const text = await file.text();
    const rows = parseCSV(text);
    
    if (rows.length < 2) {
      throw new Error('CSV must have at least a header row and one data row');
    }
    
    const headers = rows[0];
    const headerMapping = createHeaderMapping(headers);
    
    if (headerMapping.missingFields) {
      throw new Error(`Missing required fields: ${headerMapping.missingFields.join(', ')}`);
    }
    
    // Process all rows
    csvProcessedRows = [];
    for (let i = 1; i < rows.length; i++) {
      const processed = processCSVRow(rows[i], headerMapping.mapping, headers, i - 1);
      csvProcessedRows.push(processed);
    }
    
    // Show preview
    const validRows = csvProcessedRows.filter(r => r.valid);
    const invalidRows = csvProcessedRows.filter(r => !r.valid);
    
    previewStats.innerHTML = `
      <strong>Preview:</strong> ${csvProcessedRows.length} rows total
      <br/>
      <span style="color: var(--success);">✓ ${validRows.length} valid</span>
      ${invalidRows.length > 0 ? `<span style="color: var(--danger);">✗ ${invalidRows.length} invalid</span>` : ''}
    `;
    
    // Show preview table (first 20 rows)
    const previewRows = csvProcessedRows.slice(0, 20);
    previewTable.innerHTML = `
      <thead>
        <tr>
          <th>Row</th>
          <th>Status</th>
          <th>Insured Name</th>
          <th>Address</th>
          <th>City</th>
          <th>State</th>
          <th>Policy Type</th>
          <th>Insurance Company</th>
          <th>Premium</th>
          <th>Errors</th>
        </tr>
      </thead>
      <tbody>
        ${previewRows.map(row => {
          const data = row.data || {};
          const statusBadge = row.valid 
            ? '<span class="badge badge-success">Valid</span>'
            : '<span class="badge badge-danger">Invalid</span>';
          const errors = row.errors.length > 0 
            ? `<div style="color: var(--danger); font-size: 12px;">${row.errors.join(', ')}</div>`
            : '';
          
          return `
            <tr>
              <td>${row.rowIndex}</td>
              <td>${statusBadge}</td>
              <td>${data.insuredName || '—'}</td>
              <td>${data.address || '—'}</td>
              <td>${data.city || '—'}</td>
              <td>${data.state || '—'}</td>
              <td>${data.policyTypeNormalized || data.rawPolicyType || '—'}</td>
              <td>${data.insuranceCompany || '—'}</td>
              <td>${data.premium != null ? '$' + data.premium.toLocaleString() : '—'}</td>
              <td>${errors}</td>
            </tr>
          `;
        }).join('')}
        ${csvProcessedRows.length > 20 ? `<tr><td colspan="10" style="text-align: center; color: var(--muted);">... and ${csvProcessedRows.length - 20} more rows</td></tr>` : ''}
      </tbody>
    `;
    
    previewDiv.style.display = 'block';
    csvImportData = { headers, headerMapping: headerMapping.mapping, rows };
    
  } catch (error) {
    console.error('Error processing CSV:', error);
    errorDiv.textContent = error.message || 'Failed to process CSV file';
    errorDiv.style.display = 'block';
  }
}

async function handleCSVImport() {
  if (!csvProcessedRows || csvProcessedRows.length === 0) {
    toast('No data to import', 'error');
    return;
  }
  
  const validRows = csvProcessedRows.filter(r => r.valid && r.data);
  if (validRows.length === 0) {
    toast('No valid rows to import', 'error');
    return;
  }
  
  const btnImportCSV = document.getElementById('btnImportCSV');
  const previewDiv = document.getElementById('csvPreview');
  const progressDiv = document.getElementById('csvImportProgress');
  const resultsDiv = document.getElementById('csvImportResults');
  const progressText = document.getElementById('csvImportProgressText');
  
  btnImportCSV.disabled = true;
  previewDiv.style.display = 'none';
  progressDiv.style.display = 'block';
  resultsDiv.style.display = 'none';
  
  try {
    let currentBatch = 0;
    let totalBatches = 0;
    
    const results = await importCSVData(csvProcessedRows, (batchNum, total) => {
      currentBatch = batchNum;
      totalBatches = total;
      progressText.textContent = `Importing batch ${batchNum} of ${total}...`;
    });
    
    // Show results
    progressDiv.style.display = 'none';
    resultsDiv.style.display = 'block';
    
    const resultsContent = document.getElementById('csvImportResultsContent');
    resultsContent.innerHTML = `
      <div style="margin-bottom: 16px;">
        <strong>Import Complete!</strong>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
        <div style="padding: 12px; background: rgba(94, 234, 212, 0.1); border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: var(--success);">${results.imported}</div>
          <div style="font-size: 12px; color: var(--muted);">New Customers</div>
        </div>
        <div style="padding: 12px; background: rgba(99, 102, 241, 0.1); border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: var(--accent);">${results.updated}</div>
          <div style="font-size: 12px; color: var(--muted);">Updated Customers</div>
        </div>
        <div style="padding: 12px; background: rgba(251, 113, 133, 0.1); border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: var(--danger);">${results.skipped}</div>
          <div style="font-size: 12px; color: var(--muted);">Skipped Rows</div>
        </div>
      </div>
      ${results.errors.length > 0 ? `
        <div style="margin-top: 16px; padding: 12px; background: rgba(251, 113, 133, 0.1); border-radius: 8px;">
          <strong style="color: var(--danger);">Errors:</strong>
          <div style="margin-top: 8px; max-height: 200px; overflow-y: auto;">
            ${results.errors.slice(0, 50).map(err => 
              `<div style="font-size: 12px; margin-bottom: 4px;">Row ${err.row}: ${err.errors.join(', ')}</div>`
            ).join('')}
            ${results.errors.length > 50 ? `<div style="font-size: 12px; color: var(--muted);">... and ${results.errors.length - 50} more errors</div>` : ''}
          </div>
        </div>
      ` : ''}
    `;
    
    // Store results for error download
    window.csvImportResults = results;
    
    toast(`Import complete: ${results.imported} imported, ${results.updated} updated, ${results.skipped} skipped`, 'success');
    
  } catch (error) {
    console.error('Error importing CSV:', error);
    toast(error.message || 'Failed to import CSV', 'error');
    progressDiv.style.display = 'none';
    previewDiv.style.display = 'block';
  } finally {
    btnImportCSV.disabled = false;
  }
}

function downloadErrorReport() {
  if (!window.csvImportResults || !window.csvImportResults.errors || window.csvImportResults.errors.length === 0) {
    toast('No errors to download', 'info');
    return;
  }
  
  // Create CSV content
  const headers = ['Row', 'Errors'];
  const rows = window.csvImportResults.errors.map(err => [
    err.row,
    err.errors.join('; ')
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  
  // Download
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `csv-import-errors-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  
  // AUTH CHECK - Verify user is signed in before proceeding
  const currentUser = auth?.currentUser;
  console.log('[customers-page.js] Auth check:', {
    hasAuth: !!auth,
    currentUser: currentUser ? { uid: currentUser.uid, email: currentUser.email } : null,
    userStore: { uid: userStore.uid, role: userStore.role, agencyId: userStore.agencyId }
  });
  
  if (!currentUser) {
    const errorMsg = 'You must be signed in to add customers.';
    console.error('[customers-page.js]', errorMsg);
    if (errorDiv) {
      errorDiv.textContent = errorMsg;
      errorDiv.style.display = 'block';
    }
    toast(errorMsg, 'error');
    return;
  }
  
  // Check if user has required role
  const hasPermission = userStore.role === 'admin' || userStore.role === 'agent';
  if (!hasPermission) {
    const errorMsg = 'Your account does not have permission to create customers. Contact admin.';
    console.error('[customers-page.js]', errorMsg, { role: userStore.role });
    if (errorDiv) {
      errorDiv.textContent = errorMsg;
      errorDiv.style.display = 'block';
    }
    toast(errorMsg, 'error');
    return;
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
