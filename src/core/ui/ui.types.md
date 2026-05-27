# Native UI Type System Plan

This document specifies the TypeScript declaration surface for `@adukiorg/native/ui`. The goal is strict IDE enforcement for component authors using plain JavaScript with JSDoc or TypeScript consumers importing the package declarations.

The current runtime source of truth is:

- `src/core/ui/index.js`
- `src/core/ui/base.js`
- `src/core/ui/schedule.js`
- `src/core/ui/template.js`
- `src/core/ui/transitions.js`
- `src/core/ui/observe.js`
- `src/core/ui/define/define.js`
- `src/core/ui/define/element.js`
- `src/core/ui/define/container.js`
- `src/core/ui/define/proxy.js`

The implemented declaration file is:

- `types/core/ui/index.d.ts`

Optional generated component-specific files:

- `index.tags.d.ts`
- generated `dist/types/**/*.d.ts`

## 1. Goals

- Make `ui.element(...)` and `ui.container(...)` strongly typed.
- Infer component property types from `props`.
- Type `mount`, `update`, and `unmount` lifecycle contexts.
- Type injected `refs`, `tags`, `on`, and `watch`.
- Type `ElementInternals` availability for form-associated elements.
- Type scheduler, observer, template, and transition utilities according to the actual runtime.
- Type generated refs from `.tags.json` or optional `index.tags.d.ts`.
- Catch misspelled prop names, invalid update value types, invalid ref names where possible, and incorrect handler signatures.
- Preserve ergonomic JavaScript usage through JSDoc-compatible exported types.

## 2. Non-Goals

- No full CSS selector parser in TypeScript. Selector strings remain `string`.
- No compile-time verification that a selector exists in the HTML template unless generated template typings are imported.
- No static guarantee that an arbitrary runtime `tags.one(selector)` is non-null.
- No framework JSX runtime. JSX custom element typing can be added separately.
- No type-level HTML parser inside declarations.

## 3. Public Exports

`@adukiorg/native/ui` must export:

```typescript
export class BaseElement extends HTMLElement {}

export function define<TagName extends string>(
  tagName: TagName,
  elementClass: CustomElementConstructor
): void;

export function element<
  TagName extends string,
  Props extends PropsDefinition = {},
  Refs extends RefsMap = RefsMap,
  Form extends boolean = false
>(
  tagName: TagName,
  spec: ElementSpec<Props, Refs, Form>,
  base?: string | URL
): void;

export function container<
  TagName extends string,
  Props extends PropsDefinition = {},
  Refs extends RefsMap = RefsMap
>(
  tagName: TagName,
  spec: ContainerSpec<Props, Refs>,
  base?: string | URL
): void;

export function schedule<T>(
  fn: () => T | Promise<T>,
  priority?: TaskPriority
): Promise<T>;

export function scheduleFrame<T>(fn: () => T): Promise<T>;

export function yieldTask(): Promise<void>;

export function transition<T>(fn: () => T): Promise<ViewTransitionLike<T>>;

export function template(
  strings: TemplateStringsArray,
  ...values: unknown[]
): DocumentFragment;

export const observe: ObserveApi;

export const ui: UiApi;
```

## 4. Primitive Type Aliases

```typescript
export type TaskPriority = 'user-blocking' | 'user-visible' | 'background';

export type Constructor<T = HTMLElement> = new (...args: any[]) => T;

export type MaybePromise<T> = T | Promise<T>;

export type Disposer = () => void;

export type RefsMap = Record<string, Element>;

export type ElementRefs<T> = {
  [K in keyof T]: Element;
};

export type RefElement = Element;

export type SignalOrOptions<T extends object = {}> =
  | AbortSignal
  | (T & { signal?: AbortSignal; once?: boolean });
```

Rationale:

- `Disposer` is returned by `on.*` and `watch.*`.
- `SignalOrOptions` lets the runtime support both `ctrl.signal` and `{ signal, once }`.
- `RefsMap` defaults to permissive `Record<string, Element>`, but generated template typings can replace it with exact refs.

## 5. Prop Definitions

Runtime props use constructors in config objects:

```javascript
props: {
  disabled: { type: Boolean, default: false, state: true },
  count: { type: Number, default: 0 },
  label: { type: String, default: 'Untitled' }
}
```

Declaration:

