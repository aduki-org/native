## Security Architecture

**Version:** 1.0  
**Status:** Working Specification  
**Date:** May 2026  
**Authority:** MDN Web Docs, WHATWG Living Standard, W3C Specifications, OWASP  
**Companion documents:** networking.md, storage.md, worker-architecture.md, memory-management.md

---

## Table of Contents

1. [Security Philosophy and Threat Model](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#1-security-philosophy-and-threat-model)
2. [Web Cryptography API](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#2-web-cryptography-api)
3. [Content Security Policy](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#3-content-security-policy)
4. [Trusted Types API](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#4-trusted-types-api)
5. [HTML Sanitizer API](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#5-html-sanitizer-api)
6. [The core.security Sanitisation Interface](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#6-the-coresecurity-sanitisation-interface)
7. [Cross-Origin Security Architecture](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#7-cross-origin-security-architecture)
8. [Cross-Origin Isolation — COOP, COEP, and CORP](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#8-cross-origin-isolation--coop-coep-and-corp)
9. [Subresource Integrity](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#9-subresource-integrity)
10. [Permissions API](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#10-permissions-api)
11. [Permissions Policy](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#11-permissions-policy)
12. [Secure Contexts and HTTPS](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#12-secure-contexts-and-https)
13. [Storage Security](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#13-storage-security)
14. [Worker Security Model](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#14-worker-security-model)
15. [Security Headers Reference](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#15-security-headers-reference)
16. [Injection Sink Inventory](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#16-injection-sink-inventory)
17. [Security Anti-Patterns Catalogue](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#17-security-anti-patterns-catalogue)
18. [Design Rules Summary](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#18-design-rules-summary)

---

---

## 1. Security Philosophy and Threat Model

### The Platform as the Security Primitive

The browser is the most rigorously security-audited application runtime in existence. Its sandboxing model, origin isolation, permission-gated APIs, and cryptographic primitives are the product of decades of engineering effort, adversarial research, and standards coordination. This architecture's security model begins with the same foundational principle as its broader design: trust the platform, compose it, do not replace it.

The security architecture does not implement its own cryptography, its own sanitisation logic, or its own permission gates. It routes every security-relevant operation through the appropriate browser API, layering application-level policy on top — never below.

### Primary Threat Vectors

The browser application threat model, ranked by prevalence and impact:

**Cross-Site Scripting (XSS)** — An attacker injects malicious HTML or JavaScript into the application's DOM, executing in the application's origin context. XSS is the most common web application vulnerability class. This architecture addresses it at three layers simultaneously: a strict Content Security Policy (prevents inline execution), Trusted Types (prevents string-to-sink injection), and the Sanitizer API (removes unsafe markup from third-party content).

**Cross-Site Request Forgery (CSRF)** — An attacker causes an authenticated user's browser to make unintended requests to the application's server. Mitigated by the SameSite cookie attribute, CSRF tokens on state-changing endpoints, and explicit `credentials: 'include'` requirements that make unintentional credential-bearing requests impossible in this architecture's fetch layer.

**Supply Chain Attacks** — An attacker compromises a CDN, third-party script host, or package registry, injecting malicious code into resources the application loads. Mitigated by Subresource Integrity (SRI) hashes on all external resources, Import Map scope restriction, and a CSP that restricts script sources to declared origins.

**Spectre-Class Side-Channel Attacks** — A malicious page in the same browser process uses speculative execution to read memory from adjacent pages. Mitigated by Cross-Origin Isolation (COOP + COEP) which moves the application into a dedicated browser process.

**Credential and Key Theft** — An attacker reads cookies, tokens, or cryptographic keys from application storage. Mitigated by HttpOnly and Secure cookie attributes (server concern), non-extractable CryptoKey objects (SubtleCrypto), and Storage Access API controls.

**DOM Clobbering** — An attacker injects HTML that overwrites global DOM properties (e.g., `document.getElementById`), exploiting how some frameworks access globals by name. Mitigated by the use of Shadow DOM for encapsulation and Trusted Types enforcement that prevents arbitrary HTML insertion.

### Defence in Depth

No single control is sufficient. The architecture implements multiple independent layers, each targeting a different attack surface:

```
┌─────────────────────────────────────────────────────────────┐
│                    HTTP Security Headers                    │
│   CSP · HSTS · COEP · COOP · CORP · Permissions-Policy      │
├─────────────────────────────────────────────────────────────┤
│               JavaScript Security Layer                     │
│         Trusted Types · Sanitizer API · SRI                 │
├─────────────────────────────────────────────────────────────┤
│               API & Runtime Security Layer                  │
│     SubtleCrypto · Permissions API · Secure Contexts        │
├─────────────────────────────────────────────────────────────┤
│                  Architecture Constraints                   │
│  No unsafe-eval · No inline scripts · ES Module isolation   │
│  Shadow DOM encapsulation · Explicit credential handling    │
└─────────────────────────────────────────────────────────────┘
```

If one layer fails — a misconfigured header, a missed sanitisation call, an unpatched dependency — the layers above and below it continue providing partial protection. The goal is not to make breach impossible; it is to make every individual step the attacker must take independently difficult.

---

---

## 2. Web Cryptography API

### Specification and Status

**Spec:** W3C Web Cryptography Level 2 (Working Draft, April 2025)  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API`  
**Status:** Baseline — Widely Available  
**Access:** `window.crypto.subtle` (also available in Web Workers via `self.crypto.subtle`)

The Web Cryptography API provides a low-level interface for performing cryptographic operations in the browser. It is the correct and complete solution for all common cryptographic use cases in this architecture. No third-party cryptography library is needed for hashing, HMAC, authenticated encryption, digital signatures, key derivation, or key exchange.

All `SubtleCrypto` operations are asynchronous, returning `Promise`. The browser executes the cryptographic operations off the main thread using the platform's cryptography implementation — typically the operating system's native crypto library. This is architecturally important: cryptographic work does not compete with rendering or user interaction for the JavaScript thread.

### Cryptographic Operations

**Hashing and Digest**  
`crypto.subtle.digest(algorithm, data)` computes a hash of arbitrary data. Supported algorithms: SHA-1 (deprecated for new use), SHA-256, SHA-384, SHA-512. The output is an `ArrayBuffer`. SHA-256 is the minimum acceptable algorithm for new uses; SHA-384 is preferred for signatures and key derivation contexts.

**Message Authentication (HMAC)**  
`crypto.subtle.sign()` and `crypto.subtle.verify()` with algorithm `HMAC` provide authenticated message signing and verification. HMAC requires a symmetric `CryptoKey` with `sign` and/or `verify` usages. Used in this architecture for: API request signing, CSRF token generation, webhook verification.

**Authenticated Encryption (AES-GCM)**  
`crypto.subtle.encrypt()` and `crypto.subtle.decrypt()` with algorithm `AES-GCM` provide authenticated encryption. AES-GCM is the correct algorithm for encrypting data at rest and in transit at the application layer. It provides both confidentiality (AES) and integrity/authenticity (GCM's authentication tag) in a single operation.

AES-CTR and AES-CBC are also available but require manual integrity protection (combining them with an HMAC is the correct pattern). AES-GCM is preferred for all new implementations because it provides authenticated encryption by default — using AES without the authentication guarantee is a common design error.

**Asymmetric Signatures (ECDSA, RSA-PSS)**  
For document signing, JWT verification, and scenarios where the signing party and verifying party are separate, asymmetric signatures are required. ECDSA with the P-256 or P-384 curve provides a good balance of security and performance. RSA-PSS is available for interoperability with RSA key infrastructure.

**Key Agreement (ECDH, X25519)**  
`crypto.subtle.deriveKey()` and `crypto.subtle.deriveBits()` with ECDH provide Diffie-Hellman key exchange over elliptic curves. Used for establishing shared secrets between parties without transmitting the secret over the network. X25519 (Curve25519) is the preferred modern curve where supported; P-256 ECDH is the widely-available fallback.

**Key Derivation (HKDF, PBKDF2)**  
`PBKDF2` derives a cryptographic key from a password with a configurable iteration count, providing brute-force resistance for password-based encryption. `HKDF` derives multiple keys from a single master key or shared secret, and is the correct algorithm for expanding a shared secret from ECDH into usable encryption and authentication keys.

### CryptoKey Objects and Non-Extractability

SubtleCrypto does not work with raw bytes for keys. All operations consume and produce `CryptoKey` objects — opaque handles to key material. By default, keys are **non-extractable**: even the application that created the key cannot read its raw material from JavaScript. This provides a meaningful security guarantee — an XSS attack cannot exfiltrate a non-extractable key, because there is no API through which the key material is accessible as a string or buffer.

Keys can be made extractable at creation time when portability is required (e.g., exporting a public key for transmission). Non-extractable is the correct default; extractable should be used only when there is a documented requirement for it.

**Key usage declarations:** Every `CryptoKey` is created with a declared set of usages — `['sign']`, `['encrypt', 'decrypt']`, `['deriveKey']`, etc. Attempting to use a key for an undeclared operation throws a `DOMException`. This restricts key misuse: an HMAC key cannot be used for encryption, and an encryption key cannot be used as a signing key.

### CryptoKey Storage

`CryptoKey` objects are **structured-cloneable** — they can be stored in IndexedDB and retrieved in subsequent sessions without being exposed as extractable bytes. This enables persistent key storage (e.g., for long-lived device identity keys or session keys) without ever materialising the raw key bytes in JavaScript.

The storage pattern: generate a key with `generateKey()`, store it in IndexedDB via `put()`, retrieve it with `get()`. The key survives page refreshes and browser restarts without ever being exported. The only way to lose access to a stored key is IndexedDB eviction — which is mitigated by requesting persistent storage via `navigator.storage.persist()`.

### Key Wrapping

For scenarios where keys must be exported and re-imported (key backup, key escrow, transferring keys between devices), `crypto.subtle.wrapKey()` encrypts the key material before export using another key — typically a key-encryption key (KEK). `crypto.subtle.unwrapKey()` reverses this. Key wrapping means keys can be exported without ever appearing as plaintext in application memory.

### The Modern Algorithms Proposal

The WICG Modern Algorithms for WebCrypto proposal (Community Group Report, March 2026) proposes adding post-quantum and high-performance algorithms to `SubtleCrypto`: ML-KEM (Key Encapsulation Mechanism, post-quantum), Ed25519/X25519 (modern curve signatures and key agreement), and `SubtleCrypto.supports()` for algorithm feature detection. None of these are in Baseline as of mid-2026. The architecture's `core.security` layer must be designed to accommodate new algorithms behind feature-detection guards without architectural changes to the calling code.

### Secure Random Values

`crypto.getRandomValues(typedArray)` fills a typed array with cryptographically strong random values. This is the only source of randomness that should be used in any security-relevant context in this architecture. `Math.random()` is a pseudo-random number generator unsuitable for cryptographic use.

`crypto.randomUUID()` generates a cryptographically random UUID v4. It is the correct way to generate unique identifiers for session tokens, correlation IDs, or any identifier that must not be guessable.

---

---

## 3. Content Security Policy

### Why CSP Exists and What It Does

Content Security Policy is an HTTP response header that restricts which resources the browser is permitted to load and execute. Its primary purpose is to prevent Cross-Site Scripting: even if an attacker successfully injects HTML into the page, CSP prevents the injected script from executing if it does not meet the policy's criteria.

CSP is the application-level last line of defence against XSS. It does not replace input sanitisation or output encoding; it supplements them. A site that relies solely on CSP for XSS protection is incorrectly architected. A site without CSP is missing a critical defensive layer.

### The Two CSP Models

**Allowlist-based CSP** specifies the origins from which resources may be loaded (`script-src 'self' https://cdn.example.com`). This model is widely understood but fundamentally weak: research (CSP Is Dead, Long Live CSP, 2016; validated by subsequent analysis) demonstrated that the majority of real-world allowlist CSPs can be bypassed by an attacker who can inject an arbitrary URL hosted on a trusted origin. JSONP endpoints, Angular application bootstraps, and CDN-hosted user content are common bypass vectors. **Allowlist-based CSP is insufficient as the primary XSS control.**

**Strict CSP** uses nonces or hashes to authorise individual scripts rather than broad origins. It is robust against the bypass vectors that defeat allowlist-based policies.

### Strict CSP Structure for This Architecture

This architecture uses a hash-based strict CSP for static SPA deployments (where the script content is known at build time) and a nonce-based strict CSP for any server-rendered HTML responses.

**Hash-based (static SPA):**

```
Content-Security-Policy:
  script-src 'sha384-<hash-of-bootstrap-script>' 'strict-dynamic' https: http:;
  object-src 'none';
  base-uri 'none';
  require-trusted-types-for 'script';
  report-uri /csp-report-endpoint;
```

**Nonce-based (server-rendered or SSR responses):**

```
Content-Security-Policy:
  script-src 'nonce-{random-per-request}' 'strict-dynamic' https: http:;
  object-src 'none';
  base-uri 'none';
  require-trusted-types-for 'script';
  report-uri /csp-report-endpoint;
```

### Directive Analysis

**`script-src` with nonce or hash + `'strict-dynamic'`**  
`'strict-dynamic'` propagates trust: any script executing with a trusted nonce or hash may dynamically load additional scripts. This solves the problem of module loading — the bootstrap script that loads the Import Map and the application entry point is nonce/hash-trusted; every module it imports transitively inherits trust. Without `'strict-dynamic'`, dynamic `import()` in a strict CSP would require pre-hashing every module, which is impractical.

The `https:` and `http:` fallbacks in the `script-src` value provide backwards compatibility for browsers that do not support nonces or `strict-dynamic` — they receive a permissive policy rather than a broken page. In CSP3-supporting browsers (all modern engines), these fallbacks are ignored when a nonce or `strict-dynamic` is present.

**`object-src 'none'`**  
Disables `<object>`, `<embed>`, and `<applet>` elements, which historically provided alternative script execution paths that bypassed `script-src`. These elements have no legitimate use in modern web applications.

**`base-uri 'none'`**  
Disables `<base>` tag overrides. Without this, an attacker who can inject a `<base href="...">` element can redirect all relative URL script loads to an attacker-controlled server. This directive eliminates that attack vector.

**`require-trusted-types-for 'script'`**  
Enables Trusted Types enforcement (see §4). This directive causes the browser to throw a `TypeError` when any injection sink (`innerHTML`, `script.src`, `eval`, etc.) receives a plain string instead of a Trusted Type object. This directive is now supported in all modern browsers as of February 2026 (Baseline Newly Available).

**`style-src`**  
This architecture does not require `unsafe-inline` for styles. Shadow DOM encapsulates component styles using `<style>` tags inside shadow roots. Constructable Stylesheets (`new CSSStyleSheet()`) are used for shared styles. Neither requires `unsafe-inline` in the `style-src` directive. `style-src 'self'` with hash-exceptions for any inline critical CSS in the document `<head>` is sufficient.

**`report-uri` / `report-to`**  
CSP violations are reported to a server endpoint. Violations indicate either a policy misconfiguration, an attempted injection, or a third-party resource that is not declaring its own content correctly. All violations are logged and treated as security signals. The newer `report-to` directive (using the Reporting API) is preferred where supported, with `report-uri` as a fallback.

### No `unsafe-inline`, No `unsafe-eval`

This architecture's module-based design makes `unsafe-inline` and `unsafe-eval` unnecessary by construction:

- All scripts are ES Modules loaded as external files — no inline `<script>` blocks required (beyond the bootstrap nonce/hash-protected block)
- No `eval()` anywhere in the codebase — dynamic code execution is prohibited by architectural rule
- No `Function()` constructor, no `setTimeout(string)`, no `setInterval(string)` — all dynamic execution patterns are prohibited
- No inline event handlers (`onclick="..."`) — all event handling is done via `addEventListener`

The absence of these patterns means the CSP can enforce the absence of `unsafe-inline` and `unsafe-eval` without breaking any legitimate functionality. A CSP violation report for these directives is, by definition, either a misconfiguration or an attempted injection.

### CSP Deployment Strategy

**Phase 1 — Report-Only Mode:** Deploy CSP as `Content-Security-Policy-Report-Only`. Violations are reported but not enforced. Monitor reports for false positives before enabling enforcement.

**Phase 2 — Enforcement with Known Exceptions:** Move to `Content-Security-Policy`. Address all remaining violations. Any legitimate inline script must be refactored to an external module file.

**Phase 3 — Trusted Types enforcement:** Add `require-trusted-types-for 'script'` after all injection sinks in the codebase have been audited and wrapped with Trusted Types policies.

**Phase 4 — Continuous Monitoring:** Violations in production are treated as security incidents, reviewed within 24 hours, and used to harden the policy further.

---

---

## 4. Trusted Types API

### Status Update — Baseline Newly Available, February 2026

**Spec:** W3C Trusted Types (part of CSP Level 3, W3C Working Draft, March 2026)  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API`  
**Status:** Baseline Newly Available since February 2026  
**CSP directive:** `require-trusted-types-for 'script'`

Trusted Types became Baseline Newly Available in February 2026, meaning they are now supported across all major browser engines. The previous architecture specification treated Trusted Types as a future consideration ("where supported"); this version elevates them to a first-tier security requirement. The `require-trusted-types-for 'script'` CSP directive is now deployable across the user base without requiring a Chromium-only fallback.

### The Problem Trusted Types Solves

DOM-based XSS occurs when attacker-controlled data reaches a **DOM XSS sink** — an API that interprets its string argument as executable code. Common sinks include:

- `element.innerHTML = untrustedString`
- `element.outerHTML = untrustedString`
- `document.write(untrustedString)`
- `script.src = untrustedString`
- `element.setAttribute('href', 'javascript:...')`
- `eval(untrustedString)`
- `setTimeout(untrustedString, delay)`

The difficulty is that these sinks are scattered across a codebase. In a large application, identifying every location where unsanitised data might reach a sink is a manual, error-prone process. A single missed location is sufficient for a successful XSS attack.

Trusted Types solves this by changing the model: instead of requiring developers to find and sanitise every sink, it makes the sink itself refuse plain strings. When `require-trusted-types-for 'script'` is in effect, passing a plain string to `innerHTML` throws a `TypeError`. The only way to use the sink is to pass a `TrustedHTML` object produced by a declared Trusted Types policy. This shifts the security boundary: instead of "all the places untrusted data might go", the policy concentrates the risk at "all the places sanitisation is intentionally performed", which is a much smaller and more manageable set.

### Trusted Types Concepts

**Injection Sinks** — The APIs that interpret input as code. The Trusted Types API classifies them into three types:

- HTML sinks: APIs that parse strings as HTML (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `setHTMLUnsafe`)
- Script sinks: APIs that execute strings as scripts (`script.src`, `eval`, `Function`, `setTimeout` with a string argument)
- URL sinks: APIs that treat strings as potentially navigable URLs (`script.src`, `a.href`, `iframe.src`)

**Policy Objects** — A policy is created via `window.trustedTypes.createPolicy(name, rules)`. The policy object has three methods: `createHTML(input)`, `createScript(input)`, and `createScriptURL(input)`. Each method receives the untrusted input string and must return a sanitised value. The policy is where sanitisation actually occurs.

**Trusted Type Objects** — When a policy method returns, it produces a `TrustedHTML`, `TrustedScript`, or `TrustedScriptURL` object. These are opaque wrappers. When passed to an injection sink, the browser accepts them without complaint. When a plain string is passed to the same sink, the browser throws.

**Default Policy** — `window.trustedTypes.createPolicy('default', rules)` creates a special fallback policy. If Trusted Types enforcement is active and code passes a plain string to a sink, before throwing, the browser calls the `default` policy's `createHTML(input)` method. This allows a gradual migration: the default policy can log the violation and return a sanitised version rather than immediately breaking existing code. The default policy is a migration aid, not a production architecture; it must be removed once all sinks in the codebase have been migrated to explicit policy usage.

### Trusted Types in This Architecture

This architecture defines a single named policy, `core-sanitize`, with the following behaviour:

- `createHTML(input)`: passes the input through the active sanitisation strategy (native `Sanitizer` API where available; DOMPurify as a fallback — see §5 and §6). Returns the sanitised markup.
- `createScript(input)`: always throws. No scenario in this architecture requires creating a `TrustedScript` from dynamic input. If this policy method is invoked, it means a string is being sent to a script sink unexpectedly — which is always an error.
- `createScriptURL(input)`: validates the URL against an allowlist of permitted script sources. Returns the URL only if it is same-origin or appears in the CSP's declared CDN origins. Rejects anything else.

The `core.security.sanitize(html, config?)` API (see §6) is the public interface that wraps the Trusted Types policy. Application code never calls `trustedTypes.createPolicy()` directly; it calls `core.security.sanitize()`.

### Trusted Types and Shadow DOM

Shadow DOM is not a security boundary for Trusted Types purposes. The Trusted Types enforcement applies to all injection sinks regardless of whether they are in the light DOM or a shadow tree. Component code that writes to `shadowRoot.innerHTML` is subject to the same enforcement as code writing to `document.body.innerHTML`.

The correct Shadow DOM rendering pattern — using DOM API calls (`createElement`, `textContent`, `setAttribute`) rather than string-based `innerHTML` — is inherently compatible with Trusted Types because those APIs are not injection sinks. Trusted Types enforcement only activates for the string-based injection APIs.

---

---

## 5. HTML Sanitizer API

### Current Status (May 2026)

**Spec:** WICG HTML Sanitizer API  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API`  
**Status:** Not Baseline. Early limited availability.  
**Firefox 148:** Shipped standardised API (February 2026)  
**Chrome:** Available in Canary behind a flag  
**Safari:** Has not started implementation; team has signalled a positive position

The Sanitizer API has begun shipping in 2026 but is not yet cross-browser. It cannot be used without a fallback for production applications. This section documents its design and APIs for progressive adoption as browser support broadens.

### The Sanitizer API Design

The Sanitizer API provides DOM-integrated sanitisation via four methods, split into safe and unsafe categories:

**Safe methods (always apply the XSS-safety baseline):**

- `element.setHTML(untrustedString, { sanitizer? })` — parses `untrustedString` as HTML in the context of `element`, applies the sanitizer configuration, strips all XSS-unsafe elements and attributes unconditionally, and replaces the element's children with the result.
- `shadowRoot.setHTML(untrustedString, { sanitizer? })` — same, targeting a shadow root.
- `Document.parseHTML(string, { sanitizer? })` (static method) — parses a string into a new `Document`, applying sanitisation.

**Unsafe methods (configurable; XSS-unsafe elements can be explicitly allowed):**

- `element.setHTMLUnsafe(untrustedString, { sanitizer? })` — like `setHTML` but does not enforce the XSS-safety baseline. If the sanitizer configuration allows `<script>`, scripts will be inserted. Name is intentionally alarming.
- `shadowRoot.setHTMLUnsafe(untrustedString, { sanitizer? })` — same, for shadow roots.
- `Document.parseHTMLUnsafe(string, { sanitizer? })` (static method) — like `parseHTML` but without the baseline.

The safe/unsafe distinction is built into the method name — `setHTMLUnsafe` is not a subtle flag; it is a declaration in the method name that the call is potentially dangerous. This naming convention should not be ignored.

### The XSS-Safety Baseline

`setHTML()` always removes the following, regardless of the sanitizer configuration:

- `<script>`, `<frame>`, `<iframe>`, `<embed>`, `<object>`, `<use>` elements
- All event handler content attributes (`onclick`, `onmouseover`, `onerror`, `onload`, etc.)
- `javascript:` URL values

These are the elements and attributes through which XSS is executed. The baseline removal makes `setHTML()` a safe drop-in replacement for `innerHTML` for user-generated content — the worst a misconfigured sanitizer can do is allow unexpected formatting; it cannot allow script execution.

### Sanitizer Configuration

A `Sanitizer` instance is constructed from a `SanitizerConfig` dictionary that specifies allow and deny lists for elements and attributes. A `Sanitizer` can be created once and reused across multiple `setHTML` calls, which is more efficient than repeatedly parsing configuration.

Configuration is expressed as either an allowlist ("allow only these elements") or a denylist ("allow all elements except these"). For user-generated content like rich text from a WYSIWYG editor, an explicit allowlist of permitted formatting elements is the correct approach — it is safer and more predictable than a denylist.

When no sanitizer is provided to `setHTML()`, the default configuration is used: most standard HTML elements and their common attributes are permitted, with the XSS-safety baseline always applied.

### setHTMLUnsafe and Declarative Shadow DOM

`setHTMLUnsafe()` has a specific legitimate use case that safe `setHTML()` cannot address: inserting Declarative Shadow DOM markup. `<template shadowrootmode="open">` requires the `shadowrootmode` attribute on a `<template>` element — content that `setHTML()` would treat as unsafe. When inserting server-rendered Declarative Shadow DOM markup into a document (for hydration or dynamic insertion of pre-rendered components), `setHTMLUnsafe()` with a carefully constructed sanitizer that permits `<template shadowrootmode>` is the correct approach.

This is the **only** sanctioned use of `setHTMLUnsafe()` in this architecture. Its use must be documented with a comment explaining why the unsafe variant is required for the specific call site.

---

---

## 6. The core.security Sanitisation Interface

### Swappable Sanitisation Strategy

The architecture's sanitisation interface abstracts the underlying implementation:

```
core.security.sanitize(htmlString, config?)   → TrustedHTML | string
core.security.sanitizeStrict(htmlString)      → TrustedHTML | string
core.security.isSafe(htmlString)              → boolean
```

The `sanitize()` method routes to the active sanitisation strategy based on feature availability:

1. **Tier 1 — Native Sanitizer API:** Where `Element.prototype.setHTML` is available (Firefox 148+; Chrome Canary flag as of mid-2026), the native `Sanitizer` is used. Zero dependency, zero bundle weight, browser-native parsing.
2. **Tier 2 — DOMPurify:** Where the native API is not available, DOMPurify is used. DOMPurify is a well-audited, widely deployed library. It parses the input using a `DOMParser` sandbox and returns clean markup.
3. **The result is always wrapped in the Trusted Types `core-sanitize` policy**, producing a `TrustedHTML` object ready for use with any HTML injection sink.

This layered strategy means that as native Sanitizer API browser support broadens, the application progressively migrates without code changes at the call site. `core.security.sanitize()` is the only call site that changes; all consumers of the interface remain unchanged.

### `sanitizeStrict`

A configuration that allows only plaintext-equivalent markup: `<p>`, `<br>`, `<b>`, `<i>`, `<em>`, `<strong>`, `<a href>` with URL validation. All other elements and attributes are stripped. Used for user-generated content in contexts where rich formatting is not warranted (comments, user names rendered in markup, notification messages).

### What Is Never Sanitised

Sanitisation is for user-generated HTML content. For all non-user-generated content — the application's own markup, template clones, programmatically constructed UI — sanitisation is unnecessary and must not be performed. The correct rendering path for application-generated content is DOM API calls: `createElement`, `textContent`, `setAttribute`. These APIs do not parse HTML and therefore cannot introduce XSS regardless of the string content. Routing application-generated content through a sanitiser adds latency and obscures the distinction between trusted and untrusted content.

The rule: sanitisation is for **untrusted input crossing a trust boundary** (user input, third-party API responses that contain markup, pasted content). It is not a general-purpose HTML-generation mechanism.

---

---

## 7. Cross-Origin Security Architecture

### The Same-Origin Policy

The Same-Origin Policy (SOP) is the web's foundational security model. Two URLs have the same origin if and only if their scheme, host, and port all match. Resources from different origins cannot access each other's DOM, cookies, or storage without explicit opt-in.

This architecture never weakens or circumvents the SOP. CORS headers are a server responsibility; the application layer makes no attempt to work around origin restrictions. When cross-origin communication is needed, the explicit mechanisms are used: `postMessage` for window-to-window communication, CORS for cross-origin HTTP requests, and `MessageChannel` for bidirectional worker communication.

### Credentials and the Explicit Inclusion Model

In the Fetch API, credentials (cookies, HTTP authentication headers, TLS client certificates) are **not** sent on cross-origin requests by default (`credentials: 'same-origin'` is the default). Sending credentials to another origin requires explicit opt-in in both directions: the request must declare `credentials: 'include'`, and the server must respond with `Access-Control-Allow-Credentials: true` and a specific (non-wildcard) `Access-Control-Allow-Origin`.

This architecture codifies the explicit model: no request in `core.api` sends credentials unless the request explicitly declares `credentials: 'include'` and the target URL is on the declared list of credentialed origins. Implicit credential leakage — where a library or framework silently adds credentials to requests — is a design error that this explicit model prevents by construction.

### Tabnapping Prevention

`window.opener` allows a page opened via `window.open()` or `target="_blank"` to access the opening page's `window` object. An attacker who tricks a user into opening a malicious page (via a `target="_blank"` link) can use `window.opener.location.href =` to silently redirect the original page to a phishing site.

The mitigations:

- All `<a target="_blank">` links in this architecture must include `rel="noopener noreferrer"`. `noopener` nullifies `window.opener`; `noreferrer` suppresses the `Referer` header and implies `noopener`.
- The `Cross-Origin-Opener-Policy: same-origin` header (see §8) prevents cross-origin openers and opened windows from accessing each other's `window` objects at the browser process level.

### Referer Policy

The `Referer` header exposes the URL of the page that initiated a navigation or request. URL-embedded sensitive data (authentication tokens in query strings, user IDs in paths) can leak via `Referer` headers to third-party resources. The application uses the `Referrer-Policy: strict-origin-when-cross-origin` header:

- Same-origin requests: full URL is sent
- Cross-origin requests: only the origin (scheme + host + port), not the path or query string
- HTTPS → HTTP requests: no `Referer` at all

This prevents sensitive URL components from leaking to third parties while preserving useful analytics for same-origin navigation.

---

---

## 8. Cross-Origin Isolation — COOP, COEP, and CORP

### The Spectre Threat and the Process Isolation Response

Spectre is a class of CPU vulnerabilities (disclosed 2018) that allow a malicious process to read memory from adjacent memory regions through speculative execution side channels. In browser terms: a malicious page in the same renderer process as a victim page could potentially read the victim's memory, including authentication tokens, private data, and sensitive UI state.

The browser's response was to implement **site isolation** (placing different sites in different processes) and to restrict access to high-resolution timers and `SharedArrayBuffer` — the primitives that make Spectre timing attacks feasible. These powerful features are now gated behind **cross-origin isolation**, a state the application must explicitly opt into using three headers.

### Cross-Origin-Opener-Policy (COOP)

**MDN:** `developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy`  
**Baseline:** Widely Available

COOP controls whether the application's top-level browsing context can share a process group with cross-origin contexts. The values:

- `unsafe-none` (default): The page may share a process group with any origin. No process isolation guarantee.
- `same-origin-allow-popups`: Same-origin windows are allowed in the same group; cross-origin popups (like OAuth flows) receive a separate group but can still be referenced by `window.open()`. This is the recommended value for applications that must open cross-origin popup flows.
- `same-origin`: The most restrictive. Only same-origin documents may share the browsing context group. Cross-origin popups are always in a separate group and `window.opener` is null for them. Required for full cross-origin isolation.

For applications that use `SharedArrayBuffer` or `performance.measureUserAgentSpecificMemory()`, `COOP: same-origin` is required. For applications with OAuth or payment popup flows, `same-origin-allow-popups` is the practical compromise.

### Cross-Origin-Embedder-Policy (COEP)

**MDN:** `developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy`  
**Baseline:** Widely Available

COEP controls whether the application's page may load cross-origin resources that have not explicitly consented to being loaded cross-origin. The values:

- `unsafe-none` (default): Cross-origin resources load normally.
- `require-corp`: Cross-origin resources must be served with either a CORS header (`Access-Control-Allow-Origin`) or a `Cross-Origin-Resource-Policy` header. Resources that have neither are blocked.
- `credentialless`: Cross-origin resources that don't have CORP headers are loaded, but without credentials (cookies, auth headers). This is a less strict alternative that works with CDNs that don't set CORP. Chrome 96+ and Firefox 119+; Safari joined in 2024. Preferred for applications with wide third-party resource usage.

### Cross-Origin Resource Policy (CORP)

**MDN:** `developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Resource-Policy`

CORP is set by resource servers to declare who may load their resources:

- `same-origin`: Only same-origin pages may load this resource
- `same-site`: Only same-site pages (same registrable domain) may load this resource
- `cross-origin`: Any origin may load this resource

For the application's own static assets (fonts, images, scripts), `same-origin` or `same-site` is appropriate. Resources intended for cross-origin use (a public API, a CDN-hosted library) should declare `cross-origin`.

### The `crossOriginIsolated` State

When both `COOP: same-origin` and `COEP: require-corp` (or `credentialless`) are in effect, `window.crossOriginIsolated` returns `true`. This state unlocks:

- `SharedArrayBuffer` for multi-threaded computation (Wasm threads, multi-core audio worklets)
- High-resolution timers (`performance.now()` with full precision rather than the jitter-reduced precision used to mitigate Spectre)
- `performance.measureUserAgentSpecificMemory()` (see memory-management.md §12.1)

**The deployment constraint:** COOP/COEP break several common integrations. OAuth flows that open popup windows are disrupted by `same-origin` COOP. Third-party iframes (payment widgets, social embeds, maps) that don't set CORP headers are blocked by `require-corp` COEP. Applications must assess which powerful features they need and whether the cross-origin isolation constraint is compatible with their third-party integrations before enabling it. `credentialless` COEP reduces the integration impact significantly.

---

---

## 9. Subresource Integrity

### The Supply Chain Attack Problem

When the application loads resources from external origins — CDN-hosted JavaScript, fonts, stylesheets — it implicitly trusts that CDN. If an attacker compromises the CDN (or executes a man-in-the-middle attack on the TLS connection), they can serve modified resources containing malicious code. This is a supply chain attack, and it bypasses the application's own security controls entirely.

**Spec:** W3C Subresource Integrity Level 2 (Working Draft, March 2026)  
**MDN:** `developer.mozilla.org/en-US/docs/Web/Security/Defenses/Subresource_Integrity`  
**Baseline:** Widely Available

SRI solves this by including a cryptographic hash of the expected resource content in the HTML that requests it. The browser computes the hash of the fetched resource and compares it to the declared hash. If they differ, the resource is rejected and a CSP violation is reported.

### SRI Hash Format

An SRI hash is expressed as `algorithm-base64EncodedHash` in the `integrity` attribute of `<script>` and `<link>` elements. The valid algorithms are SHA-256, SHA-384, and SHA-512. SHA-384 is the minimum recommended for new use; SHA-256 provides adequate security but is weaker. SHA-512 provides additional margin at the cost of a longer hash string.

Multiple hashes may be provided, allowing fallback: the browser accepts the resource if it matches any of the declared hashes. This enables transparent algorithm migration — declare both SHA-384 and SHA-512 hashes during a transition period.

### SRI and Import Maps

Import Maps declare the URL mappings for bare module specifiers. SRI cannot currently be declared inline in an Import Map in the standard format — the Import Map specification does not include an integrity field. This is a known gap. The WICG Import Maps repository (archived February 2025, moved to the HTML Standard) has an open issue discussing this.

The current mitigation: ES Modules loaded via `<link rel="modulepreload" integrity="...">` can declare SRI hashes for individual modules. Declaring `modulepreload` hints for all external dependencies with their SRI hashes in the `<head>` provides integrity verification for those modules when they are eventually imported.

For dynamically imported modules (route-level code splitting), SRI verification is not natively supported via the standard `import()` syntax as of mid-2026. The mitigation is to restrict dynamically imported modules to same-origin URLs (where the TLS connection provides transport integrity) and to apply the Import Map's scope restriction to prevent unexpected cross-origin dynamic imports.

### SRI and the CSP Relationship

An SRI failure produces a network block (the resource is not applied) and a CSP violation report. The two mechanisms are independent but complementary: CSP restricts which origins scripts may load from; SRI verifies that the content from those origins has not been tampered with.

---

---

## 10. Permissions API

### Specification and Status

**Spec:** W3C Permissions  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Permissions_API`  
**Baseline:** Widely Available

`navigator.permissions.query({ name: 'permission-name' })` resolves to a `PermissionStatus` object with a `state` property:

- `'granted'` — The user has previously granted this permission. The feature may be used without a prompt.
- `'denied'` — The user has previously denied this permission. Attempting to use the feature will either silently fail or throw. Do not prompt the user; the decision is final until they manually change it in browser settings.
- `'prompt'` — The user has not yet made a decision. Invoking the feature API will show the browser's permission prompt.

The `PermissionStatus` object is an `EventTarget`. Subscribing to its `change` event allows the application to react when the user's permission state changes — for example, if the user revokes camera access while the application is open. The change event fires synchronously when the state changes.

### Permission-Gated Features

Every permission-gated feature in this architecture must pass through the `core.security.permission(name)` interface before use:

|Feature|Permission Name|Notes|
|---|---|---|
|Clipboard read|`'clipboard-read'`|Requires user gesture to prompt|
|Clipboard write|`'clipboard-write'`|Auto-granted for same-origin content|
|Notifications|`'notifications'`|Must not be requested without user intent signal|
|Geolocation|`'geolocation'`|Prompt should be contextual; not on page load|
|Camera|`'camera'`|Prompt only when actively needed|
|Microphone|`'microphone'`|Prompt only when actively needed|
|Persistent Storage|`'persistent-storage'`|Should be requested silently; browsers may auto-grant|
|File System Access|`'file-system'` (Access Handle Pool)|Implicit in `showOpenFilePicker()`|
|MIDI|`'midi'`|Rarely needed|

### The Three-State Handling Contract

Every call site that uses a permission-gated feature must handle all three `PermissionStatus` states:

**`'granted'`:** Invoke the feature. No prompt will appear. Log the access for audit purposes if required by the application's data governance model.

**`'denied'`:** Display a contextual explanation of the feature's benefit and instructions for re-enabling the permission in browser settings. Do not attempt to invoke the feature. Do not re-prompt. Do not show the browser's permission prompt (it is suppressed when the state is `'denied'`).

**`'prompt'`:** Invoke the feature only in response to a meaningful user gesture (a button click that is directly linked to the feature's benefit, not a page load). The browser requires a user gesture for most permission prompts. Requesting a permission at page load with no contextual justification is both likely to be denied and likely to degrade user trust.

### Permission Changes During Session

The `change` event on `PermissionStatus` must be handled. If a user revokes camera access while a video call is in progress, the application must:

1. Detect the permission change
2. Cleanly stop the media stream
3. Display an appropriate UI indicating that the camera is no longer accessible
4. Not crash or fall into an inconsistent state

This requires that permission `PermissionStatus` objects are long-lived (held as component instance properties or module-level references) rather than created per-call. A `PermissionStatus` that is created, queried, and then discarded provides no change notification capability.

---

---

## 11. Permissions Policy

### Specification and Status

**Spec:** W3C Permissions Policy (Working Draft)  
**MDN:** `developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Permissions_Policy`  
**Baseline:** Widely Available (formerly known as Feature Policy)

The `Permissions-Policy` HTTP header controls which browser features are available to the application's top-level context and to any embedded `<iframe>` documents. It operates independently of the Permissions API (which controls whether the browser shows a permission prompt to the user); Permissions Policy controls whether the feature is accessible at all, regardless of user permission state.

A feature disabled by Permissions Policy cannot be enabled by the user granting a permission. The two systems are layered: Permissions Policy defines the outer boundary of what the application will use; the Permissions API governs what the user has agreed to within that boundary.

### Defence-in-Depth Application

A web application that does not use geolocation should disable geolocation via Permissions Policy. If an XSS attack injects code that attempts to access the user's location, Permissions Policy causes that access to fail — even if the injected code correctly calls the Geolocation API and even if the user has previously granted geolocation permission to the site.

This is the Permissions Policy's primary security value: reducing the application's accessible attack surface. Features the application does not need are disabled, limiting what a successful attacker can exploit.

### Recommended Default Policy for This Architecture

The application deploys a restrictive-by-default Permissions Policy, explicitly enabling only the features that are actually used. Features not listed are disabled by default for all contexts including iframes:

```
Permissions-Policy:
  camera=(),
  microphone=(),
  geolocation=(),
  payment=(),
  usb=(),
  bluetooth=(),
  serial=(),
  accelerometer=(),
  gyroscope=(),
  magnetometer=(),
  ambient-light-sensor=(),
  display-capture=()
```

Features used by the application are listed with their permitted origins. If the application supports camera access for profile photos, the header includes `camera=(self)` rather than `()`.

### Permissions Policy and Iframes

The `allow` attribute on `<iframe>` elements is the per-frame override for Permissions Policy. An embedded frame only receives a feature if both: the parent document's `Permissions-Policy` header permits it for the embedded origin, and the iframe's `allow` attribute includes it.

An `<iframe>` without an explicit `allow` attribute inherits the parent's Permissions Policy for same-origin frames and receives a default-deny policy for cross-origin frames. Cross-origin iframes must explicitly be granted the features they need; they do not inherit the parent's grants.

---

---

## 12. Secure Contexts and HTTPS

### The Secure Context Requirement

**MDN:** `developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts`  
**Baseline:** Widely Available (the concept; enforcement is browser-specific)

A **secure context** is a `Window` or `Worker` that meets the browser's minimum security requirements — primarily that it was delivered over HTTPS (or from localhost for development). The vast majority of the powerful browser APIs used in this architecture are restricted to secure contexts:

- `SubtleCrypto` / `crypto.subtle`
- Service Workers
- `navigator.storage.persist()` and `navigator.storage.estimate()`
- `navigator.deviceMemory`
- Push Notifications
- Web Authentication (WebAuthn)
- `Clipboard` API (read operations)
- `navigator.getBattery()`
- WebBluetooth, WebUSB, WebSerial
- WebXR

Running the application without HTTPS is not a configuration option for production. HTTPS is a prerequisite for the architecture's functionality, not just a security recommendation.

### HTTP Strict Transport Security (HSTS)

**MDN:** `developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security`

The `Strict-Transport-Security` header instructs the browser to only access the origin via HTTPS, even if the user types the URL without `https://`. A `max-age` of at least one year (31536000 seconds) is recommended for production. `includeSubDomains` applies the policy to all subdomains. `preload` marks the origin for inclusion in browser HSTS preload lists, which prevents the first-connection downgrade attack.

The recommended HSTS header for this architecture:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

63072000 seconds is two years, providing a wider safety margin than the minimum year requirement.

---

---

## 13. Storage Security

### Security Properties of Each Storage Mechanism

**`localStorage` / `sessionStorage`**  
Both are accessible to any JavaScript running on the same origin, including injected scripts from an XSS attack. Authentication tokens and cryptographic keys **must not** be stored in `localStorage` or `sessionStorage`. Their only acceptable content is non-sensitive configuration data (UI preferences, locale settings) that could be compromised without enabling an account takeover.

**IndexedDB**  
IndexedDB is same-origin isolated. An XSS attack can access IndexedDB in the same origin, meaning sensitive data stored there is accessible to injected scripts. However, `CryptoKey` objects stored in IndexedDB are non-extractable — an XSS attack that retrieves a stored `CryptoKey` cannot read its material. The attack can use the key (sign a message, decrypt data) but cannot export it. This provides meaningful resistance.

**Cookie Storage**  
Cookies with `HttpOnly` are not accessible from JavaScript at all — including from XSS attacks. Authentication session cookies must be `HttpOnly`, `Secure`, `SameSite=Strict` (or `SameSite=Lax` for top-level navigations). The application layer does not manage authentication cookies; they are set by the server. The application layer must not attempt to read or write authentication cookies from JavaScript.

**Cache API**  
Cache API storage is accessible to Service Workers and to main-thread JavaScript on the same origin. Cached API responses must not contain sensitive data that should not persist beyond the session. Responses cached with sensitive information should be marked with appropriate cache control directives and must be explicitly evicted when the session ends (e.g., on logout, the Service Worker should clear its cache of authenticated responses).

**Origin Private File System (OPFS)**  
The OPFS (part of the File System Access API) provides a sandboxed, origin-private file system that is not accessible to the user or other origins. Files written here are not accessible from outside the origin, but like IndexedDB, they are accessible to JavaScript running on the origin (including injected scripts). Sensitive binary data written to OPFS should be encrypted with a non-extractable `CryptoKey` before storage.

### Persistent Storage and Eviction

As described in storage.md, browser agents may evict non-persistent storage under disk pressure. For security-relevant data — encryption keys in IndexedDB, offline-accessible authenticated data — the application must request persistent storage via `navigator.storage.persist()`. Persistent storage is not evicted automatically; the user or the browser's explicit clear data action is required to remove it.

The security implication: persistent storage survives logout if the logout flow does not explicitly clear it. The application's logout handler must explicitly delete security-relevant IndexedDB records, Cache API entries, and OPFS files as part of the logout process.

---

---

## 14. Worker Security Model

### Worker Origin Isolation

Workers (Dedicated, Shared, Service) run in the same origin as the document that created them. A Service Worker registered at `https://app.example.com/sw.js` can only intercept and handle requests within the scope `https://app.example.com/`. Workers cannot access the DOM of their controlling documents, but they can access the same origin's IndexedDB, Cache API, and OPFS.

This origin isolation means workers are subject to the same content security constraints as the main thread. A malicious script injected into the main thread context cannot escape its origin by communicating with workers — the workers are in the same origin and have no privileged access.

### Service Worker Security Considerations

Service Workers are powerful interceptors: they can modify network responses, serve content from cache, and interact with the IndexedDB. Their security implications:

**The SW Update Channel:** A Service Worker update is delivered over the network. If the Service Worker script itself can be tampered with (via a supply chain attack), the attacker gains control of the network interception layer. SRI cannot be applied to the registered Service Worker script itself (it would break the update mechanism). The mitigation is TLS integrity (HTTPS) and ensuring the server that serves the Service Worker script is hardened.

**Cache Poisoning:** A Service Worker that caches API responses and serves them without validation is vulnerable to cache poisoning — if an attacker can make the SW cache a malicious response, all subsequent requests for that resource serve the poisoned cache entry. Cache entries for sensitive data should carry validation logic (signature verification via SubtleCrypto, ETag/Last-Modified revalidation) to detect tampering.

**Stale Token Handling:** Service Workers cache requests including authentication headers. A cached response for an authenticated API call should not be served after the session ends. The SW's activation event must clear all authenticated-response caches on service worker update, and the logout flow must send a message to the SW instructing it to clear session-specific cache entries.

### postMessage Security

`Worker.postMessage()`, `window.postMessage()`, and `BroadcastChannel.postMessage()` deliver messages between contexts. The receiving end must validate:

- **Origin:** For `window.postMessage()`, the `event.origin` property identifies the sender's origin. Before processing any `message` event, the receiver must verify `event.origin` matches an expected value. The `targetOrigin` parameter on the sending side restricts delivery; `'*'` must never be used for sensitive messages.
- **Message shape:** Do not assume message contents are safe or well-formed. Validate message structure before acting on it. An attacker who can send a crafted message to a Worker via a compromised cross-origin frame can attempt to exploit message-handling code.

The correct pattern: the receiving Worker or window validates `event.origin`, validates the message schema, and processes only the fields it expects. Unknown fields are discarded.

---

---

## 15. Security Headers Reference

The complete set of security-relevant HTTP response headers for this architecture:

|Header|Recommended Value|Purpose|
|---|---|---|
|`Content-Security-Policy`|See §3|XSS prevention, source restriction|
|`Strict-Transport-Security`|`max-age=63072000; includeSubDomains; preload`|Force HTTPS, prevent downgrade|
|`X-Content-Type-Options`|`nosniff`|Prevent MIME type sniffing|
|`X-Frame-Options`|`DENY` or `SAMEORIGIN`|Clickjacking prevention (fallback for browsers without CSP `frame-ancestors`)|
|`Referrer-Policy`|`strict-origin-when-cross-origin`|Limit Referer header exposure|
|`Cross-Origin-Opener-Policy`|`same-origin` or `same-origin-allow-popups`|Process isolation; tabnapping prevention|
|`Cross-Origin-Embedder-Policy`|`credentialless` or `require-corp`|Cross-origin isolation (required for powerful features)|
|`Cross-Origin-Resource-Policy`|`same-origin` (for app assets)|Prevent cross-origin embedding of private assets|
|`Permissions-Policy`|Restrictive default; see §11|Reduce attack surface; disable unused powerful features|
|`Cache-Control`|`no-store` for authenticated responses|Prevent sensitive response caching in shared caches|
|`Reporting-Endpoints`|CSP and NEL report endpoint|CSP violation, deprecation, and network error reporting|

### X-Content-Type-Options

`nosniff` instructs the browser not to perform MIME type sniffing — not to override the declared `Content-Type` header by inspecting the content. Without this header, a browser might execute a JavaScript file served with `Content-Type: text/plain` if it detects that the content looks like JavaScript. With `nosniff`, the browser trusts the declared type, preventing a class of attacks where malicious content is served with an innocuous content type.

### X-Frame-Options and CSP frame-ancestors

`X-Frame-Options: DENY` prevents the application from being embedded in any `<iframe>`. `SAMEORIGIN` allows same-origin embedding. The modern equivalent is the CSP `frame-ancestors` directive, which provides more granular control. Both should be set for compatibility with older browsers: `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`.

---

---

## 16. Injection Sink Inventory

An **injection sink** is any DOM API, JavaScript function, or HTML attribute that interprets its input as code or markup. Every injection sink in the codebase must be accounted for: either it must be eliminated (replaced with a safe equivalent), or it must be guarded by a Trusted Types policy.

### Mandatory Elimination Sinks

The following injection sinks have no legitimate use in this architecture and must not appear in the codebase:

|Sink|Replacement|
|---|---|
|`eval(string)`|Code logic; no replacement needed if code is properly structured|
|`new Function(string)`|Code logic|
|`setTimeout(string, ...)`|`setTimeout(function, ...)`|
|`setInterval(string, ...)`|`setInterval(function, ...)`|
|`document.write(string)`|DOM API calls|
|`document.writeln(string)`|DOM API calls|
|Inline `onclick="..."` attributes|`addEventListener`|

The CSP's `unsafe-eval` absence enforces the first two mechanically at runtime. The Trusted Types enforcement makes the DOM sinks throw on plain strings. The static analysis linting rules enforce the remaining cases at development time.

### Guarded Sinks (Trusted Types Required)

The following sinks are legitimate but require Trusted Types guarding:

|Sink|Guardian|
|---|---|
|`element.innerHTML`|`core-sanitize` policy's `createHTML()`|
|`element.outerHTML`|`core-sanitize` policy's `createHTML()`|
|`element.insertAdjacentHTML()`|`core-sanitize` policy's `createHTML()`|
|`element.setHTMLUnsafe()`|Only for Declarative Shadow DOM; documented exception|
|`script.src`|`core-sanitize` policy's `createScriptURL()`|
|`link.href` (external stylesheet)|`core-sanitize` policy's `createScriptURL()`|

### Safe Sinks (No Guarding Required)

The following are not injection sinks — they do not parse or execute their input as code:

|API|Safety Reason|
|---|---|
|`element.textContent = string`|Sets text, never parsed as HTML|
|`element.setAttribute('data-*', string)`|Data attributes, not interpreted as code|
|`element.setAttribute('class', string)`|CSS class names, not interpreted as code|
|`element.setAttribute('aria-*', string)`|ARIA, not interpreted as code|
|`document.createElement(tagName)`|Creates elements; `tagName` is a string, not HTML|
|`new Text(string)`|Creates text node; string is never parsed|

The architecture's component rendering system uses only safe sinks for all application-generated content. Unsafe sinks only appear in the `core.security` sanitisation layer and are wrapped with Trusted Types policy calls.

---

---

## 17. Security Anti-Patterns Catalogue

**Pattern: Storing authentication tokens in localStorage**  
Risk: Accessible to XSS attacks; persists after logout until explicitly cleared.  
Correct: Use `HttpOnly` cookies for session tokens; use IndexedDB for non-sensitive session data; use non-extractable `CryptoKey` for cryptographic secrets.

**Pattern: Using `unsafe-inline` or `unsafe-eval` in CSP**  
Risk: Nullifies the XSS protection that CSP provides.  
Correct: Refactor inline scripts to external modules; use nonce/hash-based strict CSP.

**Pattern: Setting `targetOrigin: '*'` on postMessage with sensitive data**  
Risk: The message may be received by a cross-origin frame.  
Correct: Always specify the exact expected `targetOrigin`. For sensitive messages, verify `event.origin` on the receiving side as well.

**Pattern: Prompting for permissions at page load**  
Risk: Users deny permissions that are requested without context; denied permissions are permanent until manually changed.  
Correct: Request permissions at the moment of contextually obvious need, in direct response to a user gesture.

**Pattern: Reflecting URL parameters into innerHTML**  
Risk: Classic DOM XSS. An attacker crafts a URL that injects HTML via a reflected parameter.  
Correct: Read URL parameters with `URLSearchParams`; set their values using `textContent` or properly typed DOM APIs, never `innerHTML`.

**Pattern: Using DOMParser as a sanitiser without explicit element removal**  
Risk: `DOMParser.parseFromString(html, 'text/html')` parses the HTML but does not sanitise it. Script elements are not executed in the parsed document, but the resulting DOM contains them. If the parsed nodes are inserted into the live document, the scripts execute.  
Correct: Use `core.security.sanitize()` which removes unsafe elements from the parsed output before insertion.

**Pattern: Trusting `event.data` without origin verification in message handlers**  
Risk: Any page on the web can send a message to a window. Without origin checking, malicious messages can exploit message-handling logic.  
Correct: Every `message` event handler checks `event.origin` against the expected sender origin before processing.

**Pattern: Caching authenticated API responses without session-aware eviction**  
Risk: After logout, cached responses from the previous session may be served to the next user on a shared device.  
Correct: The logout flow sends a cache-clear instruction to the Service Worker; the SW deletes all entries from caches keyed to authenticated endpoints.

**Pattern: Using `eval()` to evaluate JSON**  
Risk: JSON with injected JavaScript (`{"key": "value"}; malicious_code()`) would execute.  
Correct: Use `JSON.parse()`. Never use `eval()` for any purpose.

**Pattern: Setting CORS headers with wildcard `*` on authenticated endpoints**  
Risk: Allows any origin to read the response from an authenticated endpoint (if credentials are also sent, which the wildcard `Access-Control-Allow-Origin` prevents — but a misconfiguration could combine both).  
Correct: CORS headers on authenticated endpoints must specify exact allowed origins, not wildcards.

---

---

## 18. Design Rules Summary

The following rules are security-level requirements for this architecture. Non-compliance is a blocker in code review.

**Rule 1 — All scripts are external modules.**  
No inline `<script>` blocks except the nonce/hash-protected bootstrap module loader. No inline event handlers.

**Rule 2 — No `eval`, `Function`, or string-based timer calls.**  
Dynamic code evaluation is prohibited without exception. Static analysis enforces this.

**Rule 3 — Every HTML injection sink uses a Trusted Types policy.**  
No plain string may be passed to `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `script.src`, or `document.write`. All calls go through `core.security.sanitize()` which produces `TrustedHTML` objects.

**Rule 4 — User-generated HTML is always sanitised before DOM insertion.**  
`core.security.sanitize()` must be called for any HTML string that originates from user input, a third-party API, or any source outside the application's own codebase.

**Rule 5 — Authentication tokens are not in JavaScript-accessible storage.**  
Session tokens are in `HttpOnly` cookies. Cryptographic secrets use non-extractable `CryptoKey` objects in IndexedDB.

**Rule 6 — Every permission-gated feature queries permission state before invocation.**  
`core.security.permission(name)` is called before any feature that requires user permission. All three permission states are handled explicitly.

**Rule 7 — Credentials are explicit, not implicit.**  
No `fetch` call sends credentials (`credentials: 'include'`) without an explicit declaration at the call site and a documented reason.

**Rule 8 — `window.postMessage` specifies `targetOrigin`.**  
No use of `'*'` as `targetOrigin` for messages containing any application state. Every `message` event handler validates `event.origin`.

**Rule 9 — All `<a target="_blank">` links include `rel="noopener noreferrer"`.**  
No exceptions. The `noopener` attribute is the minimum; `noreferrer` is the preferred form.

**Rule 10 — The logout flow explicitly clears security-relevant storage.**  
IndexedDB records for authenticated data, Service Worker caches of authenticated responses, and OPFS files are explicitly deleted on logout. Storage eviction by the browser is not a sufficient logout mechanism.

**Rule 11 — No CORS weakening in the application layer.**  
The application layer does not attempt to work around CORS restrictions. CORS configuration is a server responsibility. The application layer must not use proxies, CORS-bypass extensions, or server-side relay endpoints to circumvent origin policy.

**Rule 12 — Security headers are set on every response.**  
CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, and Permissions Policy are not optional; they must appear on every HTTP response from the application server.

---

---

## References

- W3C Web Cryptography Level 2 (Working Draft, April 2025): `w3.org/TR/webcrypto-2/`
- WICG Modern Algorithms for WebCrypto (Community Group Report, March 2026): `wicg.github.io/webcrypto-modern-algos/`
- W3C Content Security Policy Level 3 (Working Draft, March 2026): `w3.org/TR/CSP3/`
- MDN — Strict CSP guide: `developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP`
- web.dev — Mitigate XSS with strict CSP: `web.dev/articles/strict-csp`
- MDN — Trusted Types API: `developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API`
- web.dev — February 2026 Baseline Digest (Trusted Types): `web.dev/blog/baseline-digest-feb-2026`
- MDN — HTML Sanitizer API: `developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API`
- MDN — Element.setHTML(): `developer.mozilla.org/en-US/docs/Web/API/Element/setHTML`
- Ahmad Alfy — The HTML Sanitizer API (May 2026): `alfy.blog/2026/05/07/html-sanitizer-api.html`
- OpenReplay — A First Look at the HTML Sanitizer API (March 2026): `blog.openreplay.com/html-sanitizer-api-overview/`
- MDN — Cross-Origin-Opener-Policy: `developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy`
- MDN — Cross-Origin-Embedder-Policy: `developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy`
- web.dev — Making your website cross-origin isolated: `web.dev/articles/coop-coep`
- W3C Subresource Integrity Level 2 (Working Draft, March 2026): `w3.org/TR/sri-2/`
- MDN — Subresource Integrity: `developer.mozilla.org/en-US/docs/Web/Security/Defenses/Subresource_Integrity`
- MDN — Permissions API: `developer.mozilla.org/en-US/docs/Web/API/Permissions_API`
- MDN — Permissions Policy: `developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Permissions_Policy`
- W3C Permissions Policy specification: `w3.org/TR/permissions-policy/`
- MDN — Secure Contexts: `developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts`
- OWASP Content Security Policy Cheat Sheet: `cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html`
- Google Trusted Types guide: `csp.withgoogle.com/docs/strict-csp.html`
- SubtleCrypto MDN Reference: `developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto`
- CSP Is Dead, Long Live CSP (Google, 2016): origin of the allowlist-bypass analysis cited in §3

---

_End of 16. security.md_