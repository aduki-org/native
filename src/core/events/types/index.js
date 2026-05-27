/**
 * src/core/events/types/index.js
 *
 * Centralized System Event Name constants registry.
 * Maps standard, cross-cutting system telemetry events to prevent typos.
 *
 * Source: doc 10 — Event Architecture §10, §11
 */

export const names = {
  // Authentication Lifecycle Events
  auth: {
    signedin: 'auth:signedin',
    signedout: 'auth:signedout',
    refreshed: 'auth:refreshed'
  },

  // Network Connectivity Lifecycle Events
  connectivity: {
    online: 'connectivity:online',
    offline: 'connectivity:offline'
  },

  // User Preference Configuration Changes
  preference: {
    changed: 'preference:changed'
  },

  // Service Worker Status and Communication Channels
  sw: {
    updated: 'sw:updated',
    message: 'sw:message'
  }
};
