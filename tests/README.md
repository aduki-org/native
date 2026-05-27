# Real-Browser Testing Guide

This project leverages browser-native sandboxed execution paths for test assertions. Rather than relying on inaccurate Node-based JSDOM emulators, all tests are executed in a **real Chromium instance** via Playwright and `@web/test-runner`.

---

## 1. Testing Infrastructure

### Native Browser Sandbox

* **Custom Element Lifecycles**: Custom elements rely on authentic browser DOM custom element registries (`customElements.define`), shadow root interactions, and standard `ElementInternals` states that are only available in a real browser.
* **Modern Web Standards**: Native APIs like the Web Locks API, SubtleCrypto, and WAAPI (Web Animations API) require the authentic hardware-accelerated runtime of a real browser.

### Global Test Bootstrapper (`tests/setup.js`)

Every test suite automatically loads `tests/setup.js` to build isolated mock boundaries:

1. **Isolated IndexedDB**: Before every run, the database is purged and isolated to prevent test state leakage.
2. **Service Worker Mocks**: Provides lightweight mocked registration states for local testing environments.
3. **Timer Mocking**: Integrates high-performance mock timer suites to accurately check backoff retry sequences.

---

## 2. Test Runner Configuration

The environment is configured via `web-test-runner.config.mjs` at the root.

### Native Import Maps Mapping

The configuration injects a browser-native import map into the test execution sandbox:

```html
<script type="importmap">
  {
    "imports": {
      "lib/": "/src/"
    }
  }
</script>
```

This mapping allows all test files to use clean alias imports (`import { ... } from 'lib/core/...'`) instead of complex relative paths.

---

## 3. How to Run the Tests

Execute the following commands in your shell to run the test suite:

### Install Playwright Browsers (First Time Setup)

```bash
npx playwright install chromium
```

### Run Tests in Headless Mode (CLI)

```bash
npx @web/test-runner
```

### Run Tests in Watch Mode (Interactive Development)

```bash
npx @web/test-runner --watch
```

### Run Tests with a Visible Browser GUI

```bash
npx @web/test-runner --open
```
