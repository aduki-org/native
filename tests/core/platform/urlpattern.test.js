/**
 * tests/core/platform/urlpattern.test.js
 *
 * URLPattern API pathname matching and parameter extraction test suite.
 *
 * Source: plan.md Phase 6-A, core/platform/polyfills/urlpattern.js
 */

import URLPatternPolyfill from '/src/core/platform/polyfills/urlpattern.js';

describe('URLPattern Polyfill', () => {
  it('should test and match standard static paths', () => {
    const pattern = new URLPatternPolyfill('/api/status');
    if (!pattern.test('http://example.com/api/status')) {
      throw new Error('Expected static path test to match');
    }
    if (pattern.test('http://example.com/api/status2')) {
      throw new Error('Expected unrelated static path to not match');
    }
  });

  it('should extract wildcard pathname segments correctly', () => {
    const pattern = new URLPatternPolyfill('/posts/*');
    const result = pattern.exec('http://example.com/posts/2026/hello-world');
    if (!result) {
      throw new Error('Expected wildcard path to execute match successfully');
    }
    if (result.pathname.groups['0'] !== '2026/hello-world') {
      throw new Error(`Expected wildcard value to be "2026/hello-world", got: ${result.pathname.groups['0']}`);
    }
  });

  it('should extract named path parameters correctly', () => {
    const pattern = new URLPatternPolyfill('/users/:id');
    const result = pattern.exec('http://example.com/users/99');
    if (!result) {
      throw new Error('Expected named parameter match to succeed');
    }
    if (result.pathname.groups.id !== '99') {
      throw new Error(`Expected id parameter to be "99", got: ${result.pathname.groups.id}`);
    }
  });

  it('should extract named path parameters with optional modifiers correctly', () => {
    const pattern = new URLPatternPolyfill('/users/:id?');
    const match1 = pattern.exec('http://example.com/users/');
    const match2 = pattern.exec('http://example.com/users/123');

    if (!match1 || match1.pathname.groups.id !== '') {
      throw new Error('Expected optional parameter to match empty value');
    }
    if (!match2 || match2.pathname.groups.id !== '123') {
      throw new Error('Expected optional parameter to match existing value');
    }
  });

  it('should match optional trailing slashes seamlessly', () => {
    const pattern = new URLPatternPolyfill('/users/:id');
    const match1 = pattern.exec('http://example.com/users/42');
    const match2 = pattern.exec('http://example.com/users/42/');

    if (!match1 || match1.pathname.groups.id !== '42') {
      throw new Error('Expected optional trailing slash match without slash to succeed');
    }
    if (!match2 || match2.pathname.groups.id !== '42') {
      throw new Error('Expected optional trailing slash match with trailing slash to succeed');
    }
  });

  it('should support full absolute URL templates and still match pathname', () => {
    const pattern = new URLPatternPolyfill('https://custom.org/api/:section/*');
    const result = pattern.exec('http://anyhost.com/api/blog/first-post');

    if (!result) {
      throw new Error('Expected absolute URL pattern to match pathname regardless of host/protocol');
    }
    if (result.pathname.groups.section !== 'blog' || result.pathname.groups['0'] !== 'first-post') {
      throw new Error('Expected absolute URL segment parameters to be parsed correctly');
    }
  });
});
