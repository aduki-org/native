# Platform Security Facade Module Documentation

## Purpose and Architectural Position
The `security` module (`src/core/security/index.js`) isolates secure platform capabilities. It wraps browser `SubtleCrypto` inside simple asynchronous cryptographic interfaces (performing secure key generation, PBKDF2 derivations, and AES-GCM encryptions), drives tree-filtering XSS sanitizations, and queries permission grids.

## Public API Surface with Examples

```javascript
import { security } from 'lib/core/security/index.js';

// 1. Asymmetric AES-GCM encryption
const key = await security.generateKey('AES-GCM');
const cipher = await security.encrypt(key, 'Sensitive user payload');

// 2. Strict XSS HTML Sanitization
const dirtyHtml = '<p onclick="hack()">Hello <script>alert(1)</script></p>';
const cleanHtml = security.sanitize(dirtyHtml);
// Returns: "<p>Hello </p>"

// 3. Permission API Queries and Changes Watch
const state = await security.permission('geolocation');
console.log('Location access state:', state);
```

## AbortSignal and Cleanup Contract
* **Crypto Keys**: AES-GCM keys are marked non-extractable by default. Once created, they reside safely within browser memory limits and cannot be read by third-party scripts.
* **Permission Watches**: Provide `AbortSignal` parameters when subscribing to permission changes to ensure change listeners are cleaned up automatically.

## Known Browser Gaps and Polyfill Strategy
* **HTML Sanitizer API**: Uses browser-native `Sanitizer` if supported. In unsupported runtimes, the facade utilizes a secure `DOMParser` node tree filter that removes unapproved tags, event listeners, and `javascript:` schemes.
