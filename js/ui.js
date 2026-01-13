// ui.js - Shared UI helpers

/**
 * Show toast notification
 */
export function toast(message, type = 'info', duration = 3000) {
  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${type}`;
  toastEl.textContent = message;
  
  // Styles
  Object.assign(toastEl.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '12px 20px',
    borderRadius: '12px',
    background: type === 'error' ? 'rgba(251, 113, 133, 0.15)' : 
                type === 'success' ? 'rgba(94, 234, 212, 0.15)' : 
                'rgba(255, 255, 255, 0.1)',
    border: `1px solid ${type === 'error' ? 'rgba(251, 113, 133, 0.3)' : 
                           type === 'success' ? 'rgba(94, 234, 212, 0.3)' : 
                           'rgba(255, 255, 255, 0.1)'}`,
    color: 'var(--text)',
    zIndex: '10000',
    boxShadow: '0 12px 30px rgba(0,0,0,.45)',
    animation: 'slideIn 0.3s ease-out',
    maxWidth: '400px',
    wordWrap: 'break-word',
  });
  
  document.body.appendChild(toastEl);
  
  setTimeout(() => {
    toastEl.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toastEl.remove(), 300);
  }, duration);
}

// Add CSS animations if not already present
if (!document.getElementById('toast-styles')) {
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Show modal dialog
 */
export function showModal(title, content, buttons = []) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '10000',
      padding: '20px',
    });
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    Object.assign(modal.style, {
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '24px',
      maxWidth: '500px',
      width: '100%',
      boxShadow: 'var(--shadow)',
    });
    
    const titleEl = document.createElement('h2');
    titleEl.textContent = title;
    titleEl.style.margin = '0 0 16px 0';
    modal.appendChild(titleEl);
    
    const contentEl = document.createElement('div');
    contentEl.innerHTML = content;
    contentEl.style.marginBottom = '20px';
    modal.appendChild(contentEl);
    
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.justifyContent = 'flex-end';
    
    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.textContent = btn.label;
      button.className = `btn ${btn.class || ''}`;
      button.addEventListener('click', () => {
        overlay.remove();
        resolve(btn.value);
      });
      buttonContainer.appendChild(button);
    });
    
    modal.appendChild(buttonContainer);
    overlay.appendChild(modal);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(null);
      }
    });
    
    document.body.appendChild(overlay);
  });
}

/**
 * Confirm dialog
 */
export function confirm(message) {
  return showModal('Confirm', message, [
    { label: 'Cancel', value: false },
    { label: 'Confirm', value: true, class: 'primary' }
  ]);
}

/**
 * Loading spinner
 */
export function showLoading(element) {
  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  spinner.innerHTML = '<div class="spinner"></div>';
  Object.assign(spinner.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
  });
  
  const spinnerInner = spinner.querySelector('.spinner');
  Object.assign(spinnerInner.style, {
    width: '40px',
    height: '40px',
    border: '3px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  });
  
  if (!document.getElementById('spinner-styles')) {
    const style = document.createElement('style');
    style.id = 'spinner-styles';
    style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
  
  if (element) {
    element.innerHTML = '';
    element.appendChild(spinner);
  }
  
  return spinner;
}

/**
 * Format currency
 */
export function formatCurrency(amount) {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
