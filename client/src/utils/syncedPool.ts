import type { BenchmarkAccount, Platform } from '../types';

const STORAGE_PREFIX = 'synced_accounts_v1';

const key = (platform: Platform) => `${STORAGE_PREFIX}_${platform}`;

export interface SyncedAccountSnapshot {
  // 与 BenchmarkAccount 一致，但额外打同步时间戳和 ID
  account: BenchmarkAccount;
  syncId: string; // 每次同步生成的新 ID
  syncedAt: string; // ISO 时间
  dataSize: number; // 估算数据大小（字节），用于展示
}

function readPool(platform: Platform): SyncedAccountSnapshot[] {
  try {
    const raw = localStorage.getItem(key(platform));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writePool(platform: Platform, pool: SyncedAccountSnapshot[]): void {
  try {
    localStorage.setItem(key(platform), JSON.stringify(pool));
  } catch (e) {
    console.error('写入同步池失败', e);
  }
}

function estimateSize(acc: BenchmarkAccount): number {
  // 估算单账号快照的数据大小
  const posts = acc.recentPosts?.length || 0;
  const trend = acc.trendData?.length || 0;
  return 1024 + posts * 256 + trend * 64;
}

export function getSyncedAccounts(platform: Platform): SyncedAccountSnapshot[] {
  return readPool(platform);
}

export function syncOne(
  platform: Platform,
  account: BenchmarkAccount
): SyncedAccountSnapshot[] {
  const pool = readPool(platform);
  // 同一账号允许有多个快照，按 account.id 去重保留最新
  const filtered = pool.filter((s) => s.account.id !== account.id);
  const snapshot: SyncedAccountSnapshot = {
    account,
    syncId: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    syncedAt: new Date().toISOString(),
    dataSize: estimateSize(account),
  };
  const next = [snapshot, ...filtered];
  writePool(platform, next);
  return next;
}

export function syncMany(
  platform: Platform,
  accounts: BenchmarkAccount[]
): SyncedAccountSnapshot[] {
  let pool = readPool(platform);
  for (const account of accounts) {
    pool = pool.filter((s) => s.account.id !== account.id);
    pool.unshift({
      account,
      syncId: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      syncedAt: new Date().toISOString(),
      dataSize: estimateSize(account),
    });
  }
  writePool(platform, pool);
  return pool;
}

export function removeOne(platform: Platform, accountId: string): SyncedAccountSnapshot[] {
  const pool = readPool(platform);
  const next = pool.filter((s) => s.account.id !== accountId);
  writePool(platform, next);
  return next;
}

export function removeMany(platform: Platform, accountIds: string[]): SyncedAccountSnapshot[] {
  const idSet = new Set(accountIds);
  const pool = readPool(platform);
  const next = pool.filter((s) => !idSet.has(s.account.id));
  writePool(platform, next);
  return next;
}

export function clearPool(platform: Platform): SyncedAccountSnapshot[] {
  writePool(platform, []);
  return [];
}

export function getPoolStats(platform: Platform) {
  const pool = readPool(platform);
  const totalSize = pool.reduce((sum, s) => sum + s.dataSize, 0);
  return {
    count: pool.length,
    totalSize,
    lastSyncAt: pool.length > 0 ? pool[0].syncedAt : null,
  };
}
