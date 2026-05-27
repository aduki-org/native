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

/**
 * Initiates a streaming request and yields parsed JSON chunks as an AsyncIterable.
 */
export async function* stream(url, opts = {}) {
  const { signal, ...fetchOpts } = opts;
  const response = await fetch(url, { ...fetchOpts, signal });

  if (!response.ok) {
    throw new Error(`Streaming failed: HTTP ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('Streaming failed: Response body is not readable');
  }

  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(createNDJSONTransform())
    .getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
