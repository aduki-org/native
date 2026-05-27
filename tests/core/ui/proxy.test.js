import {
  TagsCache,
  createEventDelegator,
  createMutationWatcher,
  createRefs
} from '../../../src/core/ui/define/proxy.js';

function createShadow(markup = '') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = markup;
  return { host, root };
}

function nextMutationBatch() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('ui define proxy helpers', () => {
  let host;

  afterEach(() => {
    host?.remove();
    host = null;
  });

  it('keeps tags.one and tags.all cache shapes separate', () => {
    const shadow = createShadow('<button></button><button></button>');
    host = shadow.host;

    const tags = new TagsCache(shadow.root);
    const first = tags.one('button');
    const all = tags.all('button');

    if (!(first instanceof HTMLButtonElement)) {
      throw new Error('Expected tags.one to return the first button');
    }

    if (!Array.isArray(all) || all.length !== 2) {
      throw new Error('Expected tags.all to return an array of buttons');
    }
  });

  it('builds refs from descriptor or template scan', () => {
    const shadow = createShadow('<button ref="submit"></button><span ref="status"></span>');
    host = shadow.host;

    const refsFromDescriptor = createRefs(shadow.root, { refs: ['submit'] });
    const refsFromScan = createRefs(shadow.root);

    if (!(refsFromDescriptor.submit instanceof HTMLButtonElement)) {
      throw new Error('Expected descriptor refs to resolve submit');
    }

    if (!(refsFromScan.status instanceof HTMLSpanElement)) {
      throw new Error('Expected fallback scan to resolve status');
    }
  });

  it('delegates events and supports once bindings', () => {
    const shadow = createShadow('<button class="action"><span>Go</span></button>');
    host = shadow.host;

    const ctrl = new AbortController();
    const on = createEventDelegator(shadow.root, ctrl.signal);
    let calls = 0;

    on.click.once('.action', (_event, target) => {
      if (!target.classList.contains('action')) {
        throw new Error('Expected delegated target to be the matching button');
      }
      calls++;
    });

    const span = shadow.root.querySelector('span');
    span.click();
    span.click();
    ctrl.abort();

    if (calls !== 1) {
      throw new Error(`Expected once handler to fire once, fired ${calls}`);
    }
  });

  it('watches attribute mutations and stops after dispose', async () => {
    const shadow = createShadow('<button ref="submit"></button>');
    host = shadow.host;

    const ctrl = new AbortController();
    const watch = createMutationWatcher(shadow.root, ctrl.signal);
    const button = shadow.root.querySelector('button');
    const seen = [];

    const stop = watch.attr(button, 'disabled', (attr, next, prev, target) => {
      seen.push({ attr, next, prev, target });
    });

    button.setAttribute('disabled', '');
    await nextMutationBatch();
    stop();
    button.removeAttribute('disabled');
    await nextMutationBatch();
    ctrl.abort();

    if (seen.length !== 1) {
      throw new Error(`Expected one attribute mutation, saw ${seen.length}`);
    }

    if (seen[0].attr !== 'disabled' || seen[0].next !== '' || seen[0].target !== button) {
      throw new Error('Unexpected watch.attr handler payload');
    }
  });
});
