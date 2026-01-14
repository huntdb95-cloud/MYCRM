// upcoming-renewals-page.js - Upcoming Renewals page

import { auth, db } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import { initRouter, navigateTo } from './router.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

let allRenewals = [];
let policyTypes = new Set();

async function init() {
  try {
    console.log('[upcoming-renewals-page.js] Initializing...');
    
    if (!auth || !db) {
      throw new Error('Firebase services not initialized. Check firebase.js for errors.');
    }
    
    await initAuthGuard();
    initRouter();
    setupUI();
    await loadRenewals();
    
    console.log('[upcoming-renewals-page.js] Initialized successfully');
  } catch (error) {
    console.error('[upcoming-renewals-page.js] Failed to initialize:', error);
    const errorMessage = error?.message || String(error);
    showError(`Failed to initialize: ${errorMessage}`);
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
        console.error('Logout error:', error);
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
  
  // Filter handlers
  const filterPolicyType = document.getElementById('filterPolicyType');
  const filterDays = document.getElementById('filterDays');
  
  if (filterPolicyType) {
    filterPolicyType.addEventListener('change', () => {
      renderRenewals();
    });
  }
  
  if (filterDays) {
    filterDays.addEventListener('change', () => {
      loadRenewals();
    });
  }
}

async function loadRenewals() {
  try {
    const agencyId = userStore.agencyId;
    if (!agencyId) {
      showError('No agency found');
      return;
    }
    
    const contentEl = document.getElementById('renewalsContent');
    if (!contentEl) return;
    
    const filterDaysEl = document.getElementById('filterDays');
    const days = filterDaysEl ? parseInt(filterDaysEl.value) || 30 : 30;
    
    contentEl.innerHTML = '<div class="loading-spinner"></div>';
    
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + days);
    
    // Get all customers
    const customersRef = collection(db, 'agencies', agencyId, 'customers');
    const customersSnapshot = await getDocs(customersRef);
    
    allRenewals = [];
    policyTypes.clear();
    
    // Fetch all policies
    for (const customerDoc of customersSnapshot.docs) {
      const customer = customerDoc.data();
      const customerId = customerDoc.id;
      const customerName = customer.fullName || customer.insuredName || 'Unknown';
      
      const policiesRef = collection(db, 'agencies', agencyId, 'customers', customerId, 'policies');
      const policiesSnapshot = await getDocs(policiesRef);
      
      policiesSnapshot.forEach(policyDoc => {
        const policy = policyDoc.data();
        
        // Check for expirationDate, renewalDate, or effectiveTo
        const expirationDate = policy.expirationDate || policy.renewalDate || policy.effectiveTo;
        
        if (policy.status === 'active' && expirationDate) {
          const expDate = expirationDate.toDate ? expirationDate.toDate() : new Date(expirationDate);
          
          // Check if within date range
          if (expDate >= now && expDate <= futureDate) {
            const policyType = policy.policyType || policy.rawPolicyType || policy.policyTypeNormalized || 'Unknown';
            policyTypes.add(policyType);
            
            allRenewals.push({
              id: policyDoc.id,
              customerId,
              customerName,
              policyType,
              carrier: policy.insuranceCompany || policy.carrier || '—',
              policyNumber: policy.policyNumber || '—',
              renewalDate: expDate,
              premium: policy.premium || 0
            });
          }
        }
      });
    }
    
    // Sort by renewal date (soonest first)
    allRenewals.sort((a, b) => a.renewalDate - b.renewalDate);
    
    // Populate policy type filter
    const filterPolicyTypeEl = document.getElementById('filterPolicyType');
    if (filterPolicyTypeEl) {
      const currentValue = filterPolicyTypeEl.value;
      const sortedTypes = Array.from(policyTypes).sort();
      
      filterPolicyTypeEl.innerHTML = '<option value="">All Types</option>' +
        sortedTypes.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('');
      
      // Restore previous selection if still valid
      if (currentValue && sortedTypes.includes(currentValue)) {
        filterPolicyTypeEl.value = currentValue;
      }
    }
    
    renderRenewals();
    
  } catch (error) {
    console.error('Error loading renewals:', error);
    const contentEl = document.getElementById('renewalsContent');
    if (contentEl) {
      contentEl.innerHTML = `
        <p class="empty-state" style="color: var(--danger);">
          Failed to load renewals data.<br/>
          <small>${escapeHtml(error.message || 'Unknown error')}</small>
        </p>
      `;
    }
  }
}

function renderRenewals() {
  const contentEl = document.getElementById('renewalsContent');
  if (!contentEl) return;
  
  const filterPolicyTypeEl = document.getElementById('filterPolicyType');
  const selectedType = filterPolicyTypeEl ? filterPolicyTypeEl.value : '';
  
  // Filter renewals
  let filteredRenewals = allRenewals;
  if (selectedType) {
    filteredRenewals = allRenewals.filter(r => r.policyType === selectedType);
  }
  
  if (filteredRenewals.length === 0) {
    contentEl.innerHTML = `
      <p class="empty-state">
        No renewals found in the selected time range.<br/>
        <small style="color: var(--muted);">Try adjusting the days range or policy type filter</small>
      </p>
    `;
    return;
  }
  
  const tableHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Customer Name</th>
          <th>Policy Type</th>
          <th>Carrier</th>
          <th>Policy Number</th>
          <th>Renewal Date</th>
          <th style="text-align: right;">Premium</th>
        </tr>
      </thead>
      <tbody>
        ${filteredRenewals.map(renewal => `
          <tr style="cursor: pointer;" onclick="window.location.href='/customer.html?id=${renewal.customerId}'">
            <td><strong>${escapeHtml(renewal.customerName)}</strong></td>
            <td>${escapeHtml(renewal.policyType)}</td>
            <td>${escapeHtml(renewal.carrier)}</td>
            <td>${escapeHtml(renewal.policyNumber)}</td>
            <td>${formatDate(renewal.renewalDate)}</td>
            <td style="text-align: right;">${formatCurrency(renewal.premium)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  contentEl.innerHTML = tableHTML;
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  const contentEl = document.getElementById('renewalsContent');
  if (contentEl) {
    contentEl.innerHTML = `
      <div class="card" style="text-align: center; padding: 40px;">
        <h3 style="color: var(--danger); margin-bottom: 16px;">⚠️ Error</h3>
        <p style="margin-bottom: 20px; color: var(--text);">${escapeHtml(message)}</p>
        <button class="btn btn-primary" onclick="window.location.reload()">Retry</button>
      </div>
    `;
  }
}

// Initialize on load
init();
