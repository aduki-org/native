/**
 * types/core/api/index.d.ts
 *
 * TypeScript declarations for the native-first networking layer.
 */

export class PlatformError extends Error {
  constructor(message: string, status?: number, code?: string);
  status?: number;
  code?: string;
}

export interface RequestDescriptor {
  url: string;
  method: string;
  headers: Headers;
  body?: any;
  signal?: AbortSignal;
  priority?: 'user-blocking' | 'user-visible' | 'background';
  timeout?: number;
  cache?: 'cache-first' | 'network-first' | 'stale-while-revalidate';
  retries?: number;
}

export interface RequestOptions {
  headers?: Record<string, string> | Headers;
  signal?: AbortSignal;
  priority?: 'user-blocking' | 'user-visible' | 'background';
  timeout?: number;
  cache?: 'cache-first' | 'network-first' | 'stale-while-revalidate';
  retries?: number;
}

export const pipeline: {
  use(fn: (desc: RequestDescriptor, next: (desc: RequestDescriptor) => Promise<Response>) => Promise<Response>): void;
  run(desc: RequestDescriptor, last: (desc: RequestDescriptor) => Promise<Response>): Promise<Response>;
};

export function execute(desc: RequestDescriptor): Promise<Response>;

export interface RetryOptions {
  attempts?: number;
  delay?: number;
  backoff?: 'exponential' | 'linear';
  signal?: AbortSignal;
}

export function retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;

export function createNDJSONTransform(): TransformStream<Uint8Array, any>;

export function stream(
  url: string,
  onChunk: (payload: any) => void,
  options?: RequestOptions
): Promise<void>;

export const api: {
  get(url: string, opts?: RequestOptions): Promise<any>;
  post(url: string, body?: any, opts?: RequestOptions): Promise<any>;
  put(url: string, body?: any, opts?: RequestOptions): Promise<any>;
  patch(url: string, body?: any, opts?: RequestOptions): Promise<any>;
  delete(url: string, opts?: RequestOptions): Promise<any>;
  stream: typeof stream;
  upload(url: string, files: FileList | File[], options?: RequestOptions): Promise<any>;
  pipeline: typeof pipeline;
  PlatformError: typeof PlatformError;
};
