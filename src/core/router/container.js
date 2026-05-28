/**
 * src/core/router/container.js
 *
 * Dynamic Container Registry for Advanced Topologies (v2).
 * Maintains a real-time, non-blocking map of actively mounted DOM layout containers.
 * Employs WeakRef and FinalizationRegistry for perfect GC safety, and idle
 * MutationObservers for standard HTML fallback tracking.
 *
 * Source: advancev2.md
 */

// string -> WeakRef<HTMLElement>
const containerNodeMap = new Map();

// Passive safety net: prune stale map entries after GC
const cleanupRegistry = typeof FinalizationRegistry !== 'undefined' 
  ? new FinalizationRegistry((name) => {
      if (containerNodeMap.get(name)?.deref() === undefined) {
        containerNodeMap.delete(name);
      }
    })
  : { register() {}, unregister() {} };

let observer;
const observedSelectors = new Set();

/**
 * Boots the MutationObserver at idle priority if standard selectors are tracked.
 */
function ensureObserver() {
  if (observer || typeof window === 'undefined' || typeof requestIdleCallback === 'undefined') return;

  requestIdleCallback(() => {
    observer = new MutationObserver(() => {
      let activeObservationNeeded = false;
      for (const selector of observedSelectors) {
        if (!containerNodeMap.get(selector)?.deref()) {
          const el = document.querySelector(selector);
          if (el) {
            registerContainer(selector, el);
          } else {
            activeObservationNeeded = true;
          }
        }
      }

      // RT-06: Automatically disconnect MutationObserver if all observed selectors are resolved
      if (!activeObservationNeeded && observer) {
        observer.disconnect();
        observer = null;
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/**
 * Registers a layout container as actively mounted in the DOM.
 * @param {string} name - The unique identifier/selector of the container.
 * @param {HTMLElement} element - The DOM element instance.
 */
export function registerContainer(name, element) {
  const existing = containerNodeMap.get(name)?.deref();
  if (existing && existing !== element) {
    throw new Error(`ContainerError: Singleton violation — '${name}' is already mounted. A second instance cannot register while the first is active.`);
  }

  containerNodeMap.set(name, new WeakRef(element));
  cleanupRegistry.register(element, name);
}

/**
 * Unregisters a layout container when it is removed from the DOM.
 * @param {string} name - The unique identifier/selector of the container.
 * @param {HTMLElement} element - The DOM element instance (used for safety check).
 */
export function unregisterContainer(name, element) {
  const existing = containerNodeMap.get(name)?.deref();
  if (existing === element) {
    containerNodeMap.delete(name);
    try { cleanupRegistry.unregister(element); } catch(e) {}
  }
}

/**
 * Retrieves an active layout container by name.
 * @param {string} name - The unique identifier of the container.
 * @returns {HTMLElement|undefined} The active container element, or undefined if not mounted.
 */
export function getContainer(name) {
  let el = containerNodeMap.get(name)?.deref();
  
  if (!el && typeof document !== 'undefined') {
    try {
      el = document.querySelector(name);
      if (el) {
        // Auto-register standard DOM elements found via selector
        registerContainer(name, el);
      } else {
        // Track the selector and ensure MutationObserver is active (RT-06)
        if (!observedSelectors.has(name)) {
          observedSelectors.add(name);
        }
        ensureObserver();
      }
    } catch (err) {
      // Invalid selector string, ignore.
    }
  }

  return el;
}

/**
 * Clears the entire container registry.
 */
export function clearContainers() {
  containerNodeMap.clear();
  observedSelectors.clear();
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}
