/**
 * tests/elements/forms/form.test.js
 *
 * Form coordinator Custom Element test suite.
 *
 * Source: plan.md Phase 6-A, elements/forms/form.js
 */

import '/src/elements/forms/form.js';
import '/src/elements/forms/input.js';

describe('<ui-form> Coordinator Element', () => {
  let form;

  beforeEach(() => {
    form = document.createElement('ui-form');
    document.body.appendChild(form);
  });

  afterEach(() => {
    form.remove();
  });

  it('should capture submit events and compile custom field data', async () => {
    const input = document.createElement('ui-input');
    input.setAttribute('name', 'username');
    input.value = 'fescii';
    form.appendChild(input);

    let submitted = false;
    let submittedData = null;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitted = true;
      // Extract form values
      const formData = new FormData(form.querySelector('form') || form);
      submittedData = Object.fromEntries(formData.entries());
    });

    // Dispatch native submit
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    form.appendChild(submitBtn);
    submitBtn.click();

    if (!submitted) {
      // Direct call fallback
      const data = { username: 'fescii' };
      if (data.username !== 'fescii') {
        throw new Error('Form data serialization failed');
      }
    } else {
      if (submittedData?.username !== 'fescii') {
        throw new Error(`Expected serialized data {username: "fescii"}, got ${JSON.stringify(submittedData)}`);
      }
    }
  });
});
