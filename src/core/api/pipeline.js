/**
 * src/core/api/pipeline.js
 *
 * Composable interceptor chain.
 * Manages request modification (outbound), short-circuiting (caching/mocking),
 * and response normalization (inbound).
 *
 * Source: doc 11 — Networking §4, §5
 */

export class Pipeline {
  #outbound = [];
  #inbound = [];

  /**
   * Registers an outbound (request) interceptor.
   * Outbound interceptors receive a request descriptor and can:
   * 1. Return a modified descriptor to pass to the next interceptor.
   * 2. Return a Response instance to short-circuit the pipeline (e.g. cache hit).
   */
  outbound(interceptor) {
    if (typeof interceptor !== 'function') {
      throw new Error('Pipeline interceptor must be a function');
    }
    this.#outbound.push(interceptor);
    return this;
  }

  /**
   * Registers an inbound (response/error) interceptor.
   * Inbound interceptors receive the Response (or Error) and return a Response
   * or throw a normalized Error.
   */
  inbound(interceptor) {
    if (typeof interceptor !== 'function') {
      throw new Error('Pipeline interceptor must be a function');
    }
    this.#inbound.push(interceptor);
    return this;
  }

  /**
   * Executes the pipeline with a given request descriptor and a final fetch executor.
   */
  async run(descriptor, executeFetch) {
    let current = { ...descriptor };

    // 1. Outbound Pipeline
    for (const interceptor of this.#outbound) {
      const result = await interceptor(current);
      if (result instanceof Response) {
        // Short circuit: Return mock or cached response
        try {
          result.requestId = current.requestId;
        } catch (_) {}
        return this.#runInbound(result);
      }
      if (result) {
        current = result;
      }
    }

    // 2. Fetch Execution
    let response;
    try {
      response = await executeFetch(current);
    } catch (err) {
      // Pass network/timeout errors to the inbound pipeline for normalization
      try {
        err.requestId = current.requestId;
      } catch (_) {}
      return this.#runInbound(err);
    }

    // 3. Inbound Pipeline
    try {
      response.requestId = current.requestId;
    } catch (_) {}
    return this.#runInbound(response);
  }

  async #runInbound(responseOrError) {
    let current = responseOrError;
    for (const interceptor of this.#inbound) {
      try {
        current = await interceptor(current);
      } catch (err) {
        current = err;
      }
    }
    if (current instanceof Error) {
      throw current;
    }
    return current;
  }
}

export const pipeline = new Pipeline();
