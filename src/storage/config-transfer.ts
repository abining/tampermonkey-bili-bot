import { normalizeConfig } from '../config/normalize';
import type { AppConfig } from '../config/types';
import { cloneJson, isRecord } from '../utils/json';

export interface ExportConfigOptions {
  includeSecrets?: boolean;
  space?: number;
}

export function importConfig(value: string | unknown): AppConfig {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!isRecord(parsed)) throw new Error('配置文件必须是 JSON 对象');
  return normalizeConfig(parsed);
}

export function createExportConfig(
  config: unknown,
  options: ExportConfigOptions = {},
): AppConfig {
  const exported = cloneJson(normalizeConfig(config));
  if (options.includeSecrets === true) return exported;

  exported.apiKey = '';
  exported.imageGenApiKey = '';
  exported.apiProfiles = exported.apiProfiles.map((profile) => ({
    ...profile,
    apiKey: '',
  }));
  return exported;
}

export function exportConfig(
  config: unknown,
  options: ExportConfigOptions = {},
): string {
  return JSON.stringify(
    createExportConfig(config, options),
    null,
    options.space ?? 2,
  );
}
