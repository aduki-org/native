## WebCodecs, OffscreenCanvas, and Low-Level Media Pipelines

**Spec:** W3C WebCodecs — `w3.org/TR/webcodecs/`  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API`  
**Status:** Baseline Newly Available. Full support: Chrome 94+, Edge 94+, Firefox 130+ (desktop), Opera 80+, Samsung Internet 17+, Safari 26+ (full). Safari 16.4–18.7: video interfaces only (no `AudioEncoder`, `AudioDecoder`, `ImageDecoder`). Firefox for Android: not yet supported — a Chromium-based browser is required for WebCodecs on Android.

---

### Architectural Purpose

Before WebCodecs, any JavaScript application requiring low-level video processing — custom video players, live streaming encoders, screen capture pipelines, AR/VR overlays, in-browser video editors — faced an unpleasant choice:

- Download codec implementations in JavaScript or WebAssembly, increasing bundle size and startup time.
- Rely on the `<video>` element's opaque, pipeline-controlled rendering, losing any frame-level access.
- Use the `MediaRecorder` API, which encodes a `MediaStream` but exposes no individual encoded or decoded frames, no control over bitrate, no keyframe control, and no ability to repackage output.
- Use MediaSource Extensions (MSE), which provides finer control for playback but still requires containerised input, does not standardise low-latency mode, and provides no access to decoded frame data.

WebCodecs exposes the browser's own built-in, hardware-accelerated codecs directly to JavaScript. The browser transparently uses GPU-backed codec hardware when available and falls back to software encode/decode if not. This eliminates redundant codec downloads and enables frame-level control at native performance.

Production tools — Zoom Web, Loom, Adobe Premiere Web, and others — depend on WebCodecs today. Background blur in video calls is one of the most visible examples: before WebCodecs, this required either server-side processing (adding latency) or shipping heavy WebAssembly codec libraries. With WebCodecs, blur and other transforms can be applied between the camera's decoded output and the encoder's input, entirely on the client.

---

### Core Interfaces

#### `VideoEncoder`

Encodes a sequence of `VideoFrame` objects into `EncodedVideoChunk` objects. Operates as an asynchronous queue: frames are enqueued via `encode()`, and results arrive in the `output` callback along with an optional `VideoDecoderConfig` when the encoder emits decoder configuration metadata. The `encodeQueueSize` property reflects backpressure.

```js
const encoder = new VideoEncoder({
  output(chunk, metadata) {
    // chunk: EncodedVideoChunk — type 'key' | 'delta', data, timestamp
    // metadata: VideoEncoderOutputMetadata — may contain decoderConfig
    muxer.addVideoChunk(chunk, metadata);
  },
  error(e) { console.error('Encoder error', e); }
});

encoder.configure({
  codec: 'avc1.42001f',          // H.264 Baseline Profile Level 3.1
  width: 1280,
  height: 720,
  bitrate: 2_000_000,            // 2 Mbps
  framerate: 30,
  latencyMode: 'quality',        // 'realtime' for low-latency streaming
  hardwareAcceleration: 'no-preference',
});
```

Key `VideoEncoderConfig` fields:

| Field                  | Description                                                                      |
| ---------------------- | -------------------------------------------------------------------------------- |
| `codec`                | Fully-qualified codec string (see §Codec Selection below)                        |
| `width` / `height`     | Output frame dimensions                                                          |
| `bitrate`              | Target bits per second                                                           |
| `framerate`            | Frames per second (informational, used with bitrate)                             |
| `latencyMode`          | `'quality'` (default, better compression) or `'realtime'` (lower encode latency) |
| `hardwareAcceleration` | `'no-preference'` \| `'prefer-hardware'` \| `'prefer-software'`                  |
| `bitrateMode`          | `'variable'` (default) \| `'constant'` \| `'quantizer'`                          |
| `scalabilityMode`      | SVC layer string e.g. `'L1T3'` for temporal scalability                          |
| `alpha`                | `'discard'` (default) or `'keep'` — preserve alpha channel if codec supports it  |

Always call `VideoEncoder.isConfigSupported(config)` before `configure()`. The static method returns a Promise resolving to `{ supported: boolean, config: ... }` and is the authoritative way to detect hardware acceleration availability for a specific codec and resolution combination.

#### `VideoDecoder`

Decodes `EncodedVideoChunk` objects into `VideoFrame` objects. The `decode()` call enqueues a chunk; decoded frames arrive in the `output` callback. The `decodeQueueSize` property reflects backpressure; a `dequeue` event fires when the queue shrinks, signalling that more chunks can safely be enqueued.

```js
const decoder = new VideoDecoder({
  output(frame) {
    ctx.drawImage(frame, 0, 0);
    frame.close(); // MANDATORY — releases GPU memory
  },
  error(e) { console.error('Decoder error', e); }
});

