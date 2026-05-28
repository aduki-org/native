/**
 * src/core/router/sync/transport.js
 *
 * Dynamic network connection pool coordinator matching active route paths.
 * Automatically spawns or tears down WebSocket/WebTransport/SSE streams
 * when pathname transitions match registered URLPatterns.
 *
 * Source: doc 09 — Routing §12, §15, plan.md §6
 */

import { guard } from '../../platform/index.js';

const registry = new Map(); // patternStr -> { factoryFn, pattern }
const activeConnections = new Map(); // patternStr -> connection instance
let URLPatternClass = typeof URLPattern !== 'undefined' ? URLPattern : null;

// Pre-resolve polyfill in background if not native (RT-03)
if (!URLPatternClass) {
  guard.urlPattern().then(cls => {
    URLPatternClass = cls;
  }).catch(() => {});
}

async function getURLPattern() {
  if (!URLPatternClass) {
    URLPatternClass = await guard.urlPattern();
  }
  return URLPatternClass;
}

/**
 * Registers a dynamic background connection associated with a URLPattern path.
 */
export function registerConnection(patternStr, factoryFn) {
  registry.set(patternStr, {
    factoryFn,
    pattern: null
  });
}

/**
 * Automatically coordinates in-flight connections against the active URL.
 */
export async function coordinateConnections(url) {
  const Pattern = URLPatternClass || (await getURLPattern());
  const targetUrl = new URL(url, globalThis.location?.href || 'http://localhost');

  const matchedPatterns = new Set();
  for (const [patternStr, entry] of registry.entries()) {
    if (!entry.pattern) {
      entry.pattern = patternStr.startsWith('http://') || patternStr.startsWith('https://')
        ? new Pattern(patternStr)
        : new Pattern({ pathname: patternStr });
    }
    if (entry.pattern.test(targetUrl.href)) {
      matchedPatterns.add(patternStr);
    }
  }

  // Teardown stale active connections that do not match the new route
  for (const [patternStr, conn] of activeConnections.entries()) {
    if (!matchedPatterns.has(patternStr)) {
      try {
        if (typeof conn.close === 'function') conn.close();
        else if (typeof conn.disconnect === 'function') conn.disconnect();
      } catch (err) {
        console.error(`Error closing background synchronized connection for ${patternStr}:`, err);
      }
      activeConnections.delete(patternStr);
    }
  }

  // Boot up new connections matching the new active route
  for (const patternStr of matchedPatterns) {
    if (!activeConnections.has(patternStr)) {
      const entry = registry.get(patternStr);
      try {
        const conn = await entry.factoryFn(targetUrl);
        if (conn) {
          activeConnections.set(patternStr, conn);
        }
      } catch (err) {
        console.error(`Failed to initialize background connection for ${patternStr}:`, err);
      }
    }
  }
}

/**
 * Returns all active coordinated connection instances.
 */
export function getActiveConnections() {
  return activeConnections;
}

/**
 * Clears and closes all active transport connections.
 */
export function clearConnections() {
  for (const conn of activeConnections.values()) {
    try {
      if (typeof conn.close === 'function') conn.close();
      else if (typeof conn.disconnect === 'function') conn.disconnect();
    } catch (_) {}
  }
  activeConnections.clear();
  registry.clear();
}
