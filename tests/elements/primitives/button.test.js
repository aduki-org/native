/**
 * tests/elements/primitives/button.test.js
 *
 * Primitive button Custom Element test suite.
 *
 * Source: plan.md Phase 6-A, elements/primitives/button.js
 */

import '../../../src/elements/primitives/button/index.js';

describe('<ui-button> Custom Element', () => {
  let btn;

  beforeEach(async () => {
    btn = document.createElement('ui-button');
    document.body.appendChild(btn);
    // Await async resources preloading and Shadow DOM compilation dynamically
    let count = 0;
    while ((!btn.shadowRoot || !btn.shadowRoot.querySelector('slot')) && count < 100) {
      await new Promise(resolve => setTimeout(resolve, 10));
      count++;
    }
  });

  afterEach(() => {
    btn.remove();
  });

  it('should render standard slot and template contents inside Shadow DOM', () => {
    btn.textContent = 'Submit Form';
    
    const root = btn.shadowRoot;
    if (!root) {
      throw new Error('Expected <ui-button> to possess a Shadow DOM root');
    }

    const slot = root.querySelector('slot');
    if (!slot) {
      throw new Error('Expected slot element inside shadow DOM root');
    }
  });

  it('should support dynamic disabled state and block clicks', () => {
    let clicked = false;
    btn.addEventListener('click', () => {
      clicked = true;
    });

    btn.setAttribute('disabled', 'true');
    btn.click();

    if (clicked) {
      throw new Error('Disabled button should suppress click event triggers');
    }
  });
});
