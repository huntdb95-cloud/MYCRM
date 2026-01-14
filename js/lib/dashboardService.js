// dashboardService.js - Comprehensive dashboard data service with caching

import { db } from '../firebase.js';
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  orderBy,
  limit,
  Timestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getMetrics } from './metrics.js';

// Cache configuration
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes default TTL
const WIDGET_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes for widgets

// In-memory cache (persists during SPA session navigation)
const memoryCache = {};

/**
 * Get cache key for dashboard snapshot
 */
function getCacheKey(agencyId) {
  return `dashboardSnapshot:${agencyId}`;
}

/**
 * Get cache key for widgets
 */
function getWidgetCacheKey(agencyId, widgetName) {
  return `dashboardWidget:${agencyId}:${widgetName}`;
}

/**
 * Check if cached data is still fresh
 */
function isFresh(fetchedAt, ttlMs = CACHE_TTL_MS) {
  if (!fetchedAt) return false;
  const now = Date.now();
  const age = now - fetchedAt;
  return age < ttlMs;
}

/**
 * Get cached dashboard snapshot from memory or localStorage
 */
function getCachedSnapshot(agencyId) {
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
  
  // Try localStorage
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const cached = JSON.parse(stored);
      if (isFresh(cached.fetchedAt, cached.ttlMs)) {
        // Restore to memory cache
        memoryCache[key] = cached;
        return cached.data;
      }
      // Expired, remove from localStorage
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn('[dashboardService] Failed to read from localStorage:', error);
  }
  
  return null;
}

/**
 * Set cached dashboard snapshot in memory and localStorage
 */
function setCachedSnapshot(agencyId, snapshot, ttlMs = CACHE_TTL_MS) {
  const key = getCacheKey(agencyId);
  const cached = {
    data: snapshot,
    fetchedAt: Date.now(),
    ttlMs
  };
  
  // Store in memory
  memoryCache[key] = cached;
  
  // Store in localStorage
  try {
    localStorage.setItem(key, JSON.stringify(cached));
  } catch (error) {
    console.warn('[dashboardService] Failed to write to localStorage:', error);
    // Continue without localStorage - memory cache still works
  }
}

/**
 * Get cached widget data
 */
function getCachedWidget(agencyId, widgetName) {
  const key = getWidgetCacheKey(agencyId, widgetName);
  
  // Try memory cache first
  if (memoryCache[key]) {
    const cached = memoryCache[key];
    if (isFresh(cached.fetchedAt, WIDGET_CACHE_TTL_MS)) {
      return cached.data;
    }
    delete memoryCache[key];
  }
  
  // Try localStorage
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const cached = JSON.parse(stored);
      if (isFresh(cached.fetchedAt, WIDGET_CACHE_TTL_MS)) {
        memoryCache[key] = cached;
        return cached.data;
      }
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn('[dashboardService] Failed to read widget from localStorage:', error);
  }
  
  return null;
}

/**
 * Set cached widget data
 */
function setCachedWidget(agencyId, widgetName, data) {
  const key = getWidgetCacheKey(agencyId, widgetName);
  const cached = {
    data,
    fetchedAt: Date.now(),
    ttlMs: WIDGET_CACHE_TTL_MS
  };
  
  memoryCache[key] = cached;
  
  try {
    localStorage.setItem(key, JSON.stringify(cached));
  } catch (error) {
    console.warn('[dashboardService] Failed to write widget to localStorage:', error);
  }
}

/**
 * Clear all dashboard caches for an agency
 */
export function clearDashboardCache(agencyId) {
  const snapshotKey = getCacheKey(agencyId);
  delete memoryCache[snapshotKey];
  
  const widgetKeys = ['renewals', 'tasks', 'crosssell', 'conversations'];
  widgetKeys.forEach(widgetName => {
    const widgetKey = getWidgetCacheKey(agencyId, widgetName);
    delete memoryCache[widgetKey];
  });
  
  try {
    localStorage.removeItem(snapshotKey);
    widgetKeys.forEach(widgetName => {
      localStorage.removeItem(getWidgetCacheKey(agencyId, widgetName));
    });
  } catch (error) {
    console.warn('[dashboardService] Failed to clear localStorage:', error);
  }
}

/**
 * Get renewals (optimized query with limit)
 */
