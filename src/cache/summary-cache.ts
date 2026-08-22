import { LEGACY_STORAGE_KEYS } from '../contracts/legacy-storage';
import {
  createVideoContextKey,
  type VideoContext,
} from '../contracts/video-context';
import {
  getBrowserLocalStorage,
  readStorageValue,
  type BrowserStorage,
  writeStorageValue,
} from '../storage/browser-storage';
import { BETA_STORAGE_KEYS } from '../storage/keys';
import { hashString } from '../utils/hash';
import { isRecord } from '../utils/json';

export const SUMMARY_CACHE_MAX_ENTRIES = 20;
export const SUMMARY_CACHE_MAX_CHARS = 250000;

export interface SummaryCacheEntry {
  summary: string;
  model: string;
  presetId: string;
  title: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface SummaryCache {
  version: 1;
  entries: Record<string, SummaryCacheEntry>;
  order: string[];
}

export interface SummaryCachePayload {
  summary: string;
  model?: string;
  presetId?: string;
  title?: string;
}

export interface SummaryCacheLoadResult {
  cache: SummaryCache;
  source: 'beta' | 'legacy' | 'default';
  migrated: boolean;
}

export function createEmptySummaryCache(): SummaryCache {
  return { version: 1, entries: {}, order: [] };
}

function normalizeEntry(value: unknown): SummaryCacheEntry | null {
  if (!isRecord(value) || typeof value.summary !== 'string' || !value.summary) return null;
  const now = Date.now();
  return {
    summary: value.summary,
    model: String(value.model || ''),
    presetId: String(value.presetId || ''),
    title: String(value.title || ''),
    createdAt: Number(value.createdAt) || now,
    lastUsedAt: Number(value.lastUsedAt) || Number(value.createdAt) || now,
  };
}

export function normalizeSummaryCache(value: unknown): SummaryCache {
  if (!isRecord(value) || !isRecord(value.entries) || !Array.isArray(value.order)) {
    return createEmptySummaryCache();
  }

  const entries: Record<string, SummaryCacheEntry> = {};
  for (const [key, rawEntry] of Object.entries(value.entries)) {
    const entry = normalizeEntry(rawEntry);
    if (entry) entries[key] = entry;
  }

  const seen = new Set<string>();
  const order = value.order
    .map(String)
    .filter((key) => {
      if (!entries[key] || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  for (const key of Object.keys(entries)) {
    if (!seen.has(key)) order.push(key);
  }

  return pruneSummaryCache({ version: 1, entries, order });
}

function parseSummaryCache(value: string | null): SummaryCache | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || !isRecord(parsed.entries) || !Array.isArray(parsed.order)) {
      return null;
    }
    return normalizeSummaryCache(parsed);
  } catch {
    return null;
  }
}

export function buildSummaryCacheKey(
  context: Pick<VideoContext, 'bvid' | 'cid' | 'page'>,
  model: string,
  presetId: string,
  promptText: string,
  transcript: string,
): string {
  return [
    'v3',
    createVideoContextKey(context),
    model || '',
    presetId || '',
    hashString(promptText || ''),
    hashString(transcript || ''),
  ].join('::');
}

export function pruneSummaryCache(cache: SummaryCache): SummaryCache {
  let totalChars = cache.order.reduce(
    (sum, key) => sum + (cache.entries[key]?.summary.length || 0),
    0,
  );

  while (
    cache.order.length > SUMMARY_CACHE_MAX_ENTRIES
    || totalChars > SUMMARY_CACHE_MAX_CHARS
  ) {
    const oldestKey = cache.order.shift();
    if (!oldestKey) break;
    totalChars -= cache.entries[oldestKey]?.summary.length || 0;
    delete cache.entries[oldestKey];
  }
  return cache;
}

export function saveSummaryCache(
  cache: SummaryCache,
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): boolean {
  const normalized = pruneSummaryCache(normalizeSummaryCache(cache));
  if (writeStorageValue(
    storage,
    BETA_STORAGE_KEYS.summaryCache,
    JSON.stringify(normalized),
  )) return true;

  const keepCount = Math.ceil(SUMMARY_CACHE_MAX_ENTRIES / 2);
  const compactOrder = normalized.order.slice(-keepCount);
  const keep = new Set(compactOrder);
  for (const key of Object.keys(normalized.entries)) {
    if (!keep.has(key)) delete normalized.entries[key];
  }
  normalized.order = compactOrder;
  return writeStorageValue(
    storage,
    BETA_STORAGE_KEYS.summaryCache,
    JSON.stringify(normalized),
  );
}

export function loadSummaryCacheWithMigration(
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): SummaryCacheLoadResult {
  const beta = parseSummaryCache(
    readStorageValue(storage, BETA_STORAGE_KEYS.summaryCache),
  );
  if (beta) return { cache: beta, source: 'beta', migrated: false };

  const legacy = parseSummaryCache(
    readStorageValue(storage, LEGACY_STORAGE_KEYS.summaryCache),
  );
  if (legacy) {
    return {
      cache: legacy,
      source: 'legacy',
      migrated: saveSummaryCache(legacy, storage),
    };
  }

  return {
    cache: createEmptySummaryCache(),
    source: 'default',
    migrated: false,
  };
}

export function loadSummaryCache(
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): SummaryCache {
  return loadSummaryCacheWithMigration(storage).cache;
}

export function getCachedSummary(
  cacheKey: string,
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): string | null {
  const cache = loadSummaryCache(storage);
  const entry = cache.entries[cacheKey];
  if (!entry?.summary) return null;

  cache.order = cache.order.filter((key) => key !== cacheKey);
  cache.order.push(cacheKey);
  entry.lastUsedAt = Date.now();
  saveSummaryCache(cache, storage);
  return entry.summary;
}

export function setCachedSummary(
  cacheKey: string,
  payload: SummaryCachePayload,
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): boolean {
  if (!cacheKey || !payload.summary) return false;
  const cache = loadSummaryCache(storage);
  const now = Date.now();
  cache.entries[cacheKey] = {
    summary: payload.summary,
    model: payload.model || '',
    presetId: payload.presetId || '',
    title: payload.title || '',
    createdAt: now,
    lastUsedAt: now,
  };
  cache.order = cache.order.filter((key) => key !== cacheKey);
  cache.order.push(cacheKey);
  return saveSummaryCache(cache, storage);
}

export function clearSummaryCache(
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): boolean {
  return saveSummaryCache(createEmptySummaryCache(), storage);
}

export function getSummaryCacheStats(
  storage: BrowserStorage | null = getBrowserLocalStorage(),
): { count: number; chars: number } {
  const cache = loadSummaryCache(storage);
  return {
    count: cache.order.length,
    chars: cache.order.reduce(
      (sum, key) => sum + (cache.entries[key]?.summary.length || 0),
      0,
    ),
  };
}
