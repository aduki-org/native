/**
 * src/core/api/prefixes/index.js
 *
 * Prefix and Base URL registry for relative path expansion.
 * Allows clean routing/prefix matching at connection startup.
 *
 * Source: doc 11 — Networking §2, core/api/plan.md
 */

export class PrefixRegistry {
  #prefixes = new Map();

  /**
   * Registers a new base URL prefix.
   *
   * @param {string} name
   * @param {string} value
   */
  add(name, value) {
    this.#prefixes.set(name, value);
  }

  /**
   * Clears all registered prefixes.
   */
  clear() {
    this.#prefixes.clear();
  }

  /**
   * Resolves a URL prefix against registered base URLs.
   *
   * @param {string} url
   * @returns {string}
   */
  resolve(url) {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
      return url;
    }

    for (const [prefix, base] of this.#prefixes.entries()) {
      if (url.startsWith(`/${prefix}/`)) {
        const suffix = url.slice(prefix.length + 2);
        const normalizedBase = base.endsWith('/') ? base : base + '/';
        return normalizedBase + suffix;
      }
      if (url.startsWith(`${prefix}/`)) {
        const suffix = url.slice(prefix.length + 1);
        const normalizedBase = base.endsWith('/') ? base : base + '/';
        return normalizedBase + suffix;
      }
    }

    // Default fallback base
    const root = this.#prefixes.get('root') || this.#prefixes.get('default');
    if (root) {
      const normalizedRoot = root.endsWith('/') ? root.slice(0, -1) : root;
      const normalizedUrl = url.startsWith('/') ? url : '/' + url;
      return normalizedRoot + normalizedUrl;
    }

    return url;
  }
}

export const prefixes = new PrefixRegistry();
