import { loadSummaryCacheWithMigration } from '../cache/summary-cache';
import {
  getBrowserLocalStorage,
  readStorageValue,
  type BrowserStorage,
  writeStorageValue,
} from './browser-storage';
import { loadConfigWithMigration } from './config-storage';
import { BETA_STORAGE_KEYS, STORAGE_MIGRATION_VERSION } from './keys';
import { loadPositionsWithMigration } from './position-storage';

export interface StorageMigrationReport {
  version: number;
  migratedAt: number;
  config: boolean;
  positions: boolean;
  summaryCache: boolean;
}

function parseMigrationReport(value: string | null): StorageMigrationReport | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StorageMigrationReport>;
    if (parsed.version !== STORAGE_MIGRATION_VERSION) return null;
    return {
      version: STORAGE_MIGRATION_VERSION,
      migratedAt: Number(parsed.migratedAt) || 0,
      config: parsed.config === true,
      positions: parsed.positions === true,
      summaryCache: parsed.summaryCache === true,
    };
  } catch {
    return null;
  }
}

export function getStorageMigrationReport(
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): StorageMigrationReport | null {
  return parseMigrationReport(
    readStorageValue(storage, BETA_STORAGE_KEYS.migration),
  );
}

export function migrateLegacyStorage(
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): StorageMigrationReport {
  const existing = getStorageMigrationReport(storage);
  if (
    existing
    && existing.config
    && existing.positions
    && existing.summaryCache
  ) return existing;

  const config = loadConfigWithMigration(storage);
  const positions = loadPositionsWithMigration(storage);
  const summaryCache = loadSummaryCacheWithMigration(storage);
  const report: StorageMigrationReport = {
    version: STORAGE_MIGRATION_VERSION,
    migratedAt: Date.now(),
    config: config.source !== 'legacy' || config.migrated,
    positions: positions.source !== 'legacy' || positions.migrated,
    summaryCache: summaryCache.source !== 'legacy' || summaryCache.migrated,
  };

  writeStorageValue(
    storage,
    BETA_STORAGE_KEYS.migration,
    JSON.stringify(report),
  );
  return report;
}
