/**
 * types/core/ui/index.d.ts
 *
 * Strict TypeScript declarations for the Native UI runtime.
 */

export type TaskPriority = 'user-blocking' | 'user-visible' | 'background';

export type MaybePromise<T> = T | Promise<T>;

export type Disposer = () => void;

export type RefsMap = Record<string, Element>;

export type ElementRefs<T> = {
  [K in keyof T]: Element;
};

export type PropConstructor =
  | BooleanConstructor
  | NumberConstructor
  | StringConstructor;

export type PropValueFromConstructor<T> =
  T extends BooleanConstructor ? boolean :
  T extends NumberConstructor ? number :
  T extends StringConstructor ? string :
  never;

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

export type InferProps<Props extends PropsDefinition> = {
  [K in keyof Props]: PropValueFromConstructor<Props[K]['type']>;
};

export type ComponentHost<Props extends PropsDefinition = {}> =
  HTMLElement & InferProps<Props>;

export type InternalsFor<Form extends boolean> =
  Form extends true ? ElementInternals : ElementInternals | undefined;

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

export interface BaseLifecycleContext<
  Props extends PropsDefinition = {},
  Refs extends ElementRefs<Refs> = RefsMap,
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
  Props extends PropsDefinition = {},
  Refs extends ElementRefs<Refs> = RefsMap,
  Form extends boolean = false
> = BaseLifecycleContext<Props, Refs, Form>;

export type UpdateContext<
  Props extends PropsDefinition = {},
  Refs extends ElementRefs<Refs> = RefsMap,
  Form extends boolean = false
> = keyof Props extends never
  ? never
  : {
      [K in keyof Props & string]:
        BaseLifecycleContext<Props, Refs, Form> & {
          name: K;
          val: PropValueFromConstructor<Props[K]['type']>;
          prev: PropValueFromConstructor<Props[K]['type']>;
          old: PropValueFromConstructor<Props[K]['type']>;
        }
    }[keyof Props & string];

export type UnmountContext<
  Props extends PropsDefinition = {},
  Refs extends ElementRefs<Refs> = RefsMap,
  Form extends boolean = false
> = Pick<
  BaseLifecycleContext<Props, Refs, Form>,
  'el' | 'tags' | 'refs' | 'watch' | 'internals'
>;

export interface ElementSpec<
  Props extends PropsDefinition = {},
  Refs extends ElementRefs<Refs> = RefsMap,
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
  ) => MaybePromise<void>;

  update?: (
    context: UpdateContext<Props, Refs, Form>
  ) => MaybePromise<void>;

  unmount?: (
    context: UnmountContext<Props, Refs, Form>
  ) => void;

  methods?: Record<string, (...args: any[]) => any>;
}

export interface SwapViewOptions {
  direction?: 'push' | 'pop' | 'replace' | string;
  params?: Record<string, string>;
}

export type ContainerHost<Props extends PropsDefinition = {}> =
  ComponentHost<Props> & {
    swapView(newElement: Element, options?: SwapViewOptions): Promise<void>;
  };

export type ContainerMountContext<
  Props extends PropsDefinition = {},
  Refs extends ElementRefs<Refs> = RefsMap
> = Omit<MountContext<Props, Refs, false>, 'el'> & {
  el: ContainerHost<Props>;
};

export interface ContainerSpec<
  Props extends PropsDefinition = {},
  Refs extends ElementRefs<Refs> = RefsMap
> extends Omit<
  ElementSpec<Props, Refs, false>,
  'mount' | 'update' | 'unmount' | 'form'
> {
  mount?: (
    context: ContainerMountContext<Props, Refs>
  ) => MaybePromise<void>;

  update?: (
    context: UpdateContext<Props, Refs, false>
  ) => MaybePromise<void>;

  unmount?: (
    context: UnmountContext<Props, Refs, false>
  ) => void;
}

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

export interface ViewTransitionLike<T = unknown> {
  finished: Promise<T>;
  updateCallbackDone: Promise<T>;
  ready: Promise<unknown>;
  skipTransition(): void;
}

export class BaseElement extends HTMLElement {
  ctrl: AbortController | null;

  constructor();
  connectedCallback(): void;
  disconnectedCallback(): void;
  mount(): void;
  unmount(): void;
}

export function define<TagName extends string>(
  tagName: TagName,
  elementClass: CustomElementConstructor
): void;

export function element<
  TagName extends string,
  Props extends PropsDefinition = {},
  Refs extends ElementRefs<Refs> = RefsMap,
  Form extends boolean = false
>(
  tagName: TagName,
  spec: ElementSpec<Props, Refs, Form>,
  base?: string | URL
): void;

export function container<
  TagName extends string,
  Props extends PropsDefinition = {},
  Refs extends ElementRefs<Refs> = RefsMap
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

export function transition<T>(
  fn: () => T
): Promise<ViewTransitionLike<T>>;

export function template(
  strings: TemplateStringsArray,
  ...values: unknown[]
): DocumentFragment;

export const observe: ObserveApi;

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
