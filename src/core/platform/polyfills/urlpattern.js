/**
 * src/core/platform/polyfills/urlpattern.js
 *
 * A robust URLPattern fallback for browsers lacking native support.
 * Implements pathname matching with named parameters, modifiers, wildcards,
 * and smart trailing slash normalization.
 *
 * Source: doc 18 §3, library2.md §Phase 1-A
 */

class URLPatternPolyfill {
  #pathnameRegex;
  #paramNames = [];

  constructor(init) {
    let pathnamePattern = '*';
    if (typeof init === 'string') {
      if (init.includes('://')) {
        try {
          const match = init.match(/^[a-zA-Z]+:\/\/[^\/]+(\/[^?#]*)/);
          pathnamePattern = match ? match[1] : '/';
        } catch {
          pathnamePattern = init;
        }
      } else {
        pathnamePattern = init;
      }
    } else if (init && typeof init === 'object') {
      pathnamePattern = init.pathname || '*';
    }

    // Ensure pathnamePattern starts with /
    if (!pathnamePattern.startsWith('/') && pathnamePattern !== '*') {
      pathnamePattern = '/' + pathnamePattern;
    }

    this.#paramNames = [];
    let wildcardCount = 0;

    const segments = pathnamePattern.split('/');
    const regexSegments = segments.map((segment, idx) => {
      if (idx === 0 && segment === '') return '';

      if (segment.startsWith(':')) {
        let paramName = segment.slice(1);
        let modifier = '';
        if (paramName.endsWith('?') || paramName.endsWith('*') || paramName.endsWith('+')) {
          modifier = paramName.slice(-1);
          paramName = paramName.slice(0, -1);
        }
        this.#paramNames.push(paramName);

        if (modifier === '?') {
          return '([^/]*)';
        } else if (modifier === '*') {
          return '(.*)';
        } else if (modifier === '+') {
          return '([^/]+.*)';
        } else {
          return '([^/]+)';
        }
      } else if (segment === '*') {
        this.#paramNames.push(String(wildcardCount++));
        return '(.*)';
      } else if (segment.includes('*')) {
        this.#paramNames.push(String(wildcardCount++));
        return segment.replace(/\*/g, '(.*)');
      } else {
        return segment.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      }
    });

    let patternStr = regexSegments.join('/');
    if (patternStr === '') patternStr = '/';

    // Support optional trailing slash if the pattern does not end in a wildcard or parameter modifier
    if (!pathnamePattern.endsWith('*') && !pathnamePattern.endsWith('?') && pathnamePattern !== '/') {
      patternStr += '/?';
    }

    this.#pathnameRegex = new RegExp('^' + patternStr + '$');
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
