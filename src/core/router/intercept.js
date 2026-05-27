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

const guards = [];
let notFoundHandler = null;

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

        // Graceful Safari Fallback: Evaluate guards inside post-commit handler if precommit is ignored.
        // If a guard fails here, we use location replace to correct the URL.
        for (const guardFn of guards) {
          const redirectUrl = await guardFn(destination, null);
          if (redirectUrl) {
            window.navigation.navigate(redirectUrl, { history: 'replace' });
            return;
          }
        }

        const routeMatch = await match(url);

        await transitions.run(async () => {
          if (routeMatch) {
            // Execute the route's custom element mount/update callback
            await routeMatch.route.handler(routeMatch.params, event);
          } else if (notFoundHandler) {
            await notFoundHandler(event);
          } else {
            console.error(`Route matching failed and no not-found boundary handler was configured: ${url}`);
          }
        });
      }
    });
  });
}
