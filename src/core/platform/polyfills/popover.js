/**
 * core/platform/polyfills/popover.js
 *
 * Popover API polyfill offering showPopover, hidePopover, togglePopover,
 * light dismiss, popovertarget click wiring, and simulated top-layer overlay.
 * Source: doc 18 §12, library2.md §Phase 1-A
 */

class ToggleEvent extends Event {
  constructor(type, init = {}) {
    super(type, init);
    this.oldState = init.oldState || 'closed';
    this.newState = init.newState || 'closed';
  }
}

class PopoverPolyfill {
  static install() {
    if ('popover' in HTMLElement.prototype) return;

    Object.defineProperty(HTMLElement.prototype, 'popover', {
      get() {
        return this.getAttribute('popover');
      },
      set(val) {
        if (val === null) this.removeAttribute('popover');
        else this.setAttribute('popover', val);
      },
      configurable: true,
      enumerable: true
    });

    HTMLElement.prototype.showPopover = function() {
      if (this.getAttribute('popover') === null) {
        throw new DOMException("Not a popover", "NotSupportedError");
      }
      if (this.hasAttribute('data-popover-open')) return;

      this.setAttribute('data-popover-open', '');
      
      // Simulating top-layer styling
      this.style.position = 'fixed';
      this.style.zIndex = '2147483647';

      // Light-dismiss behavior for "auto" popovers
      const type = this.getAttribute('popover');
      if (type === 'auto' || type === '') {
        const dismiss = (e) => {
          if (!this.contains(e.target) && e.target !== this) {
            this.hidePopover();
            document.removeEventListener('pointerdown', dismiss);
          }
        };
        // Defer attachment to prevent immediate closing during current click event
        setTimeout(() => {
          document.addEventListener('pointerdown', dismiss);
        }, 0);
      }

      this.dispatchEvent(new ToggleEvent('toggle', {
        oldState: 'closed',
        newState: 'open'
      }));
    };

    HTMLElement.prototype.hidePopover = function() {
      if (!this.hasAttribute('data-popover-open')) return;

      this.removeAttribute('data-popover-open');
      this.style.position = '';
      this.style.zIndex = '';

      this.dispatchEvent(new ToggleEvent('toggle', {
        oldState: 'open',
        newState: 'closed'
      }));
    };

    HTMLElement.prototype.togglePopover = function() {
      if (this.hasAttribute('data-popover-open')) {
        this.hidePopover();
      } else {
        this.showPopover();
      }
    };

    // Auto-setup declarative triggers
    if (typeof document !== 'undefined') {
      document.addEventListener('click', e => {
        const trigger = e.target.closest('[popovertarget]');
        if (!trigger) return;
        const targetId = trigger.getAttribute('popovertarget');
        const target = document.getElementById(targetId);
        if (!target) return;

        const action = trigger.getAttribute('popovertargetaction') || 'toggle';
        if (action === 'show') {
          target.showPopover();
        } else if (action === 'hide') {
          target.hidePopover();
        } else {
          target.togglePopover();
        }
      });
    }
  }
}

PopoverPolyfill.install();
export default PopoverPolyfill;
