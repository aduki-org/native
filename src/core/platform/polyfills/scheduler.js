/**
 * src/core/platform/polyfills/scheduler.js
 *
 * Priority-Aware Task Scheduling Polyfill.
 * Implements WICG Prioritized Task Scheduling specification interfaces
 * (scheduler.postTask and scheduler.yield) for browsers lacking native support.
 *
 * Source: doc 19 — Browser Runtime Model §16
 */

let currentPriority = null;

// Standard Priority Hierarchy
const Priorities = {
  'user-blocking': 3,
  'user-visible':  2,
  'background':    1
};

// Queue structures
const queues = {
  'user-blocking': [],
  'user-visible':  [],
  'background':    []
};

let activeLoop = false;

// High-speed macrotask queue using MessageChannel (bypasses 4ms setTimeout limit)
const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const macrotaskQueue = [];

if (channel) {
  channel.port1.onmessage = () => {
    const next = macrotaskQueue.shift();
    if (next) next();
  };
}

function enqueueMacrotask(callback) {
  if (channel) {
    macrotaskQueue.push(callback);
    channel.port2.postMessage('');
  } else {
    setTimeout(callback, 0);
  }
}

/**
 * Core loop that processes prioritized tasks.
 */
function processQueues() {
  // Find highest priority non-empty queue
  let selectedPriority = null;
  if (queues['user-blocking'].length > 0) {
    selectedPriority = 'user-blocking';
  } else if (queues['user-visible'].length > 0) {
    selectedPriority = 'user-visible';
  } else if (queues['background'].length > 0) {
    selectedPriority = 'background';
  }

  if (!selectedPriority) {
    activeLoop = false;
    return;
  }

  activeLoop = true;
  const task = queues[selectedPriority].shift();

  const runTask = () => {
    if (task.signal?.aborted) {
      task.reject(new DOMException('The user aborted a request.', 'AbortError'));
      processQueues();
      return;
    }

    const previousPriority = currentPriority;
    currentPriority = selectedPriority;

    try {
      const result = task.callback();
      if (result instanceof Promise) {
        result.then(
          (val) => {
            currentPriority = previousPriority;
            task.resolve(val);
            processQueues();
          },
          (err) => {
            currentPriority = previousPriority;
            task.reject(err);
            processQueues();
          }
        );
      } else {
        currentPriority = previousPriority;
        task.resolve(result);
        processQueues();
      }
    } catch (err) {
      currentPriority = previousPriority;
      task.reject(err);
      processQueues();
    }
  };

  // Schedule task execution based on its priority
  if (selectedPriority === 'user-blocking') {
    queueMicrotask(runTask);
  } else if (selectedPriority === 'user-visible') {
    enqueueMacrotask(runTask);
  } else {
    // background priority: prefer requestIdleCallback if available
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(runTask, { timeout: 2000 });
    } else {
      setTimeout(runTask, 0);
    }
  }
}

/**
 * Enqueues a callback at a prioritized task level.
 */
export function postTask(callback, options = {}) {
  const priority = options.priority || 'user-visible';
  if (!(priority in queues)) {
    throw new TypeError(`Invalid priority: ${priority}`);
  }

  const signal = options.signal;
  if (signal?.aborted) {
    return Promise.reject(new DOMException('The user aborted a request.', 'AbortError'));
  }

  return new Promise((resolve, reject) => {
    const taskDescriptor = {
      callback,
      resolve,
      reject,
      signal
    };

    const enqueue = () => {
      queues[priority].push(taskDescriptor);
      if (signal) {
        signal.addEventListener('abort', () => {
          const idx = queues[priority].indexOf(taskDescriptor);
          if (idx !== -1) {
            queues[priority].splice(idx, 1);
            reject(new DOMException('The user aborted a request.', 'AbortError'));
          }
        });
      }
      if (!activeLoop) {
        processQueues();
      }
    };

    if (typeof options.delay === 'number' && options.delay > 0) {
      setTimeout(enqueue, options.delay);
    } else {
      enqueue();
    }
  });
}

/**
 * Yields control back to the browser, returning a promise that resolves
 * inside a rescheduled task at the current priority context level.
 */
export function yieldTask() {
  const priority = currentPriority || 'user-visible';
  return new Promise((resolve, reject) => {
    postTask(resolve, { priority }).then(resolve, reject);
  });
}

class SchedulerPolyfill {
  postTask(callback, options) {
    return postTask(callback, options);
  }

  yield() {
    return yieldTask();
  }
}

if (typeof globalThis.scheduler === 'undefined') {
  globalThis.scheduler = new SchedulerPolyfill();
}

export default globalThis.scheduler;