```typescript
export type PropConstructor = BooleanConstructor | NumberConstructor | StringConstructor;

export interface PropConfig<T extends PropConstructor = PropConstructor> {
  type: T;
  default?: PropValueFromConstructor<T>;
  state?: boolean;
  reflect?: boolean;
}

export type AnyPropConfig =
  | PropConfig<BooleanConstructor>
  | PropConfig<NumberConstructor>
  | PropConfig<StringConstructor>;

export type PropsDefinition = Record<string, AnyPropConfig>;

export type PropValueFromConstructor<T> =
  T extends BooleanConstructor ? boolean :
  T extends NumberConstructor ? number :
  T extends StringConstructor ? string :
  never;

export type InferProps<Props extends PropsDefinition> = {
  [K in keyof Props]: PropValueFromConstructor<Props[K]['type']>;
};
```

Strictness requirements:

- `default` must match `type`.
- `update({ name, val, prev })` must narrow by prop key.
- `el` in lifecycle methods must expose declared props.

Example expected IDE behavior:

```typescript
ui.element('ui-count', {
  props: {
    count: { type: Number, default: 0 },
    open: { type: Boolean, default: false }
  },
  update(ctx) {
    if (ctx.name === 'count') {
      ctx.val.toFixed(); // ok, number
      ctx.val.trim();    // error
    }
  }
});
```

## 6. Component Host Type

The lifecycle `el` should be the custom element host plus inferred props.

```typescript
export type ComponentHost<Props extends PropsDefinition> =
  HTMLElement & InferProps<Props>;
```

For form-associated elements:

```typescript
export type InternalsFor<Form extends boolean> =
  Form extends true ? ElementInternals : ElementInternals | undefined;
```

This means `internals` is strongly present when `form: true` is statically declared.

## 7. Lifecycle Contexts

```typescript
export interface BaseLifecycleContext<
  Props extends PropsDefinition,
  Refs extends ElementRefs<Refs>,
  Form extends boolean = false
> {
  el: ComponentHost<Props>;
  ctrl: AbortController;
  tags: TagsApi;
  on: EventDelegator;
  refs: Readonly<Refs>;
  watch: WatchApi;
  internals: InternalsFor<Form>;
}

export type MountContext<
  Props extends PropsDefinition,
  Refs extends RefsMap,
  Form extends boolean = false
> = BaseLifecycleContext<Props, Refs, Form>;

export type UnmountContext<
  Props extends PropsDefinition,
  Refs extends RefsMap,
  Form extends boolean = false
> = Pick<
  BaseLifecycleContext<Props, Refs, Form>,
  'el' | 'tags' | 'refs' | 'watch' | 'internals'
>;
```

## 8. Strict Update Context

Update must be a discriminated union by prop key:

```typescript
export type UpdateContext<
  Props extends PropsDefinition,
  Refs extends RefsMap,
  Form extends boolean = false
> = {
  [K in keyof Props & string]:
    BaseLifecycleContext<Props, Refs, Form> & {
      name: K;
      val: PropValueFromConstructor<Props[K]['type']>;
      prev: PropValueFromConstructor<Props[K]['type']>;
      old: PropValueFromConstructor<Props[K]['type']>;
    }
}[keyof Props & string];
```

This gives IDE narrowing:

```typescript
update(ctx) {
  switch (ctx.name) {
    case 'disabled':
      ctx.val.valueOf(); // boolean
      break;
    case 'count':
      ctx.val.toFixed(); // number
      break;
  }
}
```

## 9. Element Spec

```typescript
export interface ElementSpec<
  Props extends PropsDefinition = {},
  Refs extends RefsMap = RefsMap,
  Form extends boolean = false
> {
  template?: string;
  style?: string;
  mode?: ShadowRootMode;
  props?: Props;
  form?: Form;
  url?: string;
  container?: string;
  meta?: Record<string, unknown>;

  mount?: (
    context: MountContext<Props, Refs, Form>
  ) => void | Promise<void>;

  update?: (
    context: UpdateContext<Props, Refs, Form>
  ) => void | Promise<void>;

  unmount?: (
    context: UnmountContext<Props, Refs, Form>
  ) => void;

  methods?: Record<string, (...args: any[]) => any>;
}
```

Strictness details:

- `props` is optional and defaults to `{}`.
- `mount` and `update` may be async, but errors are not swallowed by the type system.
- `form: true` narrows `internals` to `ElementInternals`.
- `Refs` can be supplied manually or generated. Exact ref interfaces do not need a string index signature; every declared ref value only needs to extend `Element`.

Manual refs typing:

```typescript
interface ButtonRefs {
  button: HTMLButtonElement;
  status: HTMLSpanElement;
}

ui.element<'ui-button', typeof props, ButtonRefs>('ui-button', {
  props,
  mount({ refs }) {
    refs.button.disabled = true; // ok
    refs.missing;                // error
  }
});
```

## 10. Container Spec

