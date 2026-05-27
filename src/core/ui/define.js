/**
 * src/core/ui/define.js
 *
 * Custom Element Definer & Declarative UI Element Factory.
 * Implements the declarative customElements generator supporting property reflection,
 * type-safe casting, form internals, reactive update scheduling, and stylesheet HMR.
 *
 * Source: doc 04 — Web Components §1, §3, §6, doc 12 — Performance §2
 */

import { BaseElement } from './base.js';
import { scheduleFrame } from './schedule.js';

// Absolute URL assets cache mapping
const assetCache = new Map();

/**
 * Registers a custom element with a duplicate-registration safety guard.
 */
export function define(tag, Class) {
  if (typeof customElements !== 'undefined') {
    if (customElements.get(tag)) {
      console.warn(`Custom Element "${tag}" is already registered. Skipping duplicate load.`);
      return;
    }
    customElements.define(tag, Class);
  }
}

// Safe private storage keys mapped per instance (access-safety outside lexical class boundary)
const internalsMap = new WeakMap();
const initializedMap = new WeakMap();
const pendingUpdatesMap = new WeakMap();
const updateScheduledMap = new WeakMap();

/**
 * High-performance declarative element factory.
 */
export function element(tag, spec, base) {
  if (typeof customElements === 'undefined') return;
  if (customElements.get(tag)) {
    console.warn(`Declarative Element "${tag}" is already defined. Skipping.`);
    return;
  }

  // Define properties to watch
  const propKeys = spec.props ? Object.keys(spec.props) : [];
  const observedAttrs = propKeys.map(k => k.toLowerCase());

  // Resolve absolute URLs relative to import.meta.url (base)
  const styleUrl = spec.style && base && (spec.style.endsWith('.css') || spec.style.startsWith('./') || spec.style.startsWith('/'))
    ? new URL(spec.style, base).href
    : null;
  const templateUrl = spec.template && base && (spec.template.endsWith('.html') || spec.template.startsWith('./') || spec.template.startsWith('/'))
    ? new URL(spec.template, base).href
    : null;

  // Initiate resource fetching exactly once per component registration
  const resourcesPromise = preloadResources(tag, styleUrl, templateUrl, spec.template, spec.style);

  class DeclarativeElement extends BaseElement {
    static observedAttributes = observedAttrs;

    constructor() {
      super();
      this.attachShadow({ mode: spec.mode || 'open' });
      
      initializedMap.set(this, false);
      pendingUpdatesMap.set(this, new Map());
      updateScheduledMap.set(this, false);

      if (spec.form) {
        const internals = this.attachInternals();
        internalsMap.set(this, internals);
      }

      // Initialize default properties values
      if (spec.props) {
        for (const [key, config] of Object.entries(spec.props)) {
          if (config.default !== undefined && this[key] === undefined) {
            this[key] = config.default;
          }
        }
      }
    }

    async connectedCallback() {
      // AbortController bootstrap inside BaseElement
      super.connectedCallback();
      
      // Wait for resolved resources to compile
      const { templateNode, stylesheet } = await resourcesPromise;

      if (templateNode && this.shadowRoot.childNodes.length === 0) {
        this.shadowRoot.appendChild(templateNode.cloneNode(true));
      }

      if (stylesheet) {
        this.shadowRoot.adoptedStyleSheets = [stylesheet];
      }

      initializedMap.set(this, true);

      // Handle hot reloading of constructable stylesheets
      if (styleUrl && stylesheet) {
        const hmrHandler = (e) => {
          const { path: changedPath, css } = e.detail;
          const absoluteChangedUrl = new URL(changedPath, window.location.origin).href;
          
          if (styleUrl === absoluteChangedUrl || styleUrl.endsWith(changedPath)) {
            stylesheet.replaceSync(css);
            console.log(`[HMR] Dynamic AdoptedStyleSheet hot-swapped for <${tag}>`);
          }
        };

        window.addEventListener('native:hmr:css', hmrHandler);
        
        // Auto dispose HMR listener when unmounted to avoid memory leak
        if (this.ctrl) {
          this.ctrl.signal.addEventListener('abort', () => {
            window.removeEventListener('native:hmr:css', hmrHandler);
          });
        }
      }

      // Mount hook trigger passed with unified AbortController signal
      if (spec.mount) {
        spec.mount({
          el: this,
          ctrl: this.ctrl,
          internals: internalsMap.get(this)
        });
      }
    }

    disconnectedCallback() {
      if (spec.unmount) {
        spec.unmount({ el: this, internals: internalsMap.get(this) });
      }
      super.disconnectedCallback();
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (oldVal === newVal) return;

      // Find the camelCase property matching lowercase attribute name
      const key = propKeys.find(k => k.toLowerCase() === name);
      if (!key) return;

      const config = spec.props[key];
      let castedVal = newVal;

      if (config.type === Boolean) {
        castedVal = newVal !== null;
      } else if (config.type === Number) {
        castedVal = newVal !== null ? Number(newVal) : (config.default ?? 0);
      }

      // Sync property to trigger update callback and schedule updates
      if (this[key] !== castedVal) {
        this[key] = castedVal;
      }
    }
  }

  // 1. Generate type-safe getter/setters dynamically on class prototype
  for (const key of propKeys) {
    const config = spec.props[key];
    const attrName = key.toLowerCase();

    Object.defineProperty(DeclarativeElement.prototype, key, {
      get() {
        if (config.type === Boolean) {
          return this.hasAttribute(attrName);
        }
        const val = this.getAttribute(attrName);
        if (val === null) return config.default;
        return config.type === Number ? Number(val) : val;
      },
      set(val) {
        const oldVal = this[key];
        if (oldVal === val) return;

        // Attribute updates
        if (config.type === Boolean) {
          val ? this.setAttribute(attrName, '') : this.removeAttribute(attrName);
        } else if (val === null || val === undefined) {
          this.removeAttribute(attrName);
        } else {
          this.setAttribute(attrName, String(val));
        }

        // Custom state synchronization (:state(name))
        const internals = internalsMap.get(this);
        if (config.state && internals?.states) {
          if (val) {
            internals.states.add(key);
          } else {
            internals.states.delete(key);
          }
        }

        // Schedule batched updates via cooperative microtask scheduling
        const initialized = initializedMap.get(this);
        if (initialized && spec.update) {
          const pendingUpdates = pendingUpdatesMap.get(this);
          pendingUpdates.set(key, { val, old: oldVal });
          if (!updateScheduledMap.get(this)) {
            updateScheduledMap.set(this, true);
            scheduleFrame(() => {
              const changes = Array.from(pendingUpdates.entries());
              pendingUpdates.clear();
              updateScheduledMap.set(this, false);

              for (const [name, { val: v, old: o }] of changes) {
                spec.update({ el: this, name, val: v, old: o });
              }
            });
          }
        }
      }
    });
  }

  // 2. Form association
  if (spec.form) {
    Object.defineProperty(DeclarativeElement, 'formAssociated', {
      value: true,
      writable: false
    });
  }

  // Define element globally
  customElements.define(tag, DeclarativeElement);
}

