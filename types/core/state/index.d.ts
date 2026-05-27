/**
 * types/core/state/index.d.ts
 *
 * TypeScript declarations for the reactive state management layer.
 */

export class ReactiveStore<T extends Record<string, any>> {
  constructor(initialState: T);
  get<K extends keyof T>(key: K): T[K];
  set<K extends keyof T>(key: K, value: T[K], source?: string): void;
  subscribe<K extends keyof T>(
    key: K,
    callback: (val: T[K]) => void,
    signal?: AbortSignal
  ): () => void;
  onMutation(callback: (key: string, value: any, source: string) => void): () => void;
  batch(fn: () => void): void;
  snapshot(): T;
  hydrate(state: Partial<T>): void;
  reset(initialState: T): void;
}

export class DerivedValue<T> {
  constructor(compute: () => T);
  readonly value: T;
  subscribe(callback: () => void): () => void;
  dispose(): void;
}

export function derived<T>(compute: () => T): DerivedValue<T>;

export function sync(
  store: ReactiveStore<any>,
  keys?: string[],
  channelName?: string
): () => void;

export const storage: {
  persist(store: ReactiveStore<any>, options: { name: string; keys?: string[] }): Promise<void>;
  hydrate(store: ReactiveStore<any>, name: string): Promise<void>;
};

export const state: {
  create<T extends Record<string, any>>(initial: T): ReactiveStore<T>;
  derived: typeof derived;
  sync: typeof sync;
  storage: typeof storage;
};

export function setActiveSubscriber(subscriber: Set<any> | null): void;
export function getActiveSubscriber(): Set<any> | null;
