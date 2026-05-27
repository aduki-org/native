/**
 * types/core/ui/index.d.ts
 *
 * TypeScript declarations for the custom elements base class and UI utilities.
 */

export class BaseElement extends HTMLElement {
  static get template(): string;
  static get styles(): string;

  constructor();
  connectedCallback(): void;
  disconnectedCallback(): void;
  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;

  /**
   * Safe DOM queries querying the Shadow Root context.
   */
  $(selector: string): HTMLElement | null;
  $$(selector: string): NodeListOf<HTMLElement>;

  /**
   * Dispatches a custom DOM event.
   */
  emit(type: string, detail?: any, options?: CustomEventInit): void;
}

export function define(tagName: string, elementClass: CustomElementConstructor): void;

export function schedule(task: () => void | Promise<void>, priority?: 'user-blocking' | 'user-visible' | 'background'): Promise<void>;
export function scheduleFrame(task: () => void): void;
export function yieldTask(): Promise<void>;

export function transition(
  el: HTMLElement,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options?: number | KeyframeAnimationOptions
): Promise<Animation>;

export const observe: {
  resize(el: HTMLElement, fn: (entry: ResizeObserverEntry) => void, options?: ResizeObserverOptions): () => void;
  intersect(el: HTMLElement, fn: (entry: IntersectionObserverEntry) => void, options?: IntersectionObserverInit): () => void;
  mutation(el: HTMLElement, fn: (mutations: MutationRecord[]) => void, options?: MutationObserverInit): () => void;
};

export const ui: {
  define: typeof define;
  schedule: typeof schedule;
  scheduleFrame: typeof scheduleFrame;
  yield: typeof yieldTask;
  transition: typeof transition;
  template(strings: TemplateStringsArray, ...values: any[]): HTMLTemplateElement;
  observe: typeof observe;
};
