/**
 * types/core/animations/index.d.ts
 *
 * TypeScript declarations for the WAAPI animations and staggers layer.
 */

export interface StaggerGroup {
  animations: Animation[];
  cancel(): void;
  finish(): void;
  finished: Promise<Animation[]>;
}

export function animate(
  el: HTMLElement,
  animationInput: string | Keyframe[] | PropertyIndexedKeyframes,
  options?: KeyframeAnimationOptions & { signal?: AbortSignal }
): Animation;

export function stagger(
  elements: HTMLElement[] | NodeListOf<HTMLElement>,
  animationInput: string | Keyframe[] | PropertyIndexedKeyframes,
  options?: KeyframeAnimationOptions & { staggerDelay?: number; signal?: AbortSignal }
): StaggerGroup;

export function scroll(
  el: HTMLElement,
  animationInput: string | Keyframe[] | PropertyIndexedKeyframes,
  options?: any
): Animation;

export function view(
  el: HTMLElement,
  animationInput: string | Keyframe[] | PropertyIndexedKeyframes,
  options?: any
): Animation;

export const registry: {
  register(name: string, keyframes: Keyframe[] | PropertyIndexedKeyframes, options?: KeyframeAnimationOptions): void;
  get(name: string): { keyframes: Keyframe[] | PropertyIndexedKeyframes; options: KeyframeAnimationOptions } | null;
};

export const animations: {
  register: typeof registry.register;
  animate: typeof animate;
  stagger: typeof stagger;
  scroll: typeof scroll;
  view: typeof view;
  Timing: any;
  timing: any;
  keyframes: any;
};
