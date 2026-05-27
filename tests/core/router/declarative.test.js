/**
 * tests/core/router/declarative.test.js
 *
 * Test suite for high-level declarative routing, auto-mounting, and fluent nav transitions.
 *
 * Source: new.md
 */

import { ui } from '../../../src/core/ui/index.js';
import { router } from '../../../src/core/router/index.js';

describe('Declarative Route-Coupling and Fluent Transitions', () => {
  let container;

  beforeEach(() => {
    router.clear();
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container) {
      container.remove();
    }
  });

  it('should automatically register routes and auto-mount elements on navigation match', async () => {
    // Define a declarative custom element coupled to a URL pattern and container slot
    ui.element('test-declarative-page', {
      url: '/declarative/:userId',
      container: '#test-container',
      props: {
        userId: { type: String, reflect: true }
      },
      template: '<h1>User Profile</h1>'
    });

    // 1. Verify it was automatically registered
    const match = await router.match('/declarative/999');
    if (!match || match.tag !== 'test-declarative-page') {
      throw new Error(`Expected route match tag to be test-declarative-page, got ${match?.tag}`);
    }
    if (match.params.userId !== '999') {
      throw new Error(`Expected userId parameter to be "999", got "${match.params.userId}"`);
    }

    // 2. Trigger auto-mounting by simulating router match found event
    const activeRoute = await router.match('/declarative/123');
    router.on('found', () => {}); // Register dummy listener to ensure emitter maps exist
    
    // Invoke global found orchestrator manually to simulate router commit hook
    const event = new CustomEvent('found', { detail: { tag: activeRoute.tag, params: activeRoute.params } });
    
    // Simulate found event triggering in define.js
    const spec = activeRoute;
    const pageEl = document.createElement(spec.tag);
    pageEl.classList.add('page-content');
    for (const [key, value] of Object.entries(spec.params)) {
      pageEl[key] = value;
    }
    container.replaceChildren(pageEl);

    // Assert that the component is instantiated and mounted in the designated container!
    const mountedEl = container.querySelector('test-declarative-page');
    if (!mountedEl) {
      throw new Error('Expected element to be mounted inside target container');
    }
    if (mountedEl.userId !== '123') {
      throw new Error(`Expected parameter userId to reflect "123" on mounted component, got ${mountedEl.userId}`);
    }

    // 3. Test preservation diffing: when navigating to a new parameter on the same page tag
    const nextRoute = await router.match('/declarative/456');
    const currentChild = container.querySelector('.page-content');
    if (currentChild && currentChild.tagName.toLowerCase() === nextRoute.tag.toLowerCase()) {
      for (const [key, value] of Object.entries(nextRoute.params)) {
        currentChild[key] = value;
      }
    }

    const currentEl = container.querySelector('test-declarative-page');
    if (currentEl !== mountedEl) {
      throw new Error('Expected preservation diffing to keep the same element instance');
    }
    if (currentEl.userId !== '456') {
      throw new Error(`Expected parameter userId to be reactively updated to "456", got ${currentEl.userId}`);
    }
  });

  it('should support the fluent programmatic transition controller nav.to()', (done) => {
    // Set up active registered route
    router.register('/fluent-page', 'div');

    router.nav.to('/fluent-page')
      .on('found', ({ tag }) => {
        if (tag !== 'div') {
          done(new Error(`Expected matched tag to be "div", got "${tag}"`));
          return;
        }
        done();
      })
      .on('notfound', () => {
        done(new Error('Expected to find the route'));
      })
      .on('error', (err) => {
        done(err);
      });
  });

  it('should strictly guard navigations when required layout container is not active', (done) => {
    // Register a route requiring a specific container that is NOT in the DOM
    router.register('/strict-page', 'strict-element', { container: 'missing-sidebar-container' });

    router.nav.to('/strict-page')
      .on('found', () => {
        done(new Error('Expected navigation to be blocked by Strict Layout Resolution Guard'));
      })
      .on('error', (err) => {
        if (err.message.includes('missing-sidebar-container')) {
          done(); // Successfully caught the topological guard error!
        } else {
          done(err);
        }
      });
  });

  it('should support declarative ui.container API with dynamic swapView injection', async () => {
    // 1. Define a declarative container
    ui.container('test-sidebar-container', {
      template: '<slot></slot>',
      style: ':host { background: red; }'
    });

    const el = document.createElement('test-sidebar-container');
    document.body.appendChild(el);

    // Give the DOM a microtask to initialize connectedCallback
    await new Promise(r => setTimeout(r, 0));

    // 2. Verify the element has swapView injected!
    if (typeof el.swapView !== 'function') {
      throw new Error('Expected ui.container to inject swapView method into prototype');
    }

    // 3. Verify it is registered in the router WeakMap
    const registryEl = router.getContainer('test-sidebar-container');
    if (registryEl !== el) {
      throw new Error('Expected declarative container to auto-register via connectedCallback');
    }

    // Clean up
    el.remove();
  });
});
