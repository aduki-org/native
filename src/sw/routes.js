/**
 * src/sw/routes.js
 *
 * Service Worker Pattern Router.
 * Implements URLPattern matching, intercepting incoming SW fetch events
 * and routing them to their declared caching strategy synchronously.
 *
 * Source: doc 09 — Routing §3, doc 13 — Offline and Background §3
 */

/**
 * Normalizes an input pattern descriptor into a standard URLPattern instance.
 */
function normalize(pattern) {
  if (pattern instanceof URLPattern) {
    return pattern;
  }

  if (typeof pattern === 'string') {
    // Explicit wildcard string maps to match-all pathnames
    if (pattern === '*') {
      return new URLPattern({ pathname: '*' });
    }
    // Simple string route compiles to a pathname match
    return new URLPattern({ pathname: pattern });
  }

  // Object-based pattern parameters
  return new URLPattern(pattern);
}

export class Router {
  constructor() {
    this.routes = [];
  }

  /**
   * Registers a URLPattern and a matching caching strategy.
   */
  register(pattern, strategy) {
    this.routes.push({
      pattern: normalize(pattern),
      strategy
    });
  }

  /**
   * Handles an incoming fetch event, matching registered patterns sequentially
   * and intercepting matches.
   */
  handle(event) {
    const { request } = event;

    for (const route of this.routes) {
      if (route.pattern.test(request.url)) {
        // Intercept synchronously in fetch event tick
        event.respondWith(route.strategy.handle(request));
        return true;
      }
    }

    return false;
  }
}

/**
 * Factory wrapper to construct a Router instance.
 */
export function router() {
  return new Router();
}