decoder.configure({
  codec: 'avc1.42001f',
  codedWidth: 1280,
  codedHeight: 720,
  // description: ArrayBuffer — codec-specific extradata (SPS/PPS for H.264)
});
```

For H.264, the `description` field carries the AVCDecoderConfigurationRecord (the SPS and PPS NAL units). This data is present in the `VideoDecoderConfig` emitted by `VideoEncoder` in its `output` metadata, and also in the `moov` box of an MP4 file.

#### `AudioEncoder` / `AudioDecoder`

The audio equivalents. Accept and emit `AudioData` objects (raw PCM) and `EncodedAudioChunk` objects respectively.

Supported codecs for encoding:

- **Opus** — recommended; cross-browser, royalty-free, excellent quality at low bitrate, the only audio codec with full support across all WebCodecs-capable browsers.
- **AAC** (`mp4a.40.2`) — widely supported in playback; `AudioEncoder` for AAC is available in Chrome/Edge and Safari 26+, but was absent on Safari 16.4–18.7 (`AudioEncoder` was `undefined` on those versions).

MP3, Vorbis, FLAC, and other formats are not part of the WebCodecs encoder API surface. They must be handled through third-party WebAssembly libraries if encode output is required.

#### `ImageDecoder`

Decodes image files (JPEG, PNG, WebP, AVIF, GIF, APNG, and others based on browser support) into `VideoFrame` objects, without constructing a DOM element. Useful for extracting individual animation frames from GIFs or APNGs for manipulation or re-encoding. Returns a `VideoFrame` per frame, complete with timing metadata for animated formats.

```js
const response = await fetch('animation.gif');
const blob = await response.blob();
const decoder = new ImageDecoder({ data: blob.stream(), type: 'image/gif' });

