/**
 * src/core/router/match.js
 *
 * Route table registration and URLPattern matcher.
 * Compiles patterns lazily and extracts named capture group parameters on success.
 *
 * Source: doc 09 — Routing §3, §4
 */

import { guard } from '../platform/index.js';

const routes = [];
// Resolve Pattern class at module load if available natively (RT-03)
let Pattern = typeof URLPattern !== 'undefined' ? URLPattern : null;

// Pre-resolve polyfill in background if not native
if (!Pattern) {
  guard.urlPattern().then(cls => {
    Pattern = cls;
  }).catch(() => {});
}

async function getURLPattern() {
  if (!Pattern) {
    Pattern = await guard.urlPattern();
  }
  return Pattern;
}

function getSpecificity(patternStr) {
  if (patternStr === '*') return 0;
  const hasWildcard = patternStr.includes('*');
  const hasParam = patternStr.includes(':');
  
  if (!hasWildcard && !hasParam) return 3; // Static: highest
  if (!hasWildcard && hasParam) return 2;  // Params: medium
  return 1;                                // Wildcard: low
}

/**
 * Registers a route mapping.
 */
export function register(patternStr, handler, meta = {}) {
  routes.push({
    patternStr,
    handler,
    meta,
    pattern: null
  });

  // Sort routes by specificity (descending) and length (longer first) at registration time (RT-04)
  routes.sort((a, b) => {
    const specA = getSpecificity(a.patternStr);
    const specB = getSpecificity(b.patternStr);
    if (specA !== specB) return specB - specA;
    return b.patternStr.length - a.patternStr.length;
  });
}

/**
 * Matches a URL against the registered routes.
 */
export async function match(url) {
  // Use pre-resolved Pattern class synchronously on hot path (RT-03)
  const P = Pattern || (await getURLPattern());
  const targetUrl = new URL(url, globalThis.location?.href || 'http://localhost');

  for (const route of routes) {
    if (!route.pattern) {
      if (route.patternStr.startsWith('http://') || route.patternStr.startsWith('https://')) {
        route.pattern = new P(route.patternStr);
      } else {
        route.pattern = new P({ pathname: route.patternStr });
      }
    }

    const result = route.pattern.exec(targetUrl.href);
    if (result) {
      // Support lazy element factories via function handlers (RT-08)
      let tag = route.handler;
      if (typeof tag === 'function') {
        tag = await tag();
      }

      return {
        route,
        tag,
        params: result.pathname.groups || {},
        result
      };
    }
  }

  return null;
}

/**
 * Clears the route registry.
 */
export function clear() {
  routes.length = 0;
}

/**
 * Returns all currently registered routes.
 */
export function getRoutes() {
  return routes;
}
