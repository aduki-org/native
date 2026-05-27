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
let URLPatternClass = null;

async function getURLPattern() {
  if (!URLPatternClass) {
    URLPatternClass = await guard.urlPattern();
  }
  return URLPatternClass;
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
}

/**
 * Matches a URL against the registered routes.
 */
export async function match(url) {
  const Pattern = await getURLPattern();
  const targetUrl = new URL(url, globalThis.location?.href || 'http://localhost');

  for (const route of routes) {
    if (!route.pattern) {
      if (route.patternStr.startsWith('http://') || route.patternStr.startsWith('https://')) {
        route.pattern = new Pattern(route.patternStr);
      } else {
        route.pattern = new Pattern({ pathname: route.patternStr });
      }
    }

    const result = route.pattern.exec(targetUrl.href);
    if (result) {
      return {
        route,
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