for (let i = 0; i < decoder.tracks.selectedTrack.frameCount; i++) {
  const { image } = await decoder.decode({ frameIndex: i });
  // image is a VideoFrame
  ctx.drawImage(image, 0, 0);
  image.close();
}
```

#### `VideoFrame`

Represents a single decoded or constructed video frame. Holds pixel data in GPU memory. Contains:

- `timestamp` — presentation timestamp in microseconds
- `duration` — display duration in microseconds (optional)
- `format` — pixel format string (e.g. `'I420'`, `'NV12'`, `'RGBA'`)
- `codedWidth` / `codedHeight` — dimensions including non-visible padding
- `displayWidth` / `displayHeight` — visible dimensions after crop

Can be constructed from: `<canvas>`, `<video>`, `ImageBitmap`, `OffscreenCanvas`, `HTMLImageElement`, `<img>`, another `VideoFrame`, or raw `BufferSource` data with a format descriptor.

Can be rendered to a canvas with `ctx.drawImage(frame, x, y)`.

**Resource management — critical:** `VideoFrame` holds GPU-resident memory. It is **not** garbage-collected by the JavaScript GC. `frame.close()` must be called explicitly when the frame is no longer needed. In a 60fps pipeline, one unclose frame per second costs several megabytes; failing to close frames causes GPU memory to fill at a rate of roughly one frame × frame size per forgotten close call. Ownership must be defined clearly when frames pass through asynchronous pipelines — `close()` must be called exactly once.

The same applies to `EncodedVideoChunk` and `AudioData`, which hold CPU-side memory not subject to GC.

---

### Codec Selection and Codec Strings

WebCodecs requires **fully-specified codec strings**, not the ambiguous shorthand used in HTML (e.g. `'h264'` is not valid; `'avc1.42001f'` is). The string format encodes profile, level, and other parameters.

Common codec string examples:

|Codec|String|Notes|
|---|---|---|
|H.264 Baseline 3.1|`avc1.42001f`|Widest compatibility|
|H.264 High 4.0|`avc1.640028`|Better compression, common for 1080p|
|VP9 Profile 0|`vp09.00.10.08`|Level 1.0, 8-bit|
|VP9 Profile 0 (HD)|`vp09.00.50.08.00`|Level 5.0, 8-bit|
|AV1 Main 4.0|`av01.0.04M.08`|Modern, best compression|
|H.265/HEVC|`hvc1.1.6.L123.00`|macOS/Windows hardware; limited Linux|
|Opus|`opus`|Audio; universal across WebCodecs browsers|
|AAC-LC|`mp4a.40.2`|Audio; check AudioEncoder availability|

**Hardware acceleration availability by codec (as of 2026):**

- H.264/AVC: hardware encode and decode broadly available across all platforms.
- VP9: hardware decode broadly available; hardware encode less common (device-dependent).
- AV1: hardware decode available on recent Intel, AMD, and Apple Silicon; hardware encode limited to newer devices. Software AV1 encode is CPU-intensive.
- H.265/HEVC: hardware decode on macOS and Windows; largely absent on Linux without proprietary drivers.

Use `isConfigSupported()` with `hardwareAcceleration: 'prefer-hardware'` and `'prefer-software'` to probe what is actually available on the current device at runtime.

**Codec selection strategy for encoding:**

```js
// Probe in order of preference, fall back as needed
const candidates = [
  { codec: 'av01.0.04M.08', label: 'AV1' },
  { codec: 'vp09.00.50.08.00', label: 'VP9' },
  { codec: 'avc1.640028', label: 'H.264 High' },
  { codec: 'avc1.42001f', label: 'H.264 Baseline' },
];

let selectedCodec;
for (const { codec, label } of candidates) {
  const { supported } = await VideoEncoder.isConfigSupported({
    codec, width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30,
  });
  if (supported) { selectedCodec = codec; break; }
}
```

Real-world data from 1+ million device sessions (WebCodecs Fundamentals Dataset, 2026) shows VP9 Profile 0 is effectively as universal as H.264 for both encode and decode. For streaming and playback use cases, an AV1 + H.265 strategy covers modern devices without H.264 fallback. For encoding pipelines (transcoders, editors, capture tools), AV1 and H.265 encode support is insufficient as a sole strategy — AVC or VP9 is needed as the safety net.

---

### Backpressure and Queue Management

WebCodecs encoders and decoders are asynchronous queues. Naively calling `encode()` or `decode()` in a tight loop without respecting backpressure causes queue growth, increased memory consumption, and decoder stalls.

The correct pattern uses the `dequeue` event and `encodeQueueSize` / `decodeQueueSize`:

```js
const encoder = new VideoEncoder({ output, error });
encoder.configure(config);

async function processFrames(frames) {
  for (const frame of frames) {
    // Wait for queue to drain before enqueuing more
    if (encoder.encodeQueueSize > 2) {
      await new Promise(resolve => encoder.addEventListener('dequeue', resolve, { once: true }));
    }
    const keyFrame = shouldKeyFrame(frame);
    encoder.encode(frame, { keyFrame });
    frame.close();
  }
  await encoder.flush(); // Wait for all output to be emitted
  encoder.close();
}
```

`flush()` returns a Promise that resolves when all previously enqueued frames/chunks have been fully processed and their output callbacks have fired. Always `await encoder.flush()` before finalising a recording or file output — chunks emitted after `flush()` resolves are the complete output.

---

### `OffscreenCanvas` — Off-Thread Canvas Rendering

**Spec:** WHATWG HTML Living Standard  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas`  
**Status:** Baseline Widely Available — well established across browsers since March 2023.

