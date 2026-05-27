/**
 * src/core/workers/offscreen.js
 *
 * OffscreenCanvas Transfer Lifecycle.
 * Hands over control of active main-thread HTML Canvas elements to background Web Workers
 * for off-main-thread high-framerate rendering.
 *
 * Source: doc 21 — Worker Architecture §8
 */

export class OffscreenHandle {
  constructor(canvas, workerUrl) {
    this.canvas = canvas;
    this.workerUrl = workerUrl;
    this.worker = null;
  }

  /**
   * Transfers ownership of the Canvas control pipeline to the worker thread.
   */
  transfer() {
    if (typeof OffscreenCanvas === 'undefined' || !this.canvas.transferControlToOffscreen) {
      console.warn('OffscreenCanvas is not supported in this environment. Falling back to default rendering.');
      return null;
    }

    try {
      const offscreen = this.canvas.transferControlToOffscreen();
      this.worker = new Worker(this.workerUrl, { type: 'module' });

      // Transfer ownership of the OffscreenCanvas object
      this.worker.postMessage({ canvas: offscreen }, [offscreen]);
      return this.worker;
    } catch (err) {
      console.error('Failed to transfer control to OffscreenCanvas:', err);
      return null;
    }
  }

  /**
   * Terminates the background worker thread.
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

/**
 * Convenience helper to instantiate and automatically transfer an OffscreenCanvas handle.
 */
export function offscreen(canvas, workerUrl) {
  const handle = new OffscreenHandle(canvas, workerUrl);
  handle.transfer();
  return handle;
}
