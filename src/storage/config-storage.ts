import { LEGACY_STORAGE_KEYS } from '../contracts/legacy-storage';
import { normalizeConfig } from '../config/normalize';
import type { AppConfig } from '../config/types';
import { parseJsonRecord } from '../utils/json';
import {
  getBrowserLocalStorage,
  readStorageValue,
  type BrowserStorage,
  writeStorageValue,
} from './browser-storage';
import { BETA_STORAGE_KEYS } from './keys';

export type ConfigStorageSource = 'beta' | 'legacy' | 'default';

export interface ConfigLoadResult {
  config: AppConfig;
  source: ConfigStorageSource;
  migrated: boolean;
  persisted: boolean;
}

function parseStoredConfig(value: string | null): AppConfig | null {
  const parsed = parseJsonRecord(value);
  return parsed ? normalizeConfig(parsed) : null;
}

export function loadConfigWithMigration(
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): ConfigLoadResult {
  const betaConfig = parseStoredConfig(
    readStorageValue(storage, BETA_STORAGE_KEYS.config),
  );
  if (betaConfig) {
    return {
      config: betaConfig,
      source: 'beta',
      migrated: false,
      persisted: true,
    };
  }

  const legacyConfig = parseStoredConfig(
    readStorageValue(storage, LEGACY_STORAGE_KEYS.config),
  );
  if (legacyConfig) {
    const persisted = saveConfig(legacyConfig, storage);
    return {
      config: legacyConfig,
      source: 'legacy',
      migrated: persisted,
      persisted,
    };
  }

  const config = normalizeConfig(null);
  return {
    config,
    source: 'default',
    migrated: false,
    persisted: false,
  };
}

export function loadConfig(
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): AppConfig {
  return loadConfigWithMigration(storage).config;
}

export function saveConfig(
  config: unknown,
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): boolean {
  const normalized = normalizeConfig(config);
  return writeStorageValue(
    storage,
    BETA_STORAGE_KEYS.config,
    JSON.stringify(normalized),
  );
}
