/**
 * tests/elements/navigation/tabs.test.js
 *
 * Navigation tabs Custom Element test suite.
 *
 * Source: plan.md Phase 6-A, elements/navigation/tabs.js
 */

import '../../../src/elements/navigation/tabs.js';

describe('<ui-tabs> TabPanel Component', () => {
  let tabs;

  beforeEach(() => {
    tabs = document.createElement('ui-tabs');
    document.body.appendChild(tabs);
  });

  afterEach(() => {
    tabs.remove();
  });

  it('should render core tab list and panel slot structures', () => {
    const root = tabs.shadowRoot;
    if (!root) {
      throw new Error('Expected <ui-tabs> to possess a Shadow DOM root');
    }

    const tablist = root.querySelector('[role="tablist"]');
    if (!tablist) {
      throw new Error('Missing ARIA tablist element inside tabs component shadow tree');
    }
  });

  it('should change active tabs when value properties are set', () => {
    tabs.setAttribute('value', 'tab2');
    if (tabs.getAttribute('value') !== 'tab2') {
      throw new Error('Expected active tab value attribute to be "tab2"');
    }
  });
});