Containers share the element spec but have router layout behavior.

```typescript
export type ContainerHost<Props extends PropsDefinition> =
  ComponentHost<Props> & {
    swapView(newElement: Element, options?: SwapViewOptions): Promise<void>;
  };

export interface SwapViewOptions {
  direction?: 'push' | 'pop' | 'replace' | string;
  params?: Record<string, string>;
}

export type ContainerMountContext<
  Props extends PropsDefinition,
  Refs extends RefsMap
> = Omit<MountContext<Props, Refs, false>, 'el'> & {
  el: ContainerHost<Props>;
};

export interface ContainerSpec<
  Props extends PropsDefinition = {},
  Refs extends RefsMap = RefsMap
> extends Omit<ElementSpec<Props, Refs, false>, 'mount' | 'update' | 'unmount' | 'form'> {
  mount?: (context: ContainerMountContext<Props, Refs>) => void | Promise<void>;
  update?: (context: UpdateContext<Props, Refs, false>) => void | Promise<void>;
  unmount?: (context: UnmountContext<Props, Refs, false>) => void;
}
```

## 11. `tags` API

```typescript
export interface TagsApi {
  one<E extends Element = Element>(selector: string): E | null;
  all<E extends Element = Element>(selector: string): E[];
  each<E extends Element = Element>(
    selector: string,
    fn: (element: E, index: number) => void
  ): void;
  has(selector: string): boolean;
  clear(): void;
}
```

Usage:

```typescript
const button = tags.one<HTMLButtonElement>('button');
button?.disabled = true;

const inputs = tags.all<HTMLInputElement>('input');
```

Why generic selectors:

- TypeScript cannot reliably infer element type from arbitrary CSS selectors.
- Explicit generic arguments are simple and honest.
- Generated refs should be preferred for strongly typed stable elements.

## 12. `refs` Typing

Default:

```typescript
refs: Readonly<Record<string, Element>>;
```

Strict generated form:

```typescript
export interface TemplateRefs {
  button: HTMLButtonElement;
  status: HTMLSpanElement;
}
```

Generated `index.tags.d.ts` should export:

```typescript
export interface TemplateRefs {
  readonly button: HTMLButtonElement;
  readonly status: HTMLSpanElement;
}

export type TemplateRefName = keyof TemplateRefs;
```

Component author usage:

```typescript
import type { TemplateRefs } from './index.tags';

ui.element<'ui-button', typeof props, TemplateRefs>('ui-button', {
  props,
  mount({ refs }) {
    refs.button.disabled = false;
  }
}, import.meta.url);
```

## 13. `on` Event Delegator

Runtime usage:

```javascript
on.click('button', handler)
on.click('button', handler, ctrl.signal)
on.click('button', handler, { signal: ctrl.signal, once: true })
on.click.once('button', handler)
on['nav:change']('[data-tab]', handler)
```

Types:

```typescript
export interface DelegatedEventOptions extends AddEventListenerOptions {
  signal?: AbortSignal;
  once?: boolean;
}

export type DelegatedEventHandler<
  EventType extends Event = Event,
  Target extends Element = Element
> = (event: EventType, target: Target) => void;

export interface DelegatedEventBinder<EventType extends Event = Event> {
  <Target extends Element = Element>(
    selector: string,
    handler: DelegatedEventHandler<EventType, Target>,
    options?: AbortSignal | DelegatedEventOptions
  ): Disposer;

  once<Target extends Element = Element>(
    selector: string,
    handler: DelegatedEventHandler<EventType, Target>,
    options?: AbortSignal | Omit<DelegatedEventOptions, 'once'>
  ): Disposer;
}

export type EventDelegator = {
  [K in keyof GlobalEventHandlersEventMap]: DelegatedEventBinder<GlobalEventHandlersEventMap[K]>;
} & {
  [customEvent: string]: DelegatedEventBinder<Event>;
};
```

Usage:

```typescript
on.click<HTMLButtonElement>('button', (event, button) => {
  event.clientX;      // MouseEvent
  button.disabled;    // HTMLButtonElement
});

on.input<HTMLInputElement>('input', (event, input) => {
  input.value;
});
```

## 14. `watch` API

```typescript
export interface WatchOptions {
  signal?: AbortSignal;
  once?: boolean;
}

export type WatchTarget<T extends Element = Element> = string | T;

export type AttrWatchHandler<T extends Element = Element> = (
  attrName: string,
  newValue: string | null,
  oldValue: string | null,
  element: T
) => void;

export type KidsWatchHandler<T extends Element = Element> = (
  change: {
    added: Node[];
    removed: Node[];
  },
  element: T
) => void;

export type TextWatchHandler<T extends Element = Element> = (
  newText: string,
  oldText: string | null,
  element: T | null
) => void;

export type TreeWatchHandler<T extends Element = Element> = (
  records: MutationRecord[],
  element: T | null
) => void;

export interface WatchMethod<Args extends any[]> {
  (...args: Args): Disposer;
  once(...args: Args): Disposer;
}
```

