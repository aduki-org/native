/**
 * web-test-runner.config.mjs
 *
 * Injects browser-native import maps so tests use the same @adukiorg/native/*
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
              "@adukiorg/native":             "/src/index.js",
              "@adukiorg/native/api":         "/src/core/api/index.js",
              "@adukiorg/native/state":       "/src/core/state/index.js",
              "@adukiorg/native/events":      "/src/core/events/index.js",
              "@adukiorg/native/router":      "/src/core/router/index.js",
              "@adukiorg/native/storage":     "/src/core/storage/index.js",
              "@adukiorg/native/offline":     "/src/core/offline/index.js",
              "@adukiorg/native/animations":  "/src/core/animations/index.js",
              "@adukiorg/native/workers":     "/src/core/workers/index.js",
              "@adukiorg/native/security":    "/src/core/security/index.js",
              "@adukiorg/native/platform":    "/src/core/platform/supports.js",
              "@adukiorg/native/ui":          "/src/core/ui/index.js",
              "@adukiorg/native/elements":    "/src/elements/index.js"
            }
          }
        </script>
        <script type="module" src="${testFramework}"></script>
      </head>
      <body></body>
    </html>
  `
};
