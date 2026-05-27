/**
 * src/core/storage/quota.js
 *
 * Storage Quota Manager.
 * Wraps browser StorageManager API, providing space estimations,
 * persistence requests, and an active 80% usage eviction warning trigger.
 *
 * Source: doc 22 — Storage Architecture §6
 */

export class QuotaManager {
  /**
   * Fetches the current storage usage and quota estimates.
   */
  async estimate() {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      return navigator.storage.estimate();
    }
    return { usage: 0, quota: 0 };
  }

  /**
   * Requests the browser to allow persistent storage (avoiding auto-eviction).
   */
  async persist() {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      return navigator.storage.persist();
    }
    return false;
  }

  /**
   * Assesses usage against the threshold. Calls trigger hook if capacity > 80%.
   */
  async check(onEvictionWarning) {
    const { usage, quota } = await this.estimate();
    if (quota > 0 && usage / quota > 0.8) {
      if (typeof onEvictionWarning === 'function') {
        onEvictionWarning({ usage, quota });
      }
      return true;
    }
    return false;
  }
}

export const quota = new QuotaManager();
