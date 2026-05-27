/**
 * types/core/workers/index.d.ts
 *
 * TypeScript declarations for the multi-threaded concurrency layer.
 */

export interface TaskOptions {
  payload?: any;
  priority?: 'user-blocking' | 'user-visible' | 'background';
  transferables?: Transferable[];
  signal?: AbortSignal;
  timeout?: number;
}

export class DedicatedWorker {
  constructor(scriptUrl: string);
  run(task: string, payload?: any, transferables?: Transferable[]): Promise<any>;
  terminate(): void;
}

export class WorkerPool {
  constructor(scriptUrl: string, size?: number | null);
  run(task: string, payload?: any, options?: TaskOptions): Promise<any>;
  terminate(): void;
}

export class SharedConnection {
  constructor(scriptUrl: string, name?: string);
  connect(): void;
  postMessage(msg: any): void;
  onMessage(fn: (msg: any) => void): () => void;
  close(): void;
}

export function lock(
  name: string,
  fn: () => any | Promise<any>,
  options?: { signal?: AbortSignal; mode?: 'exclusive' | 'shared'; timeout?: number }
): Promise<any>;

export const workers: {
  run(scriptUrl: string, task: string, opts?: TaskOptions): Promise<any>;
  shared(scriptUrl: string, name?: string): SharedConnection;
  lock: typeof lock;
  broadcast(channel: string, msg: any): void;
  subscribe(channel: string, fn: (msg: any) => void, signal?: AbortSignal): () => void;
  offscreen(canvas: HTMLCanvasElement, scriptUrl: string, options?: any): void;
};
