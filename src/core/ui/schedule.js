/**
 * src/core/ui/schedule.js
 *
 * Cooperative Browser Task Scheduler.
 * Wraps browser scheduler primitives (postTask and yield) with progressive fallbacks
 * to prevent main thread blocking, ensuring high Interaction to Next Paint (INP).
 *
 * Source: doc 12 — Performance §2, doc 19 — Browser Runtime Model §3
 */

export const Priority = {
  BLOCKING: 'user-blocking',
  VISIBLE: 'user-visible',
  BACKGROUND: 'background'
};

/**
 * Schedules a callback using scheduler.postTask, falling back safely.
 */
export function schedule(fn, priority = Priority.VISIBLE) {
  if (typeof window !== 'undefined' && window.scheduler?.postTask) {
    return window.scheduler.postTask(fn, { priority });
  }

  // Graceful fallback to micro/macro-task scheduling
  return new Promise((resolve, reject) => {
    try {
      if (priority === Priority.BACKGROUND && typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => resolve(fn()));
      } else {
        const latency = priority === Priority.BLOCKING ? 0 : 16;
        setTimeout(() => resolve(fn()), latency);
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Schedules a callback to be run during requestAnimationFrame.
 */
export function scheduleFrame(fn) {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve(fn());
    });
  });
}

/**
 * Cooperative yielding mechanism for chunking heavy computations.
 */
export async function yieldTask() {
  if (typeof window !== 'undefined' && window.scheduler?.yield) {
    return window.scheduler.yield();
  }
  // Fallback yield through macro-task loop
  return new Promise((resolve) => setTimeout(resolve, 0));
}
