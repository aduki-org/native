/**
 * src/core/workers/broadcast.js
 *
 * BroadcastChannel Manager.
 * Implements a highly memory-safe, reference-counted BroadcastChannel manager
 * that automatically initializes channels on subscription and closes them
 * as soon as active listener counts drop to zero.
 *
 * Source: doc 21 — Worker Architecture §6
 */

class BroadcastManager {
  #channels = new Map();
  #listeners = new Map();

  /**
   * Dispatches a single message over a named channel and immediately cleans up the temp port.
   */
  broadcast(channelName, message) {
    // If we already have a channel open with subscribers, use it to avoid recreation
    const active = this.#channels.get(channelName);
    if (active) {
      active.postMessage(message);
      return;
    }

    // Otherwise, create a temporary channel, send, and close
    const temp = new BroadcastChannel(channelName);
    temp.postMessage(message);
    temp.close();
  }

  /**
   * Subscribes to a channel. Closes channel when listeners hit 0.
   */
  subscribe(channelName, fn, signal) {
    if (signal?.aborted) return () => {};

    if (!this.#channels.has(channelName)) {
      this.#channels.set(channelName, new BroadcastChannel(channelName));
      this.#listeners.set(channelName, new Set());
    }

    const channel = this.#channels.get(channelName);
    const listeners = this.#listeners.get(channelName);

    const listener = (event) => {
      try {
        fn(event.data);
      } catch (err) {
        console.error(`Error in BroadcastChannel "${channelName}" subscriber:`, err);
      }
    };

    channel.addEventListener('message', listener);
    listeners.add(listener);

    const dispose = () => {
      channel.removeEventListener('message', listener);
      listeners.delete(listener);

      if (listeners.size === 0) {
        channel.close();
        this.#channels.delete(channelName);
        this.#listeners.delete(channelName);
      }
    };

    if (signal) {
      signal.addEventListener('abort', dispose);
    }

    return dispose;
  }
}

export const broadcast = new BroadcastManager();