`OffscreenCanvas` decouples the HTML `<canvas>` element from the DOM and the Canvas API, allowing canvas drawing commands to execute entirely within a Worker. This is the rendering surface for all WebCodecs pipelines that run off the main thread.

#### Two Creation Modes

**Placeholder canvas transfer (linked mode):** A `<canvas>` element in the main-thread DOM transfers its rendering control to a Worker. Updates to the `OffscreenCanvas` in the Worker are committed to the original `<canvas>` on screen without a round-trip back to the main thread.

```js
// Main thread
const canvas = document.getElementById('output');
const offscreen = canvas.transferControlToOffscreen();
worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);
// canvas is now controlled entirely by the worker
```

```js
// Worker
self.onmessage = ({ data }) => {
  if (data.type === 'init') {
    const ctx = data.canvas.getContext('2d');
    // Draw here — composited to screen automatically
  }
};
```

**Standalone mode:** An `OffscreenCanvas` is created directly in a Worker (or on the main thread) and used independently, without being tied to a DOM `<canvas>`. Output can be extracted via `transferToImageBitmap()` or `convertToBlob()`.

```js
const offscreen = new OffscreenCanvas(1280, 720);
const ctx = offscreen.getContext('2d');
ctx.fillRect(0, 0, 1280, 720);
const bitmap = offscreen.transferToImageBitmap(); // Zero-copy GPU transfer
```

#### Context Types

`OffscreenCanvas.getContext()` supports the same context types as `HTMLCanvasElement`:

- `'2d'` — 2D rasterisation, same API as `CanvasRenderingContext2D`
- `'webgl'` — WebGL 1
- `'webgl2'` — WebGL 2
- `'webgpu'` — WebGPU `GPUCanvasContext` (where WebGPU is available)
- `'bitmaprenderer'` — `ImageBitmapRenderingContext`: replaces the canvas content with an `ImageBitmap` in a single operation; the fastest path when the pixel data is already GPU-resident

The `bitmaprenderer` context is particularly useful in WebCodecs pipelines: a `VideoFrame` can be converted to an `ImageBitmap` via `createImageBitmap(frame)`, then transferred to the canvas in a single, zero-copy step.

#### Tab Throttling and Background Rendering

Canvas rendering driven by `requestAnimationFrame` is throttled when the tab becomes inactive. `OffscreenCanvas` in a Worker is **not** subject to this throttling. Recording pipelines that must continue in background tabs — screen recorders, podcasting tools, video editors exporting a long render — should move all canvas and encoding work into a Worker with `OffscreenCanvas`. This is the primary practical reason to use the Worker + OffscreenCanvas architecture beyond performance.

---

### The Full Media Pipeline: Threading Architecture

The canonical high-performance pipeline moves all media work off the main thread:

```
Main Thread
  │  navigator.mediaDevices.getUserMedia() / getDisplayMedia()
  │  → MediaStream
  │  canvas.transferControlToOffscreen()
  │  worker.postMessage({ track, canvas }, [canvas])
  │
Worker
  │  MediaStreamTrackProcessor(track)
  │  → ReadableStream<VideoFrame>
  │
  ├─ [Transform] TransformStream — apply effects per VideoFrame
  │
  ├─ [Encode] VideoEncoder — → EncodedVideoChunk stream
  │   └─ muxer (mp4-muxer / webm-muxer) → Blob → postMessage to main
  │
  └─ [Render] ctx.drawImage(frame) on OffscreenCanvas
              → committed to main-thread <canvas> automatically
```

Step by step:

