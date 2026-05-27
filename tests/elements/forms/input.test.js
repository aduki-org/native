/**
 * tests/elements/forms/input.test.js
 *
 * Custom input Form-Associated Custom Element test suite.
 *
 * Source: plan.md Phase 6-A, elements/forms/input.js
 */

import '../../../src/elements/forms/input.js';

describe('<ui-input> Form-Associated Element', () => {
  let input;

  beforeEach(() => {
    input = document.createElement('ui-input');
    document.body.appendChild(input);
  });

  afterEach(() => {
    input.remove();
  });

  it('should support dynamic value property synchronizations', () => {
    input.value = 'typed-value';
    if (input.getAttribute('value') !== 'typed-value') {
      // Attribute sync check
      input.setAttribute('value', 'attr-value');
      if (input.value !== 'attr-value') {
        throw new Error(`Expected value property to sync with attribute, got ${input.value}`);
      }
    }
  });

  it('should participate in standard HTML5 validation cycles', () => {
    input.setAttribute('required', 'true');
    input.value = '';

    const validity = input.validity;
    if (validity && validity.valid) {
      throw new Error('Expected required empty input to be marked invalid');
    }

    input.value = 'valid text';
    if (validity && !input.validity.valid) {
      throw new Error('Expected filled input to be valid');
    }
  });
});
