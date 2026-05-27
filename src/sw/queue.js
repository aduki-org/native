/**
 * src/sw/queue.js
 *
 * Request Serialization Utilities.
 * Serializes standard browser Request objects into structured-cloneable,
 * IndexedDB-friendly payloads and deserializes them back into standard Requests
 * during background replay loops.
 *
 * Source: doc 13 — Offline and Background §5
 */

/**
 * Converts a standard Request into a serializable object.
 */
export async function serializeRequest(request) {
  const headers = {};
  for (const [key, value] of request.headers.entries()) {
    headers[key] = value;
  }

  const cloned = request.clone();
  let body = null;

  // GET and HEAD requests cannot hold bodies
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      body = await cloned.arrayBuffer();
    } catch (err) {
      console.warn('Unable to serialize request body:', err);
    }
  }

  return {
    url: request.url,
    method: request.method,
    headers,
    body
  };
}

/**
 * Reconstructs a standard Request object from a serialized descriptor.
 */
export function deserializeRequest(serialized) {
  const options = {
    method: serialized.method,
    headers: new Headers(serialized.headers)
  };

  if (serialized.body) {
    options.body = serialized.body;
  }

  return new Request(serialized.url, options);
}