/**
 * Preloads style and HTML template resources asynchronously exactly once.
 */
async function preloadResources(tag, styleUrl, templateUrl, inlineTemplate, inlineStyle) {
  let templateNode = null;
  let stylesheet = null;

  // Compile / Fetch styles
  if (styleUrl) {
    if (assetCache.has(styleUrl)) {
      stylesheet = assetCache.get(styleUrl);
    } else {
      stylesheet = new CSSStyleSheet();
      try {
        const res = await fetch(styleUrl);
        if (res.ok) {
          const css = await res.text();
          stylesheet.replaceSync(css);
          assetCache.set(styleUrl, stylesheet);
        }
      } catch (err) {
        console.error(`Failed to load style resource for element ${tag}:`, err);
      }
    }
  } else if (inlineStyle) {
    stylesheet = new CSSStyleSheet();
    stylesheet.replaceSync(inlineStyle);
  }

  // Compile / Fetch Template markup
  if (templateUrl) {
    if (assetCache.has(templateUrl)) {
      templateNode = assetCache.get(templateUrl);
    } else {
      try {
        const res = await fetch(templateUrl);
        if (res.ok) {
          const html = await res.text();
          templateNode = createTemplateFragment(html);
          assetCache.set(templateUrl, templateNode);
        }
      } catch (err) {
        console.error(`Failed to fetch template resource for element ${tag}:`, err);
      }
    }
  } else if (inlineTemplate) {
    templateNode = createTemplateFragment(inlineTemplate);
  }

  return { templateNode, stylesheet };
}

/**
 * Compiles an HTML string into a DocumentFragment utilizing the fastest native methods.
 */
function createTemplateFragment(htmlString) {
  const tpl = document.createElement('template');
  if (typeof tpl.setHTMLUnsafe === 'function') {
    tpl.setHTMLUnsafe(htmlString);
  } else {
    tpl.innerHTML = htmlString;
  }
  return tpl.content;
}
