/**
 * web-test-runner.config.mjs
 *
 * Injects browser-native import maps so tests use the same @aduki/native/*
 * specifiers a real consumer would use after npm install.
 */

export default {
  nodeResolve: false,
  files: 'tests/**/*.test.js',
  testFramework: {
    config: {
      ui: 'bdd',
      timeout: '2000'
    }
  },
  testRunnerHtml: (testFramework) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <script type="importmap">
          {
            "imports": {
              "@aduki/native":             "/src/index.js",
              "@aduki/native/api":         "/src/core/api/index.js",
              "@aduki/native/state":       "/src/core/state/index.js",
              "@aduki/native/events":      "/src/core/events/index.js",
              "@aduki/native/router":      "/src/core/router/index.js",
              "@aduki/native/storage":     "/src/core/storage/index.js",
              "@aduki/native/offline":     "/src/core/offline/index.js",
              "@aduki/native/animations":  "/src/core/animations/index.js",
              "@aduki/native/workers":     "/src/core/workers/index.js",
              "@aduki/native/security":    "/src/core/security/index.js",
              "@aduki/native/platform":    "/src/core/platform/supports.js",
              "@aduki/native/ui":          "/src/core/ui/index.js",
              "@aduki/native/elements":    "/src/elements/index.js"
            }
          }
        </script>
        <script type="module" src="${testFramework}"></script>
      </head>
      <body></body>
    </html>
  `
};
