// cache.js - Dashboard metrics cache with sessionStorage persistence

const DEFAULT_TTL_MS = 60 * 1000; // 60 seconds default

// In-memory cache
const memoryCache = {};

/**
 * Get cache key for dashboard metrics
 */
function getCacheKey(agencyId) {
  return `dashboardMetrics:${agencyId}`;
}

/**
 * Check if cached data is still fresh
 */
export function isFresh(fetchedAt, ttlMs = DEFAULT_TTL_MS) {
  if (!fetchedAt) return false;
  const now = Date.now();
  const age = now - fetchedAt;
  return age < ttlMs;
}

/**
 * Get cached metrics from memory or sessionStorage
 */
export function getCachedMetrics(agencyId) {
  const key = getCacheKey(agencyId);
  
  // Try memory cache first
  if (memoryCache[key]) {
    const cached = memoryCache[key];
    if (isFresh(cached.fetchedAt, cached.ttlMs)) {
      return cached.data;
    }
    // Expired, remove from memory
    delete memoryCache[key];
  }
  
  // Try sessionStorage
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) {
      const cached = JSON.parse(stored);
      if (isFresh(cached.fetchedAt, cached.ttlMs)) {
        // Restore to memory cache
        memoryCache[key] = cached;
        return cached.data;
      }
      // Expired, remove from sessionStorage
      sessionStorage.removeItem(key);
    }
  } catch (error) {
    console.warn('[cache.js] Failed to read from sessionStorage:', error);
  }
  
  return null;
}

/**
 * Set cached metrics in memory and sessionStorage
 */
export function setCachedMetrics(agencyId, metrics, ttlMs = DEFAULT_TTL_MS) {
  const key = getCacheKey(agencyId);
  const cached = {
    data: metrics,
    fetchedAt: Date.now(),
    ttlMs
  };
  
  // Store in memory
  memoryCache[key] = cached;
  
  // Store in sessionStorage
  try {
    sessionStorage.setItem(key, JSON.stringify(cached));
  } catch (error) {
    console.warn('[cache.js] Failed to write to sessionStorage:', error);
    // Continue without sessionStorage - memory cache still works
  }
}

/**
 * Clear cached metrics for an agency
 */
export function clearCachedMetrics(agencyId) {
  const key = getCacheKey(agencyId);
  delete memoryCache[key];
  try {
    sessionStorage.removeItem(key);
  } catch (error) {
    console.warn('[cache.js] Failed to clear from sessionStorage:', error);
  }
}

/**
 * Get cache age in seconds (for display purposes)
 */
export function getCacheAge(agencyId) {
  const key = getCacheKey(agencyId);
  
  // Check memory cache
  if (memoryCache[key]) {
    const age = Date.now() - memoryCache[key].fetchedAt;
    return Math.floor(age / 1000);
  }
  
  // Check sessionStorage
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) {
      const cached = JSON.parse(stored);
      const age = Date.now() - cached.fetchedAt;
      return Math.floor(age / 1000);
    }
  } catch (error) {
    // Ignore
  }
  
  return null;
}
