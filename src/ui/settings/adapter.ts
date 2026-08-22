import {
  createDefaultConfig,
  normalizeConfig,
  type ApiProfile,
  type AppConfig,
} from '../../config';
import {
  clearSummaryCache,
  getSummaryCacheStats,
} from '../../cache';
import { configController } from '../../runtime/config-controller';
import { fetchModelList } from '../../services/model-service';
import {
  exportConfig,
  importConfig,
} from '../../storage';
import { cloneJson } from '../../utils';
import type {
  SettingsConfigAdapter,
  SettingsExportOptions,
} from './types';

interface ConfigControllerLike {
  subscribe(listener: () => void): () => void;
  getSnapshot(): {
    config: AppConfig;
  };
  replace(config: unknown): void;
  save(): boolean;
}

function clearAllSecrets(config: AppConfig): AppConfig {
  const next = cloneJson(config);
  next.apiKey = '';
  next.imageGenApiKey = '';
  next.apiProfiles = next.apiProfiles.map((profile) => ({
    ...profile,
    apiKey: '',
  }));
  return next;
}

function clearPlaceholderSecrets(config: AppConfig): AppConfig {
  const hasPlaceholder = config.apiKey === 'sk-xxxx'
    || config.apiProfiles.some((profile) => profile.apiKey === 'sk-xxxx');
  if (!hasPlaceholder) return config;

  const next = cloneJson(config);
  if (next.apiKey === 'sk-xxxx') next.apiKey = '';
  next.apiProfiles = next.apiProfiles.map((profile) => ({
    ...profile,
    apiKey: profile.apiKey === 'sk-xxxx' ? '' : profile.apiKey,
  }));
  return next;
}

export function createSettingsConfigAdapter(
  controller: ConfigControllerLike = configController,
): SettingsConfigAdapter {
  let lastControllerConfig: AppConfig | null = null;
  let lastSafeConfig: AppConfig | null = null;

  return {
    subscribe: (listener) => controller.subscribe(listener),
    getConfigSnapshot: () => {
      const config = controller.getSnapshot().config;
      if (config === lastControllerConfig && lastSafeConfig) return lastSafeConfig;
      lastControllerConfig = config;
      lastSafeConfig = clearPlaceholderSecrets(config);
      return lastSafeConfig;
    },
    saveConfig: (config) => {
      const previous = controller.getSnapshot().config;
      controller.replace(config);
      if (!controller.save()) {
        controller.replace(previous);
        throw new Error('保存设置失败，请检查浏览器存储权限或空间');
      }
      return clearPlaceholderSecrets(controller.getSnapshot().config);
    },
    createResetDraft: () => clearAllSecrets(normalizeConfig(createDefaultConfig())),
    importDraft: (value) => importConfig(value),
    exportDraft: (config, options: SettingsExportOptions) => exportConfig(config, {
      includeSecrets: options.includeSecrets === true,
      space: 2,
    }),
    fetchModels: (profile: ApiProfile, signal?: AbortSignal) => fetchModelList({
      apiUrl: profile.apiUrl,
      apiKey: profile.apiKey,
      signal,
    }),
    getCacheStats: () => getSummaryCacheStats(),
    clearCache: () => {
      if (!clearSummaryCache()) throw new Error('清空摘要缓存失败');
      return getSummaryCacheStats();
    },
  };
}

export const defaultSettingsConfigAdapter = createSettingsConfigAdapter();

