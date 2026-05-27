/**
 * types/core/router/index.d.ts
 *
 * TypeScript declarations for the native-first router layer.
 */

export interface RouteEntry {
  pathname: string;
  search?: Record<string, string>;
  state?: any;
  hash?: string;
}

export type RouteGuard = (
  to: RouteEntry,
  from: RouteEntry
) => boolean | Promise<boolean> | string | Promise<string>;

export const router: {
  on(pathPattern: string, callback: (params: Record<string, string>, route: RouteEntry) => void | Promise<void>): void;
  guard(fn: RouteGuard): void;
  notFound(callback: (route: RouteEntry) => void | Promise<void>): void;

  navigate(url: string, options?: { state?: any; info?: any; history?: 'push' | 'replace' }): Promise<void>;
  replace(url: string, options?: { state?: any; info?: any }): Promise<void>;
  back(): void;
  forward(): void;
  go(delta: number): void;
  current(): RouteEntry;
  entries(): RouteEntry[];
  canBack(): boolean;
  canForward(): boolean;

  render(outletElement: HTMLElement, content: string | Node): void;
  match(pathname: string): { params: Record<string, string>; callback: Function } | null;
};

export { RouteEntry, RouteGuard };
export function navigate(url: string, options?: { state?: any; info?: any; history?: 'push' | 'replace' }): Promise<void>;
export function replace(url: string, options?: { state?: any; info?: any }): Promise<void>;
export function back(): void;
export function forward(): void;
export function go(delta: number): void;
export function current(): RouteEntry;
export function entries(): RouteEntry[];
export function canBack(): boolean;
export function canForward(): boolean;
export function renderOutlet(outletElement: HTMLElement, content: string | Node): void;
