/**
 * src/core/api/caches/glob.js
 *
 * Converts a simple glob pattern into a regular expression for namespace-based clearing.
 *
 * Source: doc 11 — Networking §6, core/api/plan.md
 */

/**
 * Translates a glob pattern (e.g., "/user/*") into a RegExp object.
 * Supports standard * wildcards.
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
export function globToRegex(pattern) {
  // Escape standard regex special characters
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  
  // Replace * with .* to permit wildcard matching
  const wildcarded = escaped.replace(/\*/g, '.*');
  
  return new RegExp(`^${wildcarded}$`);
}
