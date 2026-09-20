import type {
  ApiProfile,
  AppConfig,
} from '../../config';

export interface SettingsCacheStats {
  count: number;
  chars: number;
}

export interface SettingsExportOptions {
  includeSecrets: boolean;
}

export interface SettingsPanelProps {
  config: AppConfig;
  cacheStats?: SettingsCacheStats;
  busy?: boolean;
  onSave(config: AppConfig): void | Promise<void>;
  onCancel(): void;
  onImport(): AppConfig | void | Promise<AppConfig | void>;
  onExport(
    config: AppConfig,
    options: SettingsExportOptions,
  ): void | Promise<void>;
  onReset(): AppConfig | void | Promise<AppConfig | void>;
  onFetchModels?(profile: ApiProfile): string[] | Promise<string[]>;
  onFetchImageModels?(options: { apiUrl: string; apiKey: string }): string[] | Promise<string[]>;
  onClearSummaryCache?(): void | Promise<void>;
}

export interface SettingsConfigAdapter {
  subscribe(listener: () => void): () => void;
  getConfigSnapshot(): AppConfig;
  saveConfig(config: AppConfig): AppConfig | Promise<AppConfig>;
  createResetDraft(): AppConfig;
  importDraft(value: string): AppConfig;
  exportDraft(config: AppConfig, options: SettingsExportOptions): string;
  fetchModels(profile: ApiProfile, signal?: AbortSignal): Promise<string[]>;
  fetchImageModels(
    options: { apiUrl: string; apiKey: string },
    signal?: AbortSignal,
  ): Promise<string[]>;
  getCacheStats(): SettingsCacheStats;
  clearCache(): SettingsCacheStats;
}

export interface SettingsContainerProps {
  adapter?: SettingsConfigAdapter;
  busy?: boolean;
  closeOnSave?: boolean;
  onClose(): void;
  onSaved?(config: AppConfig): void | Promise<void>;
  onRuntimeConfigChanged?(config: AppConfig): void | Promise<void>;
}
