import { LEGACY_STORAGE_KEYS } from '../contracts/legacy-storage';
import { isRecord, parseJsonRecord } from '../utils/json';
import {
  getBrowserLocalStorage,
  readStorageValue,
  type BrowserStorage,
  writeStorageValue,
} from './browser-storage';
import { BETA_STORAGE_KEYS } from './keys';

export interface PanelGeometry {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

export interface FloatButtonPosition {
  side?: 'left' | 'right';
  bottom?: number;
  left?: number;
  top?: number;
}

export interface PositionState extends Record<string, unknown> {
  layoutVersion: number;
  panel?: PanelGeometry;
  floatBtn?: FloatButtonPosition | null;
}

export interface PositionLoadResult {
  positions: PositionState;
  source: 'beta' | 'legacy' | 'default';
  migrated: boolean;
}

function normalizePositions(value: unknown): PositionState {
  if (!isRecord(value)) return { layoutVersion: 1 };
  const positions = { ...value } as PositionState;
  if (positions.layoutVersion !== 1) {
    positions.layoutVersion = 1;
    positions.floatBtn = null;
  }
  return positions;
}

function parsePositions(value: string | null): PositionState | null {
  const parsed = parseJsonRecord(value);
  return parsed ? normalizePositions(parsed) : null;
}

export function loadPositionsWithMigration(
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): PositionLoadResult {
  const beta = parsePositions(readStorageValue(storage, BETA_STORAGE_KEYS.positions));
  if (beta) return { positions: beta, source: 'beta', migrated: false };

  const legacy = parsePositions(readStorageValue(storage, LEGACY_STORAGE_KEYS.positions));
  if (legacy) {
    return {
      positions: legacy,
      source: 'legacy',
      migrated: savePositions(legacy, storage),
    };
  }

  return {
    positions: { layoutVersion: 1 },
    source: 'default',
    migrated: false,
  };
}

export function loadPositions(
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): PositionState {
  return loadPositionsWithMigration(storage).positions;
}

export function savePositions(
  positions: unknown,
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): boolean {
  return writeStorageValue(
    storage,
    BETA_STORAGE_KEYS.positions,
    JSON.stringify(normalizePositions(positions)),
  );
}
