/**
 * types/core/platform/supports.d.ts
 *
 * TypeScript declarations for browser-native feature detection flags.
 */

export const supports: {
  readonly serviceWorker: boolean;
  readonly indexedDB: boolean;
  readonly broadcastChannel: boolean;
  readonly webLocks: boolean;
  readonly crypto: boolean;
  readonly sanitizer: boolean;
  readonly waapi: boolean;
  readonly popover: boolean;
};
