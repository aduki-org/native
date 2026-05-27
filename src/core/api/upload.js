/**
 * src/core/api/upload.js
 *
 * Handles file uploads with real-time progress events.
 * Uses standard XMLHttpRequest to provide precise progress callbacks (opts.onProgress),
 * bridging the standard fetch upload progress gap in Baseline browsers.
 *
 * Source: doc 11 — Networking §14
 */

import { PlatformError } from './fetch.js';
import { events } from './events/index.js';

/**
 * Uploads a file or binary payload with progress tracking and AbortSignal support.
 */
export function upload(url, fileOrData, opts = {}) {
  const {
    method = 'POST',
    headers = {},
    onProgress,
    signal
  } = opts;

  // Generate unique request ID to scope uploading telemetry events
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

  const cleanup = () => {
    for (const dispose of disposes) {
      dispose();
    }
  };

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);

    // Apply headers
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    // Attach upload progress listeners
    if (xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progressPayload = {
            loaded: event.loaded,
            total: event.total,
            percentage: Math.round((event.loaded / event.total) * 100)
          };

          // Trigger legacy onProgress callback if defined
          if (onProgress) {
            onProgress(progressPayload);
          }

          // Emit progress telemetry event
          events.emit('progress', { ...progressPayload, requestId });
        }
      };
    }

    // Handle abort triggers
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        cleanup();
        return reject(
          new PlatformError({
            code: 'NETWORK_ERROR',
            message: 'Upload aborted',
            recoverable: false
          })
        );
      }
      signal.addEventListener('abort', () => {
        xhr.abort();
        cleanup();
        reject(
          new PlatformError({
            code: 'NETWORK_ERROR',
            message: 'Upload aborted',
            recoverable: false
          })
        );
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let responseData = xhr.responseText;
        try {
          responseData = JSON.parse(responseData);
        } catch {
          // Keep raw text if not JSON format
        }

        // Mock a simple Response object for matching response event payloads
        const mockResponse = {
          status: xhr.status,
          ok: true,
          headers: new Headers({ 'Content-Type': xhr.getResponseHeader('Content-Type') || 'text/plain' })
        };
        events.emit(`status:${xhr.status}`, { response: mockResponse, requestId });

        cleanup();
        resolve(responseData);
      } else {
        const err = new PlatformError({
          code: 'HTTP_ERROR',
          message: `Upload failed with status code ${xhr.status}`,
          context: { url, status: xhr.status },
          recoverable: xhr.status >= 500
        });

        const mockResponse = {
          status: xhr.status,
          ok: false,
          headers: new Headers({ 'Content-Type': xhr.getResponseHeader('Content-Type') || 'text/plain' })
        };
        events.emit(`status:${xhr.status}`, { response: mockResponse, requestId });
        events.emit('failed', { response: mockResponse, requestId });
        events.emit('error', { error: err, requestId });

        cleanup();
        reject(err);
      }
    };

    xhr.onerror = (err) => {
      const errorObj = new PlatformError({
        code: 'NETWORK_ERROR',
        message: 'Upload network connection failed',
        cause: err,
        context: { url },
        recoverable: true
      });
      events.emit('failed', { error: errorObj, requestId });
      events.emit('error', { error: errorObj, requestId });

      cleanup();
      reject(errorObj);
    };

    xhr.ontimeout = () => {
      const errorObj = new PlatformError({
        code: 'NETWORK_TIMEOUT',
        message: 'Upload request timed out',
        context: { url },
        recoverable: true
      });
      events.emit('timeout', { error: errorObj, requestId });
      events.emit('failed', { error: errorObj, requestId });
      events.emit('error', { error: errorObj, requestId });

      cleanup();
      reject(errorObj);
    };

    xhr.send(fileOrData);
  });
}
