/**
 * src/core/api/stream.js
 *
 * Implements Streams API and progressive response handling.
 * Parses NDJSON streams using native TransformStream pipelines, preserving backpressure.
 * Useful for large data lists, logs, or live AI streaming responses.
 *
 * Source: doc 11 — Networking §11
 */

/**
 * Creates a reusable TransformStream to parse Newline-Delimited JSON (NDJSON).
 */
export function createNDJSONTransform() {
  let buffer = '';
  return new TransformStream({
    transform(chunk, controller) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep trailing fragment in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          try {
            controller.enqueue(JSON.parse(trimmed));
          } catch (err) {
            controller.error(new Error(`Failed to parse NDJSON line: ${err.message}`));
          }
        }
      }
    },
    flush(controller) {
      const trimmed = buffer.trim();
      if (trimmed) {
        try {
          controller.enqueue(JSON.parse(trimmed));
        } catch (err) {
          controller.error(new Error(`Failed to parse NDJSON line on flush: ${err.message}`));
        }
      }
    }
  });
}

import { events } from './events/index.js';

/**
 * Initiates a streaming request and yields parsed JSON chunks as an AsyncIterable.
 */
export async function* stream(url, opts = {}) {
  const { signal, ...fetchOpts } = opts;

  // Generate unique request ID to scope streaming telemetry events
  const requestId = opts.requestId || (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));

  // Register request-specific temporary listeners
  const disposes = [];
  if (opts.on && typeof opts.on === 'object') {
    for (const [event, handler] of Object.entries(opts.on)) {
      if (typeof handler === 'function') {
        const dispose = events.on(event, (e) => {
          if (e.detail?.requestId === requestId) {
            handler(e);
          }
        });
        disposes.push(dispose);
      }
    }
  }

  let response;
  try {
    response = await fetch(url, { ...fetchOpts, signal });
  } catch (err) {
    events.emit('error', { error: err, requestId });
    events.emit('failed', { error: err, requestId });
    throw err;
  }

  if (!response.ok) {
    const err = new Error(`Streaming failed: HTTP ${response.status} ${response.statusText}`);
    events.emit('status:' + response.status, { response, requestId });
    events.emit('failed', { response, requestId });
    events.emit('error', { error: err, requestId });
    throw err;
  }

  if (!response.body) {
    const err = new Error('Streaming failed: Response body is not readable');
    events.emit('error', { error: err, requestId });
    throw err;
  }

  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(createNDJSONTransform())
    .getReader();

  try {
    while (true) {
      let result;
      try {
        result = await reader.read();
      } catch (err) {
        events.emit('error', { error: err, requestId });
        throw err;
      }

      const { value, done } = result;
      if (done) break;

      // Emit chunk telemetry event locally and globally
      events.emit('chunk', { chunk: value, requestId });

      yield value;
    }
  } finally {
    reader.releaseLock();
    // Guarantee auto-cleanup of streaming listeners
    for (const dispose of disposes) {
      dispose();
    }
  }
}
