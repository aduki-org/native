/**
 * src/core/animations/scroll.js
 *
 * Scroll-Driven Animations Wrapper.
 * Exposes native browser ScrollTimeline and ViewTimeline constructors for scroll-linked animations,
 * with standard static fallback descriptors for unsupported engines.
 *
 * Source: doc 03 — Native CSS Architecture §6, doc 12 — Performance §4
 */

/**
 * Creates a ScrollTimeline instance or returns a fallback descriptor.
 */
export function scroll(options = {}) {
  if (typeof ScrollTimeline !== 'undefined') {
    try {
      return new ScrollTimeline(options);
    } catch (err) {
      console.warn('ScrollTimeline constructor failed:', err);
    }
  }

  // Resilient descriptor fallback for older browser runtimes
  return {
    source: options.source ?? (typeof document !== 'undefined' ? document.documentElement : null),
    axis: options.axis ?? 'block',
    unsupported: true
  };
}

/**
 * Creates a ViewTimeline instance or returns a fallback descriptor.
 */
export function view(options = {}) {
  if (typeof ViewTimeline !== 'undefined') {
    try {
      return new ViewTimeline(options);
    } catch (err) {
      console.warn('ViewTimeline constructor failed:', err);
    }
  }

  // Resilient descriptor fallback for older browser runtimes
  return {
    subject: options.subject ?? null,
    axis: options.axis ?? 'block',
    inset: options.inset ?? '0px',
    unsupported: true
  };
}
