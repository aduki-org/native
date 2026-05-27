/**
 * types/core/storage/index.d.ts
 *
 * TypeScript declarations for the unified storage gateway.
 */

export interface StorageQuotaEstimate {
  quota: number;
  usage: number;
  persisted: boolean;
}

export type StorageTier = 'memory' | 'idb' | 'opfs' | 'cache';

export const storage: {
  get(key: string, tier?: StorageTier): Promise<any>;
  set(key: string, value: any, tier?: StorageTier, ttl?: number | null): Promise<void>;
  delete(key: string, tier?: StorageTier): Promise<void>;
  query(
    storeName: string,
    queryOpts?: {
      index?: string;
      range?: IDBKeyRange;
      direction?: IDBCursorDirection;
      limit?: number;
    }
  ): Promise<any[]>;
  list(tier?: StorageTier): Promise<string[]>;
  clear(tier?: 'all' | StorageTier): Promise<void>;
  estimate(): Promise<StorageQuotaEstimate>;
  persist(): Promise<boolean>;
};