async function getRenewals(agencyId) {
  const cached = getCachedWidget(agencyId, 'renewals');
  if (cached) {
    return cached;
  }
  
  const startTime = performance.now();
  
  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);
    
    const nowTimestamp = Timestamp.fromDate(now);
    const thirtyDaysTimestamp = Timestamp.fromDate(thirtyDaysFromNow);
    
    // Use collectionGroup query with denormalized agencyId field
    const policiesRef = collectionGroup(db, 'policies');
    const q = query(
      policiesRef,
      where('agencyId', '==', agencyId),
      where('status', '==', 'active'),
      where('expirationDate', '>=', nowTimestamp),
      where('expirationDate', '<=', thirtyDaysTimestamp),
      orderBy('expirationDate', 'asc'),
      limit(8) // Only fetch what we need
    );
    
    const snapshot = await getDocs(q);
    
    const renewals = [];
    const customerIds = new Set();
    const policies = [];
    
    snapshot.forEach(doc => {
      const policy = doc.data();
      let customerId = policy.customerId;
      if (!customerId && doc.ref && doc.ref.parent && doc.ref.parent.parent) {
        const pathParts = doc.ref.path.split('/');
        const customerIndex = pathParts.indexOf('customers');
        if (customerIndex >= 0 && customerIndex + 1 < pathParts.length) {
          customerId = pathParts[customerIndex + 1];
        }
      }
      if (customerId) {
        customerIds.add(customerId);
        policies.push({
          id: doc.id,
          customerId,
          ...policy
        });
      }
    });
    
    // Batch fetch customer names (limit to 8)
    const customerNames = {};
    if (customerIds.size > 0) {
      const customersRef = collection(db, 'agencies', agencyId, 'customers');
      const customerPromises = Array.from(customerIds).slice(0, 8).map(async (customerId) => {
        try {
          const customerRef = doc(db, 'agencies', agencyId, 'customers', customerId);
          const customerSnap = await getDoc(customerRef);
          if (customerSnap.exists()) {
            const customerData = customerSnap.data();
            customerNames[customerId] = customerData.fullName || customerData.insuredName || 'Unknown';
          }
        } catch (error) {
          console.warn(`[dashboardService] Failed to fetch customer ${customerId}:`, error);
          customerNames[customerId] = 'Unknown';
        }
      });
      await Promise.all(customerPromises);
    }
    
    // Build renewals array with customer names
    policies.forEach(policy => {
      renewals.push({
        ...policy,
        customerName: customerNames[policy.customerId] || 'Unknown'
      });
    });
    
    const duration = performance.now() - startTime;
    console.log(`[dashboardService] getRenewals took ${duration.toFixed(2)}ms`);
    
    setCachedWidget(agencyId, 'renewals', renewals);
    return renewals;
  } catch (error) {
    console.warn('[dashboardService] CollectionGroup query failed, falling back:', error);
    // Return cached data if available, even if expired
    if (cached) return cached;
    return [];
  }
}

/**
 * Get tasks due soon (optimized with proper query)
 */
async function getTasksDueSoon(agencyId, userUid, userRole) {
  const cached = getCachedWidget(agencyId, 'tasks');
  if (cached) {
    return cached;
  }
  
  const startTime = performance.now();
  
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(now.getDate() + 7);
    
    const nowTimestamp = Timestamp.fromDate(now);
    const sevenDaysTimestamp = Timestamp.fromDate(sevenDaysFromNow);
    
    const tasksRef = collection(db, 'agencies', agencyId, 'tasks');
    
    // Build query with proper filters
    let q;
    if (userRole !== 'admin') {
      q = query(
        tasksRef,
        where('assignedToUid', '==', userUid),
        where('status', '!=', 'done'),
        where('dueAt', '>=', nowTimestamp),
        where('dueAt', '<=', sevenDaysTimestamp),
        orderBy('dueAt', 'asc'),
        limit(8)
      );
    } else {
      q = query(
        tasksRef,
        where('status', '!=', 'done'),
        where('dueAt', '>=', nowTimestamp),
        where('dueAt', '<=', sevenDaysTimestamp),
        orderBy('dueAt', 'asc'),
        limit(8)
      );
    }
    
    const snapshot = await getDocs(q);
    const tasks = [];
    snapshot.forEach(doc => {
      tasks.push({ id: doc.id, ...doc.data() });
    });
    
    const duration = performance.now() - startTime;
    console.log(`[dashboardService] getTasksDueSoon took ${duration.toFixed(2)}ms`);
    
    setCachedWidget(agencyId, 'tasks', tasks);
    return tasks;
  } catch (error) {
    console.warn('[dashboardService] Tasks query failed (index may be needed):', error);
    // Fallback: query without date filters and filter in memory
    try {
      const tasksRef = collection(db, 'agencies', agencyId, 'tasks');
      let q;
      if (userRole !== 'admin') {
        q = query(tasksRef, where('assignedToUid', '==', userUid), limit(50));
      } else {
        q = query(tasksRef, limit(50));
      }
      
      const snapshot = await getDocs(q);
      const now = new Date();
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(now.getDate() + 7);
      
      const tasks = [];
      snapshot.forEach(doc => {
        const task = { id: doc.id, ...doc.data() };
        if (task.status !== 'done' && task.dueAt) {
          const dueDate = task.dueAt.toDate ? task.dueAt.toDate() : new Date(task.dueAt);
          if (dueDate <= sevenDaysFromNow && dueDate >= now) {
            tasks.push(task);
          }
        }
      });
      
      tasks.sort((a, b) => {
        const dateA = a.dueAt.toDate ? a.dueAt.toDate() : new Date(a.dueAt);
        const dateB = b.dueAt.toDate ? b.dueAt.toDate() : new Date(b.dueAt);
        return dateA - dateB;
      });
      
      const result = tasks.slice(0, 8);
      setCachedWidget(agencyId, 'tasks', result);
      return result;
    } catch (fallbackError) {
      console.error('[dashboardService] Fallback tasks query also failed:', fallbackError);
      if (cached) return cached;
      return [];
    }
  }
}

