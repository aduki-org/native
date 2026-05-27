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

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);

    // Apply headers
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    // Attach upload progress listeners
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress({
            loaded: event.loaded,
            total: event.total,
            percentage: Math.round((event.loaded / event.total) * 100)
          });
        }
      };
    }

    // Handle abort triggers
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
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
        resolve(responseData);
      } else {
        reject(
          new PlatformError({
            code: 'HTTP_ERROR',
            message: `Upload failed with status code ${xhr.status}`,
            context: { url, status: xhr.status },
            recoverable: xhr.status >= 500
          })
        );
      }
    };

    xhr.onerror = (err) => {
      reject(
        new PlatformError({
          code: 'NETWORK_ERROR',
          message: 'Upload network connection failed',
          cause: err,
          context: { url },
          recoverable: true
        })
      );
    };

    xhr.ontimeout = () => {
      reject(
        new PlatformError({
          code: 'NETWORK_TIMEOUT',
          message: 'Upload request timed out',
          context: { url },
          recoverable: true
        })
      );
    };

    xhr.send(fileOrData);
  });
}
