/**
 * src/core/api/index.js
 *
 * Public networking layer entry point.
 * Composes request mutators through the outbound/inbound pipeline,
 * applying caching strategies, transient error retries, and standard timeout controls.
 *
 * Source: doc 11 — Networking §2, §4
 */

import { pipeline } from './pipeline.js';
import { execute, PlatformError } from './fetch.js';
import { retry } from './retry.js';
import { handle as handleCache } from './cache.js';
import { stream, createNDJSONTransform } from './stream.js';
import { upload } from './upload.js';

/**
 * Normalizes options and routes the request descriptor through the core pipeline.
 */
async function request(url, method, body, opts = {}) {
  const headers = new Headers(opts.headers || {});
  
  // Auto-serialize JSON bodies
  let parsedBody = body;
  if (body && typeof body === 'object' && !(body instanceof Blob) && !(body instanceof FormData)) {
    parsedBody = JSON.stringify(body);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  const descriptor = {
    url,
    method,
    headers,
    body: parsedBody,
    signal: opts.signal,
    priority: opts.priority || 'user-visible',
    timeout: opts.timeout || 10000,
    cache: opts.cache, // cache strategy name: 'cache-first' | 'network-first' | 'stale-while-revalidate'
    retries: opts.retries ?? 3,
    ...opts
  };

  // Run through pipeline -> cache handler -> retry handler -> fetch executor
  const response = await pipeline.run(descriptor, async (currentDesc) => {
    return handleCache(currentDesc, async (cacheDesc) => {
      return retry(
        () => execute(cacheDesc),
        {
          attempts: cacheDesc.retries,
          signal: cacheDesc.signal
        }
      );
    });
  });

  // Automatically extract response payload if successful
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export const api = {
  get:    (url, opts) => request(url, 'GET', null, opts),
  post:   (url, body, opts) => request(url, 'POST', body, opts),
  put:    (url, body, opts) => request(url, 'PUT', body, opts),
  patch:  (url, body, opts) => request(url, 'PATCH', body, opts),
  delete: (url, opts) => request(url, 'DELETE', null, opts),
  stream,
  upload,
  pipeline,
  PlatformError
};

export { pipeline, PlatformError, execute, retry, createNDJSONTransform, stream };