1. Main thread acquires a `MediaStream` from the camera or screen via `getUserMedia()`/`getDisplayMedia()`.
2. The video track is extracted: `stream.getVideoTracks()[0]`.
3. `MediaStreamTrackProcessor` wraps the track and exposes it as a `ReadableStream<VideoFrame>`.
4. The track (or the processor's `readable`) is transferred to a Worker via `postMessage` with the Transferable objects pattern.
5. The Worker reads frames from the stream and passes them through a `TransformStream` for per-frame processing (blur, colour grading, watermarking, ML inference, etc.).
6. Processed frames are handed to a `VideoEncoder` for encode, and/or drawn to an `OffscreenCanvas` for display.
7. `EncodedVideoChunk` objects are passed to a muxer running in the same Worker.
8. The final muxed `Blob` or `ArrayBuffer` is posted back to the main thread for download or upload.

#### `MediaStreamTrackProcessor` and `VideoTrackGenerator`

`MediaStreamTrackProcessor` is part of the W3C "MediaStreamTrack Insertable Media Processing using Streams" specification (Working Draft, January 2026). It converts a live `MediaStreamTrack` into a `ReadableStream<VideoFrame>` or `ReadableStream<AudioData>`, bridging the `MediaStream` world and the WebCodecs world.

`VideoTrackGenerator` (the successor to `MediaStreamTrackGenerator`, standardised in the W3C spec) is the inverse: it accepts a `WritableStream<VideoFrame>` and exposes a `MediaStreamTrack`, which can then be used as a source for a `<video>` element or handed to a `RTCPeerConnection` for WebRTC transmission.

```js
// In a Worker — barcode scanner / AR overlay pattern
const processor = new MediaStreamTrackProcessor({ track: videoTrack });
const generator = new MediaStreamTrackGenerator({ kind: 'video' });

const transformer = new TransformStream({
  async transform(frame, controller) {
    const processed = await applyEffect(frame); // e.g. blur, overlay
    frame.close();                              // Close the original
    controller.enqueue(processed);             // Pass the new frame downstream
  }
});

processor.readable
  .pipeThrough(transformer)
  .pipeTo(generator.writable);

// Back on the main thread, generator is a MediaStreamTrack
// that can be handed to <video>.srcObject or RTCPeerConnection
```

**Platform support note:** `MediaStreamTrackProcessor` is available in Chrome and Firefox on desktop. `VideoTrackGenerator` (the new spec name) has more limited implementation than the older non-standard `MediaStreamTrackGenerator`. Feature-detect before use:

```js
if ('MediaStreamTrackProcessor' in window || 'MediaStreamTrackProcessor' in self) {
  // Insertable Streams available
}
```

---

### Resource Management — Complete Pattern

Every `VideoFrame`, `AudioData`, `EncodedVideoChunk`, and `EncodedAudioChunk` holds memory not managed by the JavaScript garbage collector. The rule is: every object must be explicitly `close()`d exactly once, by whichever stage of the pipeline takes final ownership of it.

Common memory leak patterns and their fixes:

**Pattern 1: Forgetting to close frames in a transform**

```js
// WRONG — decoded frame is never closed
decoder.output = frame => { ctx.drawImage(frame, 0, 0); };

// CORRECT
decoder.output = frame => { ctx.drawImage(frame, 0, 0); frame.close(); };
```

**Pattern 2: Exception bypasses close**

```js
// WRONG — if processFrame throws, frame leaks
decoder.output = async (frame) => {
  await processFrame(frame);
  frame.close();
};

// CORRECT — close in finally
decoder.output = async (frame) => {
  try {
    await processFrame(frame);
  } finally {
    frame.close();
  }
};
```

**Pattern 3: Frame passed to multiple async consumers without copy**

A `VideoFrame` can be cloned with `frame.clone()` — this creates a new `VideoFrame` object referencing the same GPU memory (zero cost), with an independent reference that must be separately closed. Clone for each consumer; close all clones.

```js
decoder.output = (frame) => {
  const forEncoder = frame.clone();
  const forDisplay = frame.clone();
  frame.close();                  // Original no longer needed

  encoder.encode(forEncoder);    // encoder will use and then…
  forEncoder.close();            // must still be closed after encode

  ctx.drawImage(forDisplay, 0, 0);
  forDisplay.close();
};
```

**Pattern 4: Pipeline shutdown — flush before close**

```js
// When stopping a recording:
await encoder.flush();   // All queued encode operations complete
encoder.close();         // Encoder is now safe to destroy
muxer.finalize();        // Write the MP4 footer
```

---

### Container Muxing and Demuxing

WebCodecs handles only encoded chunks and raw frames. It provides **no container parsing or container writing** (no MP4 box parser, no WebM EBML writer). Muxing (wrapping encoded streams into a playable file) and demuxing (extracting encoded chunks from a file for decode) require separate libraries.

**For muxing (producing a file from encoded chunks):**

- **`mp4-muxer`** (`github.com/Vanilagy/mp4-muxer`) — pure TypeScript MP4 multiplexer designed specifically for WebCodecs. Supports video + audio, Fast Start (moov at front for streaming), and fragmented MP4. The `output` callback of `VideoEncoder` can be wired directly to `muxer.addVideoChunk()`.
- **`webm-muxer`** (`github.com/Vanilagy/webm-muxer`) — the sibling library producing WebM/MKV output.
- **`mediabunny`** — a higher-level library that wraps WebCodecs in a cleaner conversion interface, handling decode/encode/mux as a unit. Suitable when the full pipeline needs to be abstracted.
- **`MP4Box.js`** (`gpac.github.io/mp4box.js/`) — general-purpose MP4 parser/writer; not designed for WebCodecs but usable via the `MP4Demuxer` wrapper pattern.

**For demuxing (extracting chunks from a file for decode):**

- **`web-demuxer`** (`github.com/bilibili/web-demuxer`) — supports both WebM and MP4, outputs `EncodedVideoChunk` objects ready for `VideoDecoder`.
- **`mediabunny`** — handles both demux and decode as an integrated pipeline.
- **`mp4box.js`** — robust MP4 demuxing; requires adaptation to extract `EncodedVideoChunk` objects.

The recommended minimal architecture for a complete in-browser transcode:

```js
// Worker — transcode source.mp4 to output.mp4 with H.264
const demuxer = new WebDemuxer({ source: mp4Blob });
const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width, height } });

const decoder = new VideoDecoder({
  output(frame) { encoder.encode(frame); frame.close(); },
  error(e) { console.error(e); }
});

const encoder = new VideoEncoder({
  output(chunk, meta) { muxer.addVideoChunk(chunk, meta); },
  error(e) { console.error(e); }
});

decoder.configure(decoderConfig);
encoder.configure({ codec: 'avc1.640028', width, height, bitrate: 4_000_000 });

for await (const chunk of demuxer.videoChunks()) {
  decoder.decode(chunk);
}

await decoder.flush();
decoder.close();
await encoder.flush();
encoder.close();
muxer.finalize();

const { buffer } = muxer.target;
postMessage({ type: 'done', buffer }, [buffer]);
```

---

### Secure Context Requirement

WebCodecs requires a **secure context** (HTTPS or `localhost`). The API is `undefined` in non-secure origins. This is consistent with all powerful APIs (`getUserMedia`, `WebAuthn`, Service Workers) — serving over HTTPS is the baseline assumption for any production media pipeline.

---

### Integration with WebGPU

When a WebCodecs pipeline feeds into a WebGPU rendering pipeline (for GPU-accelerated video effects, colour grading, or ML inference), `VideoFrame` objects can be imported directly into WebGPU as textures via `device.importExternalTexture({ source: frame })`. This is a zero-copy operation — the frame's GPU memory is shared with the WebGPU texture sampler without a CPU round-trip. The texture is valid only for the current GPU command encoding pass; a new import is required each frame.

```js
decoder.output = (frame) => {
  const texture = gpuDevice.importExternalTexture({ source: frame });
  // Use texture in a render pass...
  // frame.close() is still required after the GPU pass that consumes it
  frame.close();
};
```

This composability — `MediaStream → VideoFrame → WebGPU texture → VideoEncoder → muxer → Blob` — makes in-browser non-linear video editing and real-time AR/VR overlay pipelines practical without server round-trips or WebAssembly codec bundles.

---

### `OffscreenCanvas` — Rendering Contexts in Depth

#### 2D Context in a Worker

The 2D context in a Worker behaves identically to `CanvasRenderingContext2D`. All drawing APIs — `drawImage`, `fillRect`, text rendering, path operations, image compositing — function normally.

```js
// Worker — draw a VideoFrame with text overlay
const ctx = offscreenCanvas.getContext('2d');

function renderFrame(frame, caption) {
  ctx.drawImage(frame, 0, 0);
  ctx.font = '24px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(caption, 20, offscreenCanvas.height - 30);
  frame.close();
}
```

#### `transferToImageBitmap()`

In standalone mode (no linked `<canvas>`), the Worker can extract the current rendered frame as an `ImageBitmap` via `transferToImageBitmap()`. This is a GPU-level snapshot — zero copy. The resulting `ImageBitmap` can be transferred back to the main thread via `postMessage` for display or further processing.

```js
// Worker
const bitmap = offscreen.transferToImageBitmap();
self.postMessage({ bitmap }, [bitmap]); // Transfer (zero copy)

// Main thread
canvas.getContext('bitmaprenderer').transferFromImageBitmap(bitmap);
```

#### WebGL / WebGL2 in a Worker

Both `'webgl'` and `'webgl2'` contexts are available on `OffscreenCanvas` in a Worker. This enables GPU compute and rendering pipelines (particle systems, GPGPU, shader-based video effects) to run entirely off the main thread. The combined OffscreenCanvas WebGL + WebCodecs architecture is used in:

- Video call background blur and virtual backgrounds (ML inference in Worker, render with WebGL, encode with WebCodecs)
- Game streaming clients (decode server stream with WebCodecs, render with WebGL/WebGPU on OffscreenCanvas)
- In-browser video editors (decode with WebCodecs, apply colour-grade shaders on OffscreenCanvas WebGL, encode output with WebCodecs)

---

### `MediaRecorder` vs WebCodecs — Decision Matrix

|Capability|`MediaRecorder`|WebCodecs|
|---|---|---|
|Per-frame access|No|Yes|
|Codec control|Limited, browser-chosen|Full — codec string, profile, bitrate, keyframe interval|
|Hardware acceleration|Automatic|Automatic with `isConfigSupported` probing|
|Background-tab recording|Throttled|Worker + OffscreenCanvas: unthrottled|
|Muxing|Built-in (WebM/MP4 opaque)|Manual (mp4-muxer / webm-muxer)|
|Audio + video sync|Automatic|Manual — requires aligned timestamps|
|Browser support|Baseline Widely Available|Baseline Newly Available (desktop)|
|Complexity|Low|High|

Use `MediaRecorder` when: recording a `MediaStream` to a file is the entire use case, per-frame processing is not required, and codec/bitrate control is not critical. Use WebCodecs when: per-frame effects, real-time encoding to a custom format, transcoding, frame extraction for ML inference, or WebRTC custom pipeline integration is required.

---

### Feature Detection

```js
// WebCodecs (all major interfaces)
const webCodecsAvailable = (
  typeof VideoEncoder !== 'undefined' &&
  typeof VideoDecoder !== 'undefined' &&
  typeof AudioEncoder !== 'undefined' && // undefined on Safari 16.4–18.7
  typeof AudioDecoder !== 'undefined'
);

// Check specific codec + hardware support
const { supported } = await VideoEncoder.isConfigSupported({
  codec: 'av01.0.04M.08',
  hardwareAcceleration: 'prefer-hardware',
  width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30,
});

// Insertable Streams
const insertableStreamsAvailable =
  'MediaStreamTrackProcessor' in window ||
  'MediaStreamTrackProcessor' in self; // self for Worker context

// OffscreenCanvas
const offscreenCanvasAvailable = typeof OffscreenCanvas !== 'undefined';
```

---

### Known Limitations and Cross-Browser Gaps (May 2026)

- **Firefox for Android:** WebCodecs is not implemented. `VideoDecoder` is `undefined`. Any mobile-web video pipeline targeting Firefox Android requires a fallback to `MediaRecorder` or a WebAssembly codec.
- **Safari 16.4–18.7:** Video interfaces (`VideoEncoder`, `VideoDecoder`, `VideoFrame`) shipped; audio interfaces (`AudioEncoder`, `AudioDecoder`, `EncodedAudioChunk`) and `ImageDecoder` were absent. Apps checking `VideoDecoder` without also checking `AudioEncoder` broke silently for audio on these versions.
- **H.265 on Linux:** Hardware H.265 decode is absent on most Linux builds without proprietary GPU drivers. `isConfigSupported` returns `false` for `hvc1.*` strings on such systems — use AV1 or VP9 as the preferred modern codec on Linux.
- **AV1 hardware encode:** Limited to recent (2022+) Intel, AMD, and Apple Silicon devices. Software AV1 encode is CPU-intensive and unsuitable for real-time use on mid-range hardware.
- **No native muxer/demuxer:** Container parsing and container writing are outside the WebCodecs spec boundary. Third-party JavaScript or WebAssembly libraries are required for any file-based workflow.
- **`VideoTrackGenerator` implementation parity:** The newer spec name `VideoTrackGenerator` has seen slower adoption than the older non-standard `MediaStreamTrackGenerator`. Production code targeting the insertable-streams-to-`<video>` path should feature-detect both names.
- **Secure context required:** All WebCodecs interfaces are `undefined` on `http://` origins (except `localhost`). Enforce HTTPS.

---

### References

- W3C WebCodecs Specification: `w3.org/TR/webcodecs/`
- W3C WebCodecs Codec Registry: `w3.org/TR/webcodecs-codec-registry/`
- W3C MediaStreamTrack Insertable Media Processing (Working Draft, January 2026): `w3.org/TR/mediacapture-transform/`
- MDN — WebCodecs API: `developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API`
- MDN — Video Processing Concepts: `developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Video_processing_concepts`
- MDN — Codec Selection: `developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection`
- MDN — VideoEncoder: `developer.mozilla.org/en-US/docs/Web/API/VideoEncoder`
- MDN — VideoDecoder: `developer.mozilla.org/en-US/docs/Web/API/VideoDecoder`
- MDN — VideoFrame: `developer.mozilla.org/en-US/docs/Web/API/VideoFrame`
- MDN — OffscreenCanvas: `developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas`
- MDN — MediaStreamTrackProcessor: `developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrackProcessor`
- Chrome for Developers — WebCodecs: `developer.chrome.com/docs/web-platform/best-practices/webcodecs`
- Chrome for Developers — Insertable Streams for MediaStreamTrack: `developer.chrome.com/docs/capabilities/web-apis/mediastreamtrack-insertable-media-processing`
- web.dev — OffscreenCanvas: `web.dev/articles/offscreen-canvas`
- WebCodecs Fundamentals — Codec Support Dataset (1M+ sessions, 2026): `webcodecsfundamentals.org/datasets/codec-analysis-2026/`
- WebCodecs Fundamentals — Muxing and Demuxing: `webcodecsfundamentals.org/basics/muxing/`
- mp4-muxer (Vanilagy): `github.com/Vanilagy/mp4-muxer`
- webm-muxer (Vanilagy): `github.com/Vanilagy/webm-muxer`
- web-demuxer (bilibili): `github.com/bilibili/web-demuxer`
- Frontier Web APIs 2026 (utsubo.com): `utsubo.com/blog/frontier-web-apis-2026-production-ready`
- The Future of Video Technology in 2026 (getstream.io): `getstream.io/blog/future-video-technology/`