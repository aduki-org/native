/**
 * src/core/animations/waapi.js
 *
 * WAAPI Easing Curves and Keyframe Helpers.
 * Provides curated cubic-bezier timing curves and dynamic keyframe templates
 * for rapid premium animation assemblies.
 *
 * Source: doc 03 — Native CSS Architecture §6, doc 12 — Performance §4
 */

export const Timing = {
  EASE: 'ease',
  EASE_IN: 'ease-in',
  EASE_OUT: 'ease-out',
  EASE_IN_OUT: 'ease-in-out',
  LINEAR: 'linear',
  FAST: 'cubic-bezier(0.19, 1, 0.22, 1)',
  SMOOTH: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
  BOUNCE: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
};

/**
 * Convenience helper to format WAAPI timing descriptors.
 */
export function timing(duration = 300, easing = Timing.SMOOTH, fill = 'both') {
  return { duration, easing, fill };
}

/**
 * Builds keyframe arrays for common transition templates.
 */
export function keyframes(type, options = {}) {
  if (type === 'fade') {
    return [
      { opacity: options.from ?? 0 },
      { opacity: options.to ?? 1 }
    ];
  }

  if (type === 'slide') {
    const axis = options.axis ?? 'y';
    const amount = options.from ?? '20px';
    const transformFrom = axis === 'x' ? `translateX(${amount})` : `translateY(${amount})`;

    return [
      { transform: transformFrom, opacity: 0 },
      { transform: 'translate(0, 0)', opacity: 1 }
    ];
  }

  if (type === 'scale') {
    return [
      { transform: `scale(${options.from ?? 0.95})`, opacity: 0 },
      { transform: 'scale(1)', opacity: 1 }
    ];
  }

  return [];
}
