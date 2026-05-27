/**
 * src/core/workers/dedicated.js
 *
 * Dedicated Worker Wrapper.
 * Manages the lifecycle of standard background dedicated Workers, using
 * native MessageChannel per request for isolated, concurrent execution corridors
 * without message cross-contamination.
 *
 * Source: doc 21 — Worker Architecture §2
 */

export class DedicatedWorker {
  constructor(scriptUrl) {
    this.scriptUrl = scriptUrl;
    this.worker = new Worker(scriptUrl, { type: 'module' });
  }

  /**
   * Dispatches a task to the worker, returning a promise resolved by the channel port.
   */
  run(task, payload = null, transferables = []) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port1.onmessage = (e) => {
        channel.port1.close();
        const { success, result, error } = e.data;
        if (success) {
          resolve(result);
        } else {
          reject(new Error(error || 'Worker task failed'));
        }
      };

      channel.port1.onmessageerror = () => {
        channel.port1.close();
        reject(new Error('Deserialization error on message channel'));
      };

      // Ship the port and user transferables to the worker thread
      this.worker.postMessage(
        { task, payload, port: channel.port2 },
        [channel.port2, ...transferables]
      );
    });
  }

  /**
   * Instantly stops the running worker thread.
   */
  terminate() {
    this.worker.terminate();
  }
}
