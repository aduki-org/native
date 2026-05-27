/**
 * src/core/offline/bridge.js
 *
 * Service Worker Message Bridge.
 * Establishes a highly concurrent messaging corridor between the main window context
 * and the active Service Worker using native MessageChannel instances for direct response routing.
 *
 * Source: doc 13 — Offline and Background §3
 */

export class ServiceWorkerBridge {
  /**
   * Dispatches a message to the active Service Worker controller, returning a promise.
   */
  send(task, payload = null) {
    if (
      typeof navigator === 'undefined' ||
      !navigator.serviceWorker ||
      !navigator.serviceWorker.controller
    ) {
      return Promise.reject(new Error('Active Service Worker controller not found'));
    }

    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port1.onmessage = (event) => {
        channel.port1.close();
        const { success, result, error } = event.data;
        if (success) {
          resolve(result);
        } else {
          reject(new Error(error || 'Service Worker message task failed'));
        }
      };

      channel.port1.onmessageerror = () => {
        channel.port1.close();
        reject(new Error('Deserialization error on Service Worker message channel'));
      };

      // Direct message post using the target port transferable
      navigator.serviceWorker.controller.postMessage(
        { task, payload, port: channel.port2 },
        [channel.port2]
      );
    });
  }
}

export const bridge = new ServiceWorkerBridge();
