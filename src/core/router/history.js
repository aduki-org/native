/**
 * src/core/router/history.js
 *
 * Programmatic history navigation wrapper.
 * Provides a clean interface for page-level traversals mapping directly
 * to the Navigation API (native or polyfilled).
 *
 * Source: doc 09 — Routing §2, §10, §12
 */

/**
 * Initiates a programmatic push navigation.
 */
export function navigate(url, options = {}) {
  if (typeof window === 'undefined' || !window.navigation) return;
  return window.navigation.navigate(url, options);
}

/**
 * Initiates a programmatic replace navigation (replaces current history entry).
 */
export function replace(url, options = {}) {
  if (typeof window === 'undefined' || !window.navigation) return;
  return window.navigation.navigate(url, { history: 'replace', ...options });
}

/**
 * Navigates back in history by one step.
 */
export function back() {
  if (typeof window === 'undefined' || !window.navigation) return;
  return window.navigation.back();
}

/**
 * Navigates forward in history by one step.
 */
export function forward() {
  if (typeof window === 'undefined' || !window.navigation) return;
  return window.navigation.forward();
}

/**
 * Traverses history by a numeric delta.
 */
export function go(delta) {
  if (typeof window === 'undefined' || !window.navigation) return;
  return window.navigation.go(delta);
}

/**
 * Returns a list of all active history entries.
 */
export function entries() {
  if (typeof window === 'undefined' || !window.navigation) return [];
  return typeof window.navigation.entries === 'function' ? window.navigation.entries() : [];
}

/**
 * Returns the current active history entry.
 */
export function current() {
  if (typeof window === 'undefined' || !window.navigation) return null;
  return window.navigation.currentEntry || null;
}

/**
 * Checks if a backward navigation traversal is valid.
 */
export function canBack() {
  if (typeof window === 'undefined' || !window.navigation) return false;
  if (typeof window.navigation.entries === 'function') {
    const list = window.navigation.entries();
    const active = window.navigation.currentEntry;
    if (active && list.length > 0) {
      return list.indexOf(active) > 0;
    }
  }
  return true;
}

/**
 * Checks if a forward navigation traversal is valid.
 */
export function canForward() {
  if (typeof window === 'undefined' || !window.navigation) return false;
  if (typeof window.navigation.entries === 'function') {
    const list = window.navigation.entries();
    const active = window.navigation.currentEntry;
    if (active && list.length > 0) {
      const idx = list.indexOf(active);
      return idx >= 0 && idx < list.length - 1;
    }
  }
  return true;
}