Concrete API:

```typescript
export interface WatchApi {
  attr: {
    <T extends Element = Element>(
      target: WatchTarget<T>,
      attr: string | readonly string[] | '*',
      handler: AttrWatchHandler<T>,
      options?: AbortSignal | WatchOptions
    ): Disposer;

    once<T extends Element = Element>(
      target: WatchTarget<T>,
      attr: string | readonly string[] | '*',
      handler: AttrWatchHandler<T>,
      options?: AbortSignal | Omit<WatchOptions, 'once'>
    ): Disposer;
  };

  kids: {
    <T extends Element = Element>(
      target: WatchTarget<T>,
      handler: KidsWatchHandler<T>,
      options?: AbortSignal | WatchOptions
    ): Disposer;

    <T extends Element = Element>(
      target: WatchTarget<T>,
      config: { deep?: boolean },
      handler: KidsWatchHandler<T>,
      options?: AbortSignal | WatchOptions
    ): Disposer;

    once<T extends Element = Element>(
      target: WatchTarget<T>,
      handler: KidsWatchHandler<T>,
      options?: AbortSignal | Omit<WatchOptions, 'once'>
    ): Disposer;

    once<T extends Element = Element>(
      target: WatchTarget<T>,
      config: { deep?: boolean },
      handler: KidsWatchHandler<T>,
      options?: AbortSignal | Omit<WatchOptions, 'once'>
    ): Disposer;
  };

  text: {
    <T extends Element = Element>(
      target: WatchTarget<T>,
      handler: TextWatchHandler<T>,
      options?: AbortSignal | WatchOptions
    ): Disposer;

    once<T extends Element = Element>(
      target: WatchTarget<T>,
      handler: TextWatchHandler<T>,
      options?: AbortSignal | Omit<WatchOptions, 'once'>
    ): Disposer;
  };

  tree: {
    <T extends Element = Element>(
      target: WatchTarget<T>,
      handler: TreeWatchHandler<T>,
      options?: AbortSignal | WatchOptions
    ): Disposer;

    once<T extends Element = Element>(
      target: WatchTarget<T>,
      handler: TreeWatchHandler<T>,
      options?: AbortSignal | Omit<WatchOptions, 'once'>
    ): Disposer;
  };
}
```

## 15. Observer API

Runtime signatures from `observe.js`:

```typescript
export interface ObserveApi {
  resize(
    el: Element,
    fn: (entries: ResizeObserverEntry[]) => void,
    signal?: AbortSignal
  ): Disposer;

  intersection(
    el: Element,
    fn: (entries: IntersectionObserverEntry[]) => void,
    signal?: AbortSignal,
    options?: IntersectionObserverInit
  ): Disposer;

  mutation(
    el: Node,
    fn: (mutations: MutationRecord[]) => void,
    signal?: AbortSignal,
    options?: MutationObserverInit
  ): Disposer;

  performance(
    types: string[],
    fn: (list: PerformanceObserverEntryList) => void,
    signal?: AbortSignal,
    options?: PerformanceObserverInit
  ): Disposer;
}
```

Important correction from old declarations:

- `resize` callback receives `ResizeObserverEntry[]`, not one entry.
- The exported method is `intersection`, not `intersect`.
- `mutation` accepts `signal` before `options`.

## 16. Scheduler API

Runtime signatures:

```typescript
export function schedule<T>(
  fn: () => T | Promise<T>,
  priority?: TaskPriority
): Promise<T>;

export function scheduleFrame<T>(fn: () => T): Promise<T>;

export function yieldTask(): Promise<void>;
```

`ui.yield` should be typed as `typeof yieldTask`.

## 17. Transition API

Runtime `transition` accepts a callback, not keyframes:

```typescript
export interface ViewTransitionLike<T = unknown> {
  finished: Promise<T>;
  updateCallbackDone: Promise<T>;
  ready: Promise<unknown>;
  skipTransition(): void;
}

export function transition<T>(
  fn: () => T
): Promise<ViewTransitionLike<T>>;
```

Why not use the built-in `ViewTransition` type only:

- Some environments may not include the newest DOM lib.
- The runtime returns a compatible fallback object when unsupported or reduced-motion is active.

## 18. Template API

