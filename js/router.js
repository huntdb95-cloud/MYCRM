// router.js - Lightweight navigation and page bootstraps

/**
 * Initialize router
 */
export function initRouter() {
  // Highlight active nav link
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('nav a, .nav-link');
  
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href && (currentPath.endsWith(href) || currentPath.includes(href))) {
      link.classList.add('active');
    }
  });
  
  // Handle navigation clicks
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-nav]');
    if (link) {
      e.preventDefault();
      const href = link.getAttribute('href');
      if (href) {
        window.location.href = href;
      }
    }
  });
}

/**
 * Get URL parameter
 */
export function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

/**
 * Navigate to page
 */
export function navigateTo(path) {
  window.location.href = path;
}
