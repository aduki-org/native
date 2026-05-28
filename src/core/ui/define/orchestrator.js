import { router } from '../../router/index.js';
import { specRegistry } from './state.js';

let dispose = null; // One-word module-level disposer variable (RT-11)

/**
 * Initializes the global routing orchestrator.
 * Listens for navigation found events and dynamically updates layout containers.
 */
export function initOrchestrator() {
  if (typeof window !== 'undefined') {
    dispose?.();
    dispose = router.on('found', async ({ tag, params, direction }) => {
      // RT-13: Async hydration gate — await custom element definition before mounting
      if (typeof customElements !== 'undefined' && tag.includes('-') && !customElements.get(tag)) {
        await customElements.whenDefined(tag);
      }

      const spec = specRegistry.get(tag.toLowerCase());
      if (!spec || !spec.container) return;

      // Use Advanced Container Registry lookup instead of blind DOM query
      const containerEl = router.getContainer(spec.container);
      if (!containerEl) {
        console.warn(`Target container "${spec.container}" not found in DOM for element <${tag}>`);
        return;
      }

      // Layout-preserving diffing: Sync parameters reactively if the element is already mounted
      const currentChild = containerEl.querySelector('.page-content');
      if (currentChild && currentChild.tagName.toLowerCase() === tag.toLowerCase()) {
        for (const [key, value] of Object.entries(params)) {
          currentChild[key] = value;
        }
        return;
      }

      // Instantiate the new declarative page element
      const pageEl = document.createElement(tag);
      pageEl.classList.add('page-content');
      for (const [key, value] of Object.entries(params)) {
        pageEl[key] = value;
      }

      // Delegated UI Swap: If the container implements swapView, let it handle the DOM transitions
      if (typeof containerEl.swapView === 'function') {
        await containerEl.swapView(pageEl, { params, direction });
      } else {
        // Fallback to standard atomic replace
        containerEl.replaceChildren(pageEl);
      }
    });
  }
}

export function destroyOrchestrator() {
  dispose?.();
  dispose = null;
}
