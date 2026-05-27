/**
 * tests/core/platform/supports.test.js
 *
 * Supports feature detection test suite.
 *
 * Source: plan.md Phase 6-A, core/platform/supports.js
 */

import { supports, reset } from '@aduki/native/platform';

describe('Supports Feature Detection', () => {
  it('should expose valid boolean feature flags', () => {
    const flags = [
      'navigationAPI',
      'urlPattern',
      'declarativeShadowDOM',
      'customStatePseudo',
      'formAssociated',
      'popoverAPI',
      'anchorPositioning',
      'viewTransitions',
      'scrollTimeline',
      'viewTimeline',
      'schedulerPostTask',
      'schedulerYield',
      'contentVisibility',
      'cssScope',
      'cssLayer',
      'cssModuleScripts',
      'importMaps',
      'sanitizerAPI',
      'trustedTypes',
      'subtleCrypto',
      'opfs',
      'storageManager',
      'fileSystemPickers',
      'backgroundSync',
      'speculationRules',
      'sharedWorker',
      'webLocks',
      'offscreenCanvas',
      'pushAPI',
      'notificationsAPI',
      'screenWakeLock',
      'idleDetection',
      'webAuthn'
    ];

    for (const flag of flags) {
      const val = supports[flag];
      if (typeof val !== 'boolean') {
        throw new Error(`Expected supports.${flag} to be a boolean, got ${typeof val}`);
      }
    }
  });

  it('should support resetting lazy-evaluated cached values', () => {
    const val = supports.urlPattern;
    reset('urlPattern');
    if (supports.urlPattern !== val) {
      throw new Error('supports.urlPattern changed value unexpectedly after reset');
    }
  });
});