/**
 * Get cross-sell opportunities (optimized - only fetch customers with crossSellScore or policyCount == 1)
 */
async function getCrossSellOpportunities(agencyId) {
  const cached = getCachedWidget(agencyId, 'crosssell');
  if (cached) {
    return cached;
  }
  
  const startTime = performance.now();
  
  try {
    // Try to get from stats document first
    const statsRef = doc(db, 'agencies', agencyId, 'stats', 'dashboard');
    const statsSnap = await getDoc(statsRef);
    
    if (statsSnap.exists() && statsSnap.data().crossSellOpportunities) {
      const count = statsSnap.data().crossSellOpportunities;
      
      // If we have a count, fetch only the top customers
      const customersRef = collection(db, 'agencies', agencyId, 'customers');
      // Query customers with crossSellScore > 0 or policyCount == 1
      // Note: This requires an index. If it fails, fall back to fetching all and filtering
      try {
        const q1 = query(
          customersRef,
          where('crossSellScore', '>', 0),
          orderBy('crossSellScore', 'desc'),
          limit(8)
        );
        const snapshot1 = await getDocs(q1);
        
        const customers = [];
        snapshot1.forEach(doc => {
          customers.push({ id: doc.id, ...doc.data() });
        });
        
        // If we have less than 8, also get customers with policyCount == 1
        if (customers.length < 8) {
          const q2 = query(
            customersRef,
            where('policyCount', '==', 1),
            limit(8 - customers.length)
          );
          const snapshot2 = await getDocs(q2);
          snapshot2.forEach(doc => {
            const data = doc.data();
            // Avoid duplicates
            if (!customers.find(c => c.id === doc.id)) {
              customers.push({ id: doc.id, ...data });
            }
          });
        }
        
        // Sort by crossSellScore descending
        customers.sort((a, b) => (b.crossSellScore || 0) - (a.crossSellScore || 0));
        
        const result = customers.slice(0, 8);
        const duration = performance.now() - startTime;
        console.log(`[dashboardService] getCrossSellOpportunities took ${duration.toFixed(2)}ms`);
        
        setCachedWidget(agencyId, 'crosssell', result);
        return result;
      } catch (queryError) {
        console.warn('[dashboardService] Cross-sell query failed (index may be needed), using fallback:', queryError);
        // Fall through to fallback
      }
    }
    
    // Fallback: fetch limited customers and filter in memory
    const customersRef = collection(db, 'agencies', agencyId, 'customers');
    const q = query(customersRef, limit(100)); // Limit to 100 for performance
    const snapshot = await getDocs(q);
    
    const customers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.crossSellScore > 0 || data.policyCount === 1) {
        customers.push({ id: doc.id, ...data });
      }
    });
    
    // Sort by crossSellScore descending
    customers.sort((a, b) => (b.crossSellScore || 0) - (a.crossSellScore || 0));
    
    const result = customers.slice(0, 8);
    const duration = performance.now() - startTime;
    console.log(`[dashboardService] getCrossSellOpportunities (fallback) took ${duration.toFixed(2)}ms`);
    
    setCachedWidget(agencyId, 'crosssell', result);
    return result;
  } catch (error) {
    console.error('[dashboardService] Error getting cross-sell opportunities:', error);
    if (cached) return cached;
    return [];
  }
}

