import { ui, type MountContext, type UpdateContext } from '@adukiorg/native/ui';

interface TemplateRefs {
  button: HTMLButtonElement;
  status: HTMLSpanElement;
}

const props = {
  count: { type: Number, default: 0 },
  open: { type: Boolean, default: false },
  label: { type: String, default: '' }
};

ui.element<'ui-typed', typeof props, TemplateRefs>('ui-typed', {
  props,
  mount({ el, refs, tags, on, watch }) {
    el.count.toFixed();
    el.open.valueOf();
    el.label.trim();

    refs.button.disabled = true;
    refs.status.textContent = 'Ready';

    const input = tags.one<HTMLInputElement>('input');
    input?.value.trim();

    on.click<HTMLButtonElement>('button', (event, button) => {
      event.clientX.toFixed();
      button.disabled = false;
    });

    watch.attr(refs.button, 'disabled', (_attr, next, prev, button) => {
      next?.trim();
      prev?.trim();
      button.disabled = next !== null;
    });
  },
  update(ctx) {
    if (ctx.name === 'count') {
      ctx.val.toFixed();
      // @ts-expect-error number updates do not expose string methods.
      ctx.val.trim();
    }

    if (ctx.name === 'open') {
      ctx.val.valueOf();
      // @ts-expect-error boolean updates do not expose number methods.
      ctx.val.toFixed();
    }
  }
});

ui.element('ui-form-typed', {
  form: true,
  mount({ internals }) {
    internals.setFormValue('value');
  }
});

ui.element('ui-bad-default', {
  props: {
    // @ts-expect-error default must match Number prop type.
    count: { type: Number, default: 'wrong' }
  }
});

declare const mountContext: MountContext<typeof props, TemplateRefs>;
mountContext.refs.button.disabled = false;

declare const updateContext: UpdateContext<typeof props, TemplateRefs>;
if (updateContext.name === 'label') {
  updateContext.val.trim();
}
