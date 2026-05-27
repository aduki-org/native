/**
 * src/core/router/intercept.js
 *
 * Core navigation interceptor loop.
 * Attaches listeners to the Navigation API 'navigate' event, evaluates security
 * guards, manages loading indicators, and performs updates wrapped in view transitions.
 *
 * Source: doc 09 — Routing §2, §5, §9, §13
 */

import { match } from './match.js';
import { transitions } from './transitions.js';
import { getContainer } from './container.js';

const guards = [];
let notFoundHandler = null;

const listeners = {
  found: new Set(),
  notfound: new Set(),
  error: new Set()
};

/**
 * Registers an event listener on the router.
 * Supported events: 'found', 'notfound', 'error'.
 * Supports auto-cleanup via the third argument 'signal' matching the event architecture patterns.
 */
export function on(type, callback, signal) {
  if (!listeners[type]) return () => {};

  listeners[type].add(callback);

  if (signal) {
    signal.addEventListener('abort', () => {
      listeners[type].delete(callback);
    });
  }

  return () => {
    listeners[type].delete(callback);
  };
}

/**
 * Emits an event to registered router listeners.
 */
export function emit(type, detail) {
  if (!listeners[type]) return;
  for (const callback of listeners[type]) {
    try {
      callback(detail);
    } catch (err) {
      console.error(`Error in router event listener for "${type}":`, err);
    }
  }
}

/**
 * Registers a global navigation guard.
 * Guards receive (destination, controller) and return a redirect URL if blocked,
 * or null/undefined to allow.
 */
export function addGuard(guardFn) {
  guards.push(guardFn);
}

/**
 * Sets the default handler for unmatched routes (404 page).
 */
export function setNotFound(handler) {
  notFoundHandler = handler;
}

/**
 * Attaches the global window.navigation navigate listener.
 */
export function setup() {
  if (typeof window === 'undefined' || !window.navigation) return;

  window.navigation.addEventListener('navigate', (event) => {
    // Skip cross-origin navigations, file downloads, or same-document hash scrolls
    if (!event.canIntercept || event.hashChange || event.downloadRequest) {
      return;
    }

    const url = event.destination.url;

    event.intercept({
      /**
       * Runs guards before URL changes.
       * Supports atomic redirection before URL commit (Chrome & Firefox).
       */
      async precommitHandler(controller) {
        const destination = event.destination;
        for (const guardFn of guards) {
          const redirectUrl = await guardFn(destination, controller);
          if (redirectUrl) {
            controller.redirect(redirectUrl);
            return;
          }
        }
      },

      /**
       * Executes DOM mutations, layout changes, and provides fallbacks for Safari.
       */
      async handler() {
        const destination = event.destination;
        const routeMatch = await match(destination.url);

        // Strict Layout Resolution Guard: prevent blind mounts if required container is inactive
        if (routeMatch && routeMatch.route.meta && routeMatch.route.meta.container) {
          const containerName = routeMatch.route.meta.container;
          if (!getContainer(containerName)) {
            throw new Error(`RouteError: Required layout container '${containerName}' is not active in the DOM.`);
          }
        }

        // Graceful Safari Fallback: Evaluate guards inside post-commit handler if precommit is ignored.
        // If a guard fails here, we use location replace to correct the URL.
        for (const guardFn of guards) {
          const redirectUrl = await guardFn(destination, null);
          if (redirectUrl) {
            window.navigation.navigate(redirectUrl, { history: 'replace' });
            return;
          }
        }

        await transitions.run(async () => {
          if (routeMatch) {
            // Execute the route's custom element mount/update callback if provided as a legacy handler
            if (typeof routeMatch.route.handler === 'function' && routeMatch.route.handler.length > 0) {
              await routeMatch.route.handler(routeMatch.params, event);
            }

            // Emit "found" event with pre-evaluated tag and params
            emit('found', {
              tag: routeMatch.tag,
              params: routeMatch.params,
              url: destination.url,
              direction: event.navigationType
            });
          } else {
            // Emit "notfound" event
            emit('notfound', { url });

            if (notFoundHandler) {
              await notFoundHandler(event);
            } else {
              console.error(`Route matching failed and no not-found boundary handler was configured: ${url}`);
            }
          }
        });
      }
    });
  });

  window.navigation.addEventListener('navigatesuccess', () => {
    const url = window.navigation.currentEntry?.url;
    if (url) {
      import('./sync/index.js').then(({ coordinateConnections }) => {
        coordinateConnections(url);
      }).catch(() => {});
    }
  });

  window.navigation.addEventListener('navigateerror', (event) => {
    const error = event.error;

    // Silence aborted/superseded navigation actions
    if (error && (error.name === 'AbortError' || error.message?.includes('aborted'))) {
      return;
    }

    console.error('Navigation error caught globally:', error);

    // Emit "error" event
    emit('error', { error });

    import('../events/index.js').then(({ events }) => {
      events.emit('core:error', {
        code: 'NAVIGATION_FAILED',
        message: error?.message || 'Navigation failed',
        cause: error,
        context: { url: window.navigation.currentEntry?.url },
        recoverable: true
      });
    }).catch(() => {});
  });

  // Trigger initial on-boot matching and emit initial events once setup is completed
  Promise.resolve().then(async () => {
    const url = window.navigation.currentEntry?.url || window.location.href;
    const routeMatch = await match(url);
    if (routeMatch) {
      emit('found', {
        tag: routeMatch.tag,
        params: routeMatch.params,
        url
      });
    } else {
      emit('notfound', { url });
    }
  });
}

class TransitionController {
  constructor(url, navigationPromise) {
    this.url = url;
    this.promise = navigationPromise;
    this.listeners = {
      found: [],
      notfound: [],
      error: []
    };

    this.promise
      .then(async () => {
        const routeMatch = await match(this.url);
        if (routeMatch) {
          // Check layout resolution guard for fluent transition correctly
          if (routeMatch.route.meta && routeMatch.route.meta.container) {
            const { getContainer } = await import('./container.js');
            if (!getContainer(routeMatch.route.meta.container)) {
              this._dispatch('error', new Error(`RouteError: Required layout container '${routeMatch.route.meta.container}' is not active in the DOM.`));
              return;
            }
          }

          this._dispatch('found', {
            tag: routeMatch.tag,
            params: routeMatch.params,
            url: this.url
          });
        } else {
          this._dispatch('notfound', { url: this.url });
        }
      })
      .catch((err) => {
        this._dispatch('error', err);
      });
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return this;
  }

  _dispatch(event, payload) {
    for (const cb of this.listeners[event]) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`Error inside fluent navigation "${event}" handler:`, err);
      }
    }
  }
}

export const nav = {
  to(url, options) {
    // Dynamic import to avoid circular dependency since history imports intercept and vice versa
    return new TransitionController(url, import('./history.js').then(m => m.navigate(url, options)));
  }
};