/**
 * Get recent conversations (optimized with limit)
 */
async function getRecentConversations(agencyId) {
  const cached = getCachedWidget(agencyId, 'conversations');
  if (cached) {
    return cached;
  }
  
  const startTime = performance.now();
  
  try {
    const conversationsRef = collection(db, 'agencies', agencyId, 'conversations');
    const q = query(
      conversationsRef,
      orderBy('lastMessageAt', 'desc'),
      limit(8) // Only fetch what we need
    );
    
    const snapshot = await getDocs(q);
    
    const conversations = [];
    const customerIds = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      customerIds.push(data.customerId);
      conversations.push({ id: doc.id, ...data });
    });
    
    // Batch fetch customer names (limit to 8)
    const customerNames = {};
    if (customerIds.length > 0) {
      const customersRef = collection(db, 'agencies', agencyId, 'customers');
      const customerPromises = customerIds.slice(0, 8).map(async (customerId) => {
        try {
          const customerRef = doc(db, 'agencies', agencyId, 'customers', customerId);
          const customerSnap = await getDoc(customerRef);
          if (customerSnap.exists()) {
            const customerData = customerSnap.data();
            customerNames[customerId] = customerData.fullName || 'Unknown';
          }
        } catch (error) {
          console.warn(`[dashboardService] Failed to fetch customer ${customerId}:`, error);
          customerNames[customerId] = 'Unknown';
        }
      });
      await Promise.all(customerPromises);
    }
    
    // Add customer names to conversations
    conversations.forEach(conv => {
      conv.customerName = customerNames[conv.customerId] || 'Unknown Customer';
    });
    
    const duration = performance.now() - startTime;
    console.log(`[dashboardService] getRecentConversations took ${duration.toFixed(2)}ms`);
    
    setCachedWidget(agencyId, 'conversations', conversations);
    return conversations;
  } catch (error) {
    console.warn('[dashboardService] Conversations query failed (index may be needed):', error);
    if (cached) return cached;
    return [];
  }
}

/**
 * Get complete dashboard snapshot
 * Returns cached data immediately if available, then fetches fresh data in background
 */
export async function getDashboardSnapshot(agencyId, userUid, userRole, forceRefresh = false) {
  const startTime = performance.now();
  
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = getCachedSnapshot(agencyId);
    if (cached) {
      console.log(`[dashboardService] Returning cached dashboard snapshot (age: ${Math.floor((Date.now() - cached.lastUpdated) / 1000)}s)`);
      
      // Refresh in background if cache is getting stale (older than 1 minute)
      const cacheAge = Date.now() - cached.lastUpdated;
      if (cacheAge > 60 * 1000) {
        // Refresh in background (don't await)
        getDashboardSnapshot(agencyId, userUid, userRole, true).catch(err => {
          console.warn('[dashboardService] Background refresh failed:', err);
        });
      }
      
      return cached;
    }
  }
  
  console.log('[dashboardService] Fetching fresh dashboard snapshot...');
  
  // Fetch all data in parallel
  const [metrics, renewals, tasks, crossSell, conversations] = await Promise.all([
    getMetrics(agencyId),
    getRenewals(agencyId),
    getTasksDueSoon(agencyId, userUid, userRole),
    getCrossSellOpportunities(agencyId),
    getRecentConversations(agencyId)
  ]);
  
  // Build snapshot
  const snapshot = {
    totalCustomers: metrics.totalCustomers || 0,
    totalPremium: metrics.totalPremium || 0,
    renewals: renewals.length,
    renewalsSoon: renewals,
    tasksDueSoon: tasks, // Array of tasks, not count
    tasksDueSoonCount: tasks.length, // Count for reference
    crossSellOpportunities: crossSell, // Array of customers, not count
    crossSellOpportunitiesCount: crossSell.length, // Count for reference
    recentConversations: conversations,
    lastUpdated: Date.now()
  };
  
  // Cache the snapshot
  setCachedSnapshot(agencyId, snapshot);
  
  const duration = performance.now() - startTime;
  console.log(`[dashboardService] getDashboardSnapshot took ${duration.toFixed(2)}ms`);
  
  return snapshot;
}

/**
 * Get cache age in seconds (for display)
 */
export function getCacheAge(agencyId) {
  const key = getCacheKey(agencyId);
  
  // Check memory cache
  if (memoryCache[key]) {
    const age = Date.now() - memoryCache[key].fetchedAt;
    return Math.floor(age / 1000);
  }
  
  // Check localStorage
  try {
    const stored = localStorage.getItem(key);
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
