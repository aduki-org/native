/**
 * core/platform/polyfills/anchor.js
 *
 * Lightweight CSS Anchor Positioning positional fallback.
 * Computes optimal absolute top/left coordinates based on placement rules and viewport collisions.
 * Source: doc 18 §12, library2.md §Phase 1-A
 */

export function position(floating, anchor, options = {}) {
  if (!floating || !anchor) return;

  const placement = options.placement || 'bottom-start';
  const offset = options.offset || 8;

  const anchorRect = anchor.getBoundingClientRect();
  const floatRect = floating.getBoundingClientRect();

  const scrollY = globalThis.scrollY || globalThis.pageYOffset || 0;
  const scrollX = globalThis.scrollX || globalThis.pageXOffset || 0;

  const anchorTop = anchorRect.top + scrollY;
  const anchorLeft = anchorRect.left + scrollX;

  let top = 0;
  let left = 0;

  switch (placement) {
    case 'bottom-start':
      top = anchorTop + anchorRect.height + offset;
      left = anchorLeft;
      break;
    case 'bottom-end':
      top = anchorTop + anchorRect.height + offset;
      left = anchorLeft + anchorRect.width - floatRect.width;
      break;
    case 'top-start':
      top = anchorTop - floatRect.height - offset;
      left = anchorLeft;
      break;
    case 'top-end':
      top = anchorTop - floatRect.height - offset;
      left = anchorLeft + anchorRect.width - floatRect.width;
      break;
    case 'right-start':
      top = anchorTop;
      left = anchorLeft + anchorRect.width + offset;
      break;
    case 'left-start':
      top = anchorTop;
      left = anchorLeft - floatRect.width - offset;
      break;
    default:
      top = anchorTop + anchorRect.height + offset;
      left = anchorLeft;
  }

  // Viewport containment checking
  const viewportWidth = globalThis.innerWidth || 0;
  const viewportHeight = globalThis.innerHeight || 0;

  if (left < scrollX) {
    left = scrollX;
  }
  if (left + floatRect.width > scrollX + viewportWidth) {
    left = Math.max(scrollX, scrollX + viewportWidth - floatRect.width);
  }
  if (top < scrollY) {
    top = scrollY;
  }
  if (top + floatRect.height > scrollY + viewportHeight) {
    top = Math.max(scrollY, scrollY + viewportHeight - floatRect.height);
  }

  floating.style.position = 'absolute';
  floating.style.top = `${top}px`;
  floating.style.left = `${left}px`;
}

export default { position };