Runtime `template` returns a cloned `DocumentFragment`:

```typescript
export function template(
  strings: TemplateStringsArray,
  ...values: unknown[]
): DocumentFragment;
```

Important correction from old declarations:

- It does not return `HTMLTemplateElement`.
- Interpolated values are currently ignored by runtime implementation, so `unknown[]` is safer than implying string interpolation.

## 19. `ui` Object Type

```typescript
export interface UiApi {
  define: typeof define;
  element: typeof element;
  container: typeof container;
  schedule: typeof schedule;
  scheduleFrame: typeof scheduleFrame;
  yield: typeof yieldTask;
  transition: typeof transition;
  template: typeof template;
  observe: ObserveApi;
}

export const ui: UiApi;
```

## 20. Generated Type Strategy

The Rust scanner should eventually generate `index.tags.d.ts` alongside `index.tags.json`.

Input:

```html
<button ref="button" id="button"></button>
<span ref="status"></span>
<input ref="email" type="email" />
```

Output:

```typescript
/* Auto-generated by native-tools. Do not edit. */

export interface TemplateRefs {
  readonly button: HTMLButtonElement;
  readonly email: HTMLInputElement;
  readonly status: HTMLSpanElement;
}

export type TemplateRefName = keyof TemplateRefs;
```

Type inference source:

- `button` -> `HTMLButtonElement`
- `input` -> `HTMLInputElement`
- `form` -> `HTMLFormElement`
- Unknown custom tags -> `HTMLElement`

## 21. JSDoc Consumer Pattern

Plain JavaScript component files can opt into strict IDE types:

```javascript
// @ts-check
import { ui } from '@adukiorg/native/ui';

/** @type {const} */
const props = {
  disabled: { type: Boolean, default: false },
  count: { type: Number, default: 0 }
};

/** @typedef {import('./index.tags').TemplateRefs} TemplateRefs */

ui.element('ui-counter', {
  props,

  /** @param {import('@adukiorg/native/ui').MountContext<typeof props, TemplateRefs>} ctx */
  mount({ refs, on }) {
    refs.button.disabled = false;
    on.click('button', (_event, button) => {
      button.disabled = true;
    });
  },

  /** @param {import('@adukiorg/native/ui').UpdateContext<typeof props, TemplateRefs>} ctx */
  update(ctx) {
    if (ctx.name === 'count') {
      ctx.val.toFixed();
    }
  }
}, import.meta.url);
```

## 22. Type Test Cases

Use `tsd`, `vitest` with `expectTypeOf`, or a `tsc --noEmit` fixture.

Required pass cases:

```typescript
ui.element('ui-a', {
  props: {
    count: { type: Number, default: 0 },
    open: { type: Boolean, default: false },
    label: { type: String, default: '' }
  },
  mount({ el }) {
    el.count.toFixed();
    el.open.valueOf();
    el.label.trim();
  }
});
```

Required fail cases:

```typescript
ui.element('ui-bad', {
  props: {
    count: { type: Number, default: 'wrong' } // error
  }
});

ui.element('ui-bad-update', {
  props: {
    count: { type: Number, default: 0 }
  },
  update(ctx) {
    if (ctx.name === 'count') {
      ctx.val.trim(); // error
    }
  }
});
```

## 23. Strict `tsconfig` Recommendation

For validating declarations:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "checkJs": true,
    "allowJs": true,
    "noEmit": true,
    "skipLibCheck": false
  }
}
```

## 24. Implementation Order

1. Replace `types/core/ui/index.d.ts` with declarations matching this document.
2. Export all public utility types from that declaration file.
3. Add a `typesVersions` or package `types` entry if package consumers do not already resolve `types/index.d.ts`.
4. Add type tests for `ui.element`, props, refs, `on`, `watch`, observe, transition, and template.
5. Extend Rust scanner to emit `index.tags.d.ts`.
6. Update `usage.md` with a short "Typing Components" section linking this file.

## 25. Known Declaration Corrections Needed

The previous `types/core/ui/index.d.ts` was corrected:

- Remove stale `BaseElement.$`, `BaseElement.$$`, and `emit` unless the runtime implements them.
- Add `element` and `container`.
- Correct `transition` from animation keyframes to callback-based View Transition wrapper.
- Correct `template` return type to `DocumentFragment`.
- Correct `observe.resize` callback to entry arrays.
- Correct `observe.intersection` name.
- Add `observe.performance`.
- Add `TagsApi`, `EventDelegator`, `WatchApi`, lifecycle contexts, prop inference, and `ElementSpec`.
- Add `ui.observe.performance`, `ui.element`, and `ui.container`.
