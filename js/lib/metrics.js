// metrics.js - Incremental metrics updates for dashboard

import { db } from '../firebase.js';
import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { clearCachedMetrics } from './cache.js';
import { clearDashboardCache } from './dashboardService.js';

/**
 * Get metrics document reference
 */
function getMetricsRef(agencyId) {
  return doc(db, 'agencies', agencyId, 'stats', 'metrics');
}

/**
 * Initialize metrics document if it doesn't exist
 */
async function ensureMetricsDoc(agencyId) {
  const metricsRef = getMetricsRef(agencyId);
  const metricsSnap = await getDoc(metricsRef);
  
  if (!metricsSnap.exists()) {
    // Initialize with zeros
    await setDoc(metricsRef, {
      totalCustomers: 0,
      totalPremium: 0,
      renewalsNext30Days: 0,
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Increment total customers count
 */
export async function incrementCustomerCount(agencyId, delta = 1) {
  try {
    await ensureMetricsDoc(agencyId);
    const metricsRef = getMetricsRef(agencyId);
    await updateDoc(metricsRef, {
      totalCustomers: increment(delta),
      updatedAt: serverTimestamp(),
    });
    // Clear caches to force refresh
    clearCachedMetrics(agencyId);
    clearDashboardCache(agencyId);
  } catch (error) {
    console.error('[metrics.js] Error incrementing customer count:', error);
    // Don't throw - metrics update failure shouldn't break customer operations
  }
}

/**
 * Update total premium (add delta)
 */
export async function updatePremium(agencyId, delta) {
  try {
    await ensureMetricsDoc(agencyId);
    const metricsRef = getMetricsRef(agencyId);
    await updateDoc(metricsRef, {
      totalPremium: increment(delta),
      updatedAt: serverTimestamp(),
    });
    // Clear caches to force refresh
    clearCachedMetrics(agencyId);
    clearDashboardCache(agencyId);
  } catch (error) {
    console.error('[metrics.js] Error updating premium:', error);
    // Don't throw - metrics update failure shouldn't break policy operations
  }
}

/**
 * Recalculate renewals count (called when expiration dates change)
 * This is a single query using collectionGroup
 */
export async function recalculateRenewals(agencyId) {
  try {
    const { collectionGroup, query, where, Timestamp } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
    const { getDocs } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
    
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);
    
    const nowTimestamp = Timestamp.fromDate(now);
    const thirtyDaysTimestamp = Timestamp.fromDate(thirtyDaysFromNow);
    
    // Query policies with denormalized agencyId field
    const policiesRef = collectionGroup(db, 'policies');
    const q = query(
      policiesRef,
      where('agencyId', '==', agencyId),
      where('status', '==', 'active'),
      where('expirationDate', '>=', nowTimestamp),
      where('expirationDate', '<=', thirtyDaysTimestamp)
    );
    
    const snapshot = await getDocs(q);
    const count = snapshot.size;
    
    // Update metrics
    await ensureMetricsDoc(agencyId);
    const metricsRef = getMetricsRef(agencyId);
    await updateDoc(metricsRef, {
      renewalsNext30Days: count,
      updatedAt: serverTimestamp(),
    });
    
    // Clear caches to force refresh
    clearCachedMetrics(agencyId);
    clearDashboardCache(agencyId);
    
    return count;
  } catch (error) {
    console.error('[metrics.js] Error recalculating renewals:', error);
    // If query fails (e.g., index not created), don't throw
    // The dashboard will fall back to the old method
    return null;
  }
}

/**
 * Get current metrics (for dashboard)
 */
export async function getMetrics(agencyId) {
  try {
    await ensureMetricsDoc(agencyId);
    const metricsRef = getMetricsRef(agencyId);
    const metricsSnap = await getDoc(metricsRef);
    
    if (!metricsSnap.exists()) {
      return {
        totalCustomers: 0,
        totalPremium: 0,
        renewalsNext30Days: 0,
      };
    }
    
    const data = metricsSnap.data();
    return {
      totalCustomers: data.totalCustomers || 0,
      totalPremium: data.totalPremium || 0,
      renewalsNext30Days: data.renewalsNext30Days || 0,
    };
  } catch (error) {
    console.error('[metrics.js] Error getting metrics:', error);
    return {
      totalCustomers: 0,
      totalPremium: 0,
      renewalsNext30Days: 0,
    };
  }
}
