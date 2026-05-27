/**
 * types/core/events/index.d.ts
 *
 * TypeScript declarations for the native event orchestration layer.
 */

export class EventBus {
  on(type: string, fn: (event: CustomEvent) => void, signal?: AbortSignal): () => void;
  emit(type: string, detail?: any): void;
}

export const bus: EventBus;

export function delegate(
  root: HTMLElement | ShadowRoot,
  selector: string,
  type: string,
  fn: (event: Event, target: HTMLElement) => void,
  options?: boolean | AddEventListenerOptions
): () => void;

export function once(
  target: EventTarget,
  type: string,
  options?: boolean | AddEventListenerOptions
): Promise<Event>;

export const events: {
  emit(type: string, detail?: any): void;
  on(type: string, fn: (event: CustomEvent) => void, signal?: AbortSignal): () => void;
  delegate: typeof delegate;
  once: typeof once;
};
