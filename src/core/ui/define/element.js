import { BaseElement } from '../base.js';
import { scheduleFrame } from '../schedule.js';
import { router } from '../../router/index.js';
import { specRegistry, internalsMap, initializedMap, pendingUpdatesMap, updateScheduledMap } from './state.js';
import { preloadResources } from './utils.js';
import { createComponentContext } from './proxy.js';

/**
 * High-performance declarative element factory.
 */
export function element(tag, spec, base) {
  if (typeof customElements === 'undefined') return;
  if (customElements.get(tag)) {
    console.warn(`Declarative Element "${tag}" is already defined. Skipping.`);
    return;
  }

  // Cache element spec for automated layout orchestration and diffing
  specRegistry.set(tag.toLowerCase(), spec);

  // Automatically register elements with the route matcher if a url pattern is specified
  if (spec.url) {
    const meta = { ...spec.meta, container: spec.container };
    router.register(spec.url, tag, meta);
  }

  // Define properties to watch and their Symbol backing store keys (R-01)
  const propKeys = spec.props ? Object.keys(spec.props) : [];
  const observedAttrs = propKeys.map(k => k.toLowerCase());
  const store = {};
  for (const key of propKeys) {
    store[key] = Symbol(key);
  }

  // Resolve absolute URLs relative to import.meta.url (base)
  const styleUrl = spec.style && base && (spec.style.endsWith('.css') || spec.style.startsWith('./') || spec.style.startsWith('/'))
    ? new URL(spec.style, base).href
    : null;
  const templateUrl = spec.template && base && (spec.template.endsWith('.html') || spec.template.startsWith('./') || spec.template.startsWith('/'))
    ? new URL(spec.template, base).href
    : null;

  // Initiate resource fetching exactly once per component registration (R-06)
  let resolved = null;
  const resourcesPromise = preloadResources(tag, styleUrl, templateUrl, spec.template, spec.style).then(res => {
    resolved = res;
    return res;
  });

  // Handle hot reloading of constructable stylesheets (one global listener per unique styleUrl - R-05)
  if (styleUrl && typeof window !== 'undefined') {
    if (!window.__native_hmr_listeners__) {
      window.__native_hmr_listeners__ = new Set();
    }
    if (!window.__native_hmr_listeners__.has(styleUrl)) {
      window.__native_hmr_listeners__.add(styleUrl);
      const hmrHandler = async (e) => {
        const { path: changedPath, css } = e.detail;
        const absoluteChangedUrl = new URL(changedPath, window.location.origin).href;
        
        if (styleUrl === absoluteChangedUrl || styleUrl.endsWith(changedPath)) {
          const res = await resourcesPromise;
          if (res.stylesheet) {
            res.stylesheet.replaceSync(css);
            console.log(`[HMR] Shared AdoptedStyleSheet hot-swapped for <${tag}>`);
          }
        }
      };
      window.addEventListener('native:hmr:css', hmrHandler);
    }
  }

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

      // Initialize default properties backing store dynamically (R-01)
      if (spec.props) {
        for (const [key, config] of Object.entries(spec.props)) {
          const sym = store[key];
          const attrName = key.toLowerCase();
          let initial = config.default;
          if (config.type === Boolean) {
            initial = this.hasAttribute(attrName);
          } else {
            const attrVal = this.getAttribute(attrName);
            if (attrVal !== null) {
              initial = config.type === Number ? Number(attrVal) : attrVal;
            }
          }
          this[sym] = initial ?? (config.type === Boolean ? false : null);
        }
      }
    }

    async connectedCallback() {
      // AbortController bootstrap inside BaseElement
      super.connectedCallback();
      
      // Wait for resolved resources to compile (synchronously if already cached)
      let res = resolved;
      if (!res) {
        res = await resourcesPromise;
      }
      const { templateNode, stylesheet, tagsDescriptor } = res;

      if (!this.ctrl || this.ctrl.signal.aborted || !this.isConnected) {
        return;
      }

      if (templateNode && this.shadowRoot.childNodes.length === 0) {
        this.shadowRoot.appendChild(templateNode.cloneNode(true));
      }

      if (stylesheet) {
        this.shadowRoot.adoptedStyleSheets = [stylesheet];
      }
      
      const context = createComponentContext({
        el: this,
        shadowRoot: this.shadowRoot,
        ctrl: this.ctrl,
        descriptor: tagsDescriptor,
        internals: internalsMap.get(this)
      });

      this._ctx = context;
      this._tags = context.tags;
      this._on = context.on;
      this._refs = context.refs;
      this._watch = context.watch;

      initializedMap.set(this, true);

      // Mount hook trigger passed with unified AbortController signal
      if (spec.mount) {
        spec.mount(context);
      }
    }

    disconnectedCallback() {
      if (spec.unmount) {
        spec.unmount({ 
          el: this, 
          tags: this._tags,
          refs: this._refs,
          watch: this._watch,
          internals: internalsMap.get(this) 
        });
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

  // 1. Generate type-safe getter/setters dynamically on class prototype (R-01)
  for (const key of propKeys) {
    const config = spec.props[key];
    const attrName = key.toLowerCase();
    const sym = store[key];

    Object.defineProperty(DeclarativeElement.prototype, key, {
      get() {
        return this[sym];
      },
      set(val) {
        const oldVal = this[sym];
        if (oldVal === val) return;

        this[sym] = val;

        // Attribute updates (prevent redundant writes / infinite loops)
        if (config.type === Boolean) {
          if (val) {
            if (!this.hasAttribute(attrName)) this.setAttribute(attrName, '');
          } else {
            if (this.hasAttribute(attrName)) this.removeAttribute(attrName);
          }
        } else if (val === null || val === undefined) {
          if (this.hasAttribute(attrName)) this.removeAttribute(attrName);
        } else {
          const strVal = String(val);
          if (this.getAttribute(attrName) !== strVal) {
            this.setAttribute(attrName, strVal);
          }
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
            
            // Choose queueMicrotask or scheduleFrame depending on update.visual hint (R-03)
            const flush = (spec.update.visual === true)
              ? (fn) => scheduleFrame(fn)
              : (fn) => queueMicrotask(fn);
              
            flush(() => {
              if (!this.ctrl || this.ctrl.signal.aborted || !this.isConnected) {
                pendingUpdates.clear();
                updateScheduledMap.set(this, false);
                return;
              }

              const changes = Array.from(pendingUpdates.entries());
              pendingUpdates.clear();
              updateScheduledMap.set(this, false);

              for (const [name, { val: v, old: o }] of changes) {
                spec.update({ 
                  el: this, 
                  ctrl: this.ctrl,
                  tags: this._tags,
                  on: this._on,
                  refs: this._refs,
                  watch: this._watch,
                  name, 
                  val: v, 
                  old: o,
                  prev: o 
                });
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
