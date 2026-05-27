/**
 * tests/core/router/transitions.test.js
 *
 * Test suite for same-document CSS View Transitions and shared-element morphing.
 *
 * Source: plan.md §8
 */

import { transitions } from '../../../src/core/router/transitions.js';

describe('View Transitions wrapper', () => {
  let element;

  beforeEach(() => {
    element = document.createElement('div');
    document.body.appendChild(element);
  });

  afterEach(() => {
    element.remove();
  });

  it('should execute DOM mutations successfully', async () => {
    let mutated = false;
    await transitions.run(async () => {
      mutated = true;
    });

    if (!mutated) {
      throw new Error('Expected updateDOM callback to be executed');
    }
  });

  it('should transiently apply and clear viewTransitionName on sourceElement', async () => {
    let nameCheckedDuringMutation = '';
    
    await transitions.run(
      async () => {
        // Retrieve transition name during DOM update phase
        nameCheckedDuringMutation = element.style.viewTransitionName;
      },
      { sourceElement: element, name: 'custom-card' }
    );

    // Verify it is securely cleared after execution completes
    if (element.style.viewTransitionName !== '') {
      throw new Error(`Expected viewTransitionName to be cleared, got "${element.style.viewTransitionName}"`);
    }

    // If startViewTransition is natively supported in this test browser environment,
    // we assert that it was set correctly during the update.
    if (typeof document.startViewTransition === 'function') {
      if (nameCheckedDuringMutation !== 'custom-card') {
        throw new Error(`Expected viewTransitionName to be "custom-card" during update, got "${nameCheckedDuringMutation}"`);
      }
    }
  });
});
