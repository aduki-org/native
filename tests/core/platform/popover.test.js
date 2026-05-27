/**
 * tests/core/platform/popover.test.js
 *
 * Popover API polyfill, light-dismiss, and memory safety test suite.
 *
 * Source: plan.md Phase 6-A, core/platform/polyfills/popover.js
 */

// Force popover polyfill installation and testing by deleting native browser popover support
delete HTMLElement.prototype.showPopover;
delete HTMLElement.prototype.hidePopover;
delete HTMLElement.prototype.togglePopover;
try {
  delete HTMLElement.prototype.popover;
} catch (e) {}

import PopoverPolyfill from '/src/core/platform/polyfills/popover.js';

describe('Popover Polyfill', () => {
  let popoverEl;

  before(async () => {
    // Re-run install to guarantee it's fully installed on our customized clean prototype
    PopoverPolyfill.install();
  });

  beforeEach(() => {
    popoverEl = document.createElement('div');
    popoverEl.setAttribute('popover', 'auto');
    popoverEl.id = 'test-popover-element';
    document.body.appendChild(popoverEl);
  });

  afterEach(() => {
    if (popoverEl) {
      popoverEl.remove();
    }
  });

  it('should successfully toggle attributes and top-layer styles on show/hide', () => {
    if (typeof popoverEl.showPopover !== 'function') {
      throw new Error('Expected showPopover to be defined on HTMLElement prototype');
    }

    popoverEl.showPopover();
    if (!popoverEl.hasAttribute('data-popover-open')) {
      throw new Error('Expected data-popover-open attribute to be set on showPopover');
    }
    if (popoverEl.style.position !== 'fixed' || popoverEl.style.zIndex !== '2147483647') {
      throw new Error('Expected simulated top-layer styles on showPopover');
    }

    popoverEl.hidePopover();
    if (popoverEl.hasAttribute('data-popover-open')) {
      throw new Error('Expected data-popover-open attribute to be removed on hidePopover');
    }
    if (popoverEl.style.position !== '' || popoverEl.style.zIndex !== '') {
      throw new Error('Expected top-layer styles to be removed on hidePopover');
    }
  });

  it('should support declarative target click wiring', (done) => {
    const trigger = document.createElement('button');
    trigger.setAttribute('popovertarget', 'test-popover-element');
    document.body.appendChild(trigger);

    trigger.click();

    setTimeout(() => {
      try {
        if (!popoverEl.hasAttribute('data-popover-open')) {
          throw new Error('Expected declarative popover target click to open the popover');
        }
        trigger.click(); // toggle close
        if (popoverEl.hasAttribute('data-popover-open')) {
          throw new Error('Expected declarative popover target click to close the popover');
        }
        trigger.remove();
        done();
      } catch (err) {
        trigger.remove();
        done(err);
      }
    }, 50);
  });

  it('should trigger light-dismiss when clicking outside the popover element', (done) => {
    popoverEl.showPopover();

    const outsideClickEl = document.createElement('div');
    document.body.appendChild(outsideClickEl);

    // Simulate standard browser pointerdown event on external element
    setTimeout(() => {
      outsideClickEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      
      setTimeout(() => {
        try {
          if (popoverEl.hasAttribute('data-popover-open')) {
            throw new Error('Expected light-dismiss pointerdown to close the popover');
          }
          outsideClickEl.remove();
          done();
        } catch (err) {
          outsideClickEl.remove();
          done(err);
        }
      }, 50);
    }, 50);
  });

  it('should prevent memory leaks and clean up listeners/observers when element is unmounted from DOM while open', (done) => {
    popoverEl.showPopover();

    if (!popoverEl._popoverDismiss || !popoverEl._popoverObserver) {
      throw new Error('Expected dismiss handler and MutationObserver to be created on show');
    }

    // Programmatically unmount while open
    popoverEl.remove();

    // Give MutationObserver time to fire and trigger hidePopover
    setTimeout(() => {
      try {
        if (popoverEl.hasAttribute('data-popover-open')) {
          throw new Error('Expected unmounted element to be closed automatically');
        }
        if (popoverEl._popoverDismiss !== null || popoverEl._popoverObserver !== null) {
          throw new Error('Expected internal references, listeners, and observers to be completely cleared');
        }
        done();
      } catch (err) {
        done(err);
      }
    }, 80);
  });
});
