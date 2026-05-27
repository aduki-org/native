/**
 * tests/core/state/store.test.js
 *
 * Core state store reactive tracking execution test suite.
 *
 * Source: plan.md Phase 6-A, core/state/store.js
 */

import { ReactiveStore, setActiveSubscriber, getActiveSubscriber } from '@adukiorg/native/state';

describe('Reactive State Store', () => {
  it('should initialize and get state properties successfully', () => {
    const store = new ReactiveStore({ count: 10, theme: 'dark' });
    if (store.get('count') !== 10) {
      throw new Error(`Expected count 10, got ${store.get('count')}`);
    }
    if (store.get('theme') !== 'dark') {
      throw new Error(`Expected theme "dark", got "${store.get('theme')}"`);
    }
  });

  it('should track read accesses when an active subscriber is set', () => {
    const store = new ReactiveStore({ text: 'Hello' });
    const mockSubscriber = new Set();
    
    setActiveSubscriber(mockSubscriber);
    store.get('text');
    setActiveSubscriber(null);

    if (mockSubscriber.size !== 1) {
      throw new Error(`Expected 1 tracked dependency, got ${mockSubscriber.size}`);
    }
    const dep = [...mockSubscriber][0];
    if (dep.store !== store || dep.key !== 'text') {
      throw new Error('Tracked incorrect store dependency descriptors');
    }
  });

  it('should trigger subscriptions using microtask-batched execution', async () => {
    const store = new ReactiveStore({ val: 0 });
    let triggers = 0;

    store.subscribe('val', () => {
      triggers++;
    });

    store.set('val', 1);
    store.set('val', 2);
    store.set('val', 3);

    // Initial value is synchronous; trigger notifies after the current microtask
    if (triggers !== 0) {
      throw new Error(`Expected synchronous triggers to be 0, got ${triggers}`);
    }

    // Await microtask queue completion
    await new Promise((resolve) => queueMicrotask(resolve));

    if (triggers !== 1) {
      throw new Error(`Expected microtask batched triggers to be 1, got ${triggers}`);
    }
    if (store.get('val') !== 3) {
      throw new Error(`Expected final value 3, got ${store.get('val')}`);
    }
  });

  it('should unregister callbacks cleanly via disposers and AbortSignals', async () => {
    const store = new ReactiveStore({ active: false });
    let triggers = 0;
    const abortCtrl = new AbortController();

    const dispose = store.subscribe('active', () => {
      triggers++;
    }, abortCtrl.signal);

    store.set('active', true);
    await new Promise((resolve) => queueMicrotask(resolve));
    
    if (triggers !== 1) {
      throw new Error(`Expected 1 trigger, got ${triggers}`);
    }

    // Dispose manually
    dispose();
    store.set('active', false);
    await new Promise((resolve) => queueMicrotask(resolve));

    if (triggers !== 1) {
      throw new Error(`Expected trigger count to remain at 1 after dispose, got ${triggers}`);
    }

    // Assert AbortSignal abort triggers unregistration
    let secondTriggers = 0;
    store.subscribe('active', () => { secondTriggers++; }, abortCtrl.signal);

    abortCtrl.abort();
    store.set('active', true);
    await new Promise((resolve) => queueMicrotask(resolve));

    if (secondTriggers !== 0) {
      throw new Error(`Expected aborted subscriptions to never fire, got ${secondTriggers}`);
    }
  });

  it('should support serialization snapshots, resets, and hydrations', () => {
    const store = new ReactiveStore({ a: 1, b: 2 });
    const snap = store.snapshot();

    if (snap.a !== 1 || snap.b !== 2) {
      throw new Error('Store snapshot serialization failed');
    }

    store.reset({ a: 10 });
    if (store.get('a') !== 10 || store.get('b') !== undefined) {
      throw new Error('Store reset failed to clear or initialize state');
    }

    store.hydrate(snap);
    if (store.get('a') !== 1 || store.get('b') !== 2) {
      throw new Error('Store hydration failed to restore state values');
    }
  });
});
