# Networking and Streaming Module Documentation

## Purpose and Architectural Position
The `api` module (`src/core/api/index.js`) serves as the central HTTP communication pipeline of the platform. It wraps browser `fetch` inside a pluggable middlewares model, providing out-of-the-box exponential retry backoff, multi-tier cache controls, response serialization, timeouts, and streaming chunk transformers.

## Public API Surface with Examples

```javascript
import { api, stream } from 'lib/core/api/index.js';

// 1. Unified Request Gateway (Auto JSON Parsing)
const data = await api.post('/api/users', { name: 'fescii' });

// 2. High-Performance NDJSON Streaming
const abortCtrl = new AbortController();

await api.stream('/api/logs/live', (chunk) => {
  console.log('Received chunk payload:', chunk);
}, {
  signal: abortCtrl.signal,
  priority: 'background'
});
```

### Exported Methods and Structs
* `api.get(url, opts)` / `api.post(url, body, opts)`: HTTP request execution.
* `api.stream(url, onChunk, opts)`: Reads split boundaries from progressive fetch NDJSON generators.
* `retry(fn, options)`: Exponential backoff retries.
* `PlatformError`: Exception wrapping status and error codes.

## AbortSignal and Cleanup Contract
* **Request Interception**: Passing `signal` inside request options binds the browser fetch to abort immediately, ensuring network sockets are closed and memory is returned.
* **Streams**: Always bind an `AbortSignal` to stream operations so progressive readers are torn down when component lifecycles end.

## Known Browser Gaps and Polyfill Strategy
* **Streams API**: Assumes readable byte streams. The NDJSON transformer uses standard `TextDecoderStream` splitters. In unsupported environments, the system falls back to chunk-by-chunk binary parsing.
