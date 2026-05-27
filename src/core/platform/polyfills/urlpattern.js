/**
 * core/platform/polyfills/urlpattern.js
 *
 * A lightweight URLPattern fallback for browsers lacking native support.
 * Implements pathname matching with named parameters and wildcards.
 * Source: doc 18 §3, library2.md §Phase 1-A
 */

class URLPatternPolyfill {
  #pathnameRegex;
  #paramNames = [];

  constructor(init) {
    let pathnamePattern = '*';
    if (typeof init === 'string') {
      try {
        const url = new URL(init, 'https://a.com');
        pathnamePattern = url.pathname;
      } catch {
        pathnamePattern = init;
      }
    } else if (init && typeof init === 'object') {
      pathnamePattern = init.pathname || '*';
    }

    // Convert pathname pattern to RegExp
    const segments = pathnamePattern.split('/');
    const regexSegments = segments.map(segment => {
      if (segment.startsWith(':')) {
        const paramName = segment.slice(1);
        this.#paramNames.push(paramName);
        return '([^/]+)';
      } else if (segment === '*') {
        this.#paramNames.push('0');
        return '(.*)';
      } else if (segment.includes('*')) {
        // e.g. /api/*
        this.#paramNames.push('0');
        return segment.replace(/\*/g, '(.*)');
      } else {
        return segment.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      }
    });

    this.#pathnameRegex = new RegExp('^' + regexSegments.join('/') + '$');
  }

  test(url) {
    try {
      const parsed = new URL(url, globalThis.location?.href || 'https://a.com');
      return this.#pathnameRegex.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  exec(url) {
    try {
      const parsed = new URL(url, globalThis.location?.href || 'https://a.com');
      const match = parsed.pathname.match(this.#pathnameRegex);
      if (!match) return null;

      const groups = {};
      this.#paramNames.forEach((name, index) => {
        groups[name] = match[index + 1] || '';
      });

      return {
        pathname: {
          input: parsed.pathname,
          groups
        }
      };
    } catch {
      return null;
    }
  }
}

if (!globalThis.URLPattern) {
  globalThis.URLPattern = URLPatternPolyfill;
}
export default URLPatternPolyfill;
