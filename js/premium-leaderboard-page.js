// premium-leaderboard-page.js - Premium Leaderboard page

import { auth, db } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import { initRouter, navigateTo } from './router.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

async function init() {
  try {
    console.log('[premium-leaderboard-page.js] Initializing...');
    
    if (!auth || !db) {
      throw new Error('Firebase services not initialized. Check firebase.js for errors.');
    }
    
    await initAuthGuard();
    initRouter();
    setupUI();
    await loadLeaderboard();
    
    console.log('[premium-leaderboard-page.js] Initialized successfully');
  } catch (error) {
    console.error('[premium-leaderboard-page.js] Failed to initialize:', error);
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
}

async function loadLeaderboard() {
  try {
    const agencyId = userStore.agencyId;
    if (!agencyId) {
      showError('No agency found');
      return;
    }
    
    const contentEl = document.getElementById('leaderboardContent');
    if (!contentEl) return;
    
    contentEl.innerHTML = '<div class="loading-spinner"></div>';
    
    // Get all customers
    const customersRef = collection(db, 'agencies', agencyId, 'customers');
    const customersSnapshot = await getDocs(customersRef);
    
    // For each customer, calculate total premium
    const customerData = [];
    const promises = [];
    
    customersSnapshot.forEach(customerDoc => {
      const customer = customerDoc.data();
      const customerId = customerDoc.id;
      
      // Check if customer has aggregate fields
      if (customer.totalPremium !== undefined) {
        customerData.push({
          id: customerId,
          name: customer.fullName || customer.insuredName || 'Unknown',
          totalPremium: customer.totalPremium || 0,
          policyCount: customer.policyCount || 0,
          nextRenewalDate: customer.nextRenewalDate || null
        });
      } else {
        // Need to fetch policies
        const promise = (async () => {
          const policiesRef = collection(db, 'agencies', agencyId, 'customers', customerId, 'policies');
          const policiesSnapshot = await getDocs(policiesRef);
          
          let totalPremium = 0;
          let policyCount = 0;
          let nextRenewalDate = null;
          
          policiesSnapshot.forEach(policyDoc => {
            const policy = policyDoc.data();
            if (policy.status === 'active' && policy.premium && typeof policy.premium === 'number') {
              totalPremium += policy.premium;
              policyCount++;
              
              // Find next renewal date
              const expirationDate = policy.expirationDate || policy.renewalDate || policy.effectiveTo;
              if (expirationDate) {
                const expDate = expirationDate.toDate ? expirationDate.toDate() : new Date(expirationDate);
                if (!nextRenewalDate || expDate < nextRenewalDate) {
                  nextRenewalDate = expDate;
                }
              }
            }
          });
          
          customerData.push({
            id: customerId,
            name: customer.fullName || customer.insuredName || 'Unknown',
            totalPremium,
            policyCount,
            nextRenewalDate
          });
        })();
        
        promises.push(promise);
      }
    });
    
    // Wait for all policy queries to complete
    await Promise.all(promises);
    
    // Sort by total premium descending
    customerData.sort((a, b) => b.totalPremium - a.totalPremium);
    
    // Render table
    if (customerData.length === 0) {
      contentEl.innerHTML = `
        <p class="empty-state">
          No customers with premium data found.<br/>
          <small style="color: var(--muted);">Add policies to customers to see premium data</small>
        </p>
      `;
      return;
    }
    
    const tableHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Customer Name</th>
            <th style="text-align: right;">Total Premium</th>
            <th style="text-align: center;">Policy Count</th>
            <th>Next Renewal Date</th>
          </tr>
        </thead>
        <tbody>
          ${customerData.map(customer => `
            <tr style="cursor: pointer;" onclick="window.location.href='/customer.html?id=${customer.id}'">
              <td><strong>${escapeHtml(customer.name)}</strong></td>
              <td style="text-align: right;"><strong>${formatCurrency(customer.totalPremium)}</strong></td>
              <td style="text-align: center;">${customer.policyCount}</td>
              <td>${customer.nextRenewalDate ? formatDate(customer.nextRenewalDate) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    
    contentEl.innerHTML = tableHTML;
    
  } catch (error) {
    console.error('Error loading leaderboard:', error);
    const contentEl = document.getElementById('leaderboardContent');
    if (contentEl) {
      contentEl.innerHTML = `
        <p class="empty-state" style="color: var(--danger);">
          Failed to load leaderboard data.<br/>
          <small>${escapeHtml(error.message || 'Unknown error')}</small>
        </p>
      `;
    }
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  const contentEl = document.getElementById('leaderboardContent');
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
