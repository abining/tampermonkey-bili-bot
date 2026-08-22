import { createDefaultConfig, normalizeConfig, type AppConfig } from '../config';
import {
  createExportConfig,
  importConfig,
  loadConfigWithMigration,
  saveConfig,
  type ConfigStorageSource,
} from '../storage';

type Listener = () => void;

export interface ConfigSnapshot {
  config: AppConfig;
  source: ConfigStorageSource;
  dirty: boolean;
  savedAt: number;
}

export class ConfigController {
  private snapshot: ConfigSnapshot;
  private listeners = new Set<Listener>();

  constructor() {
    const loaded = loadConfigWithMigration();
    this.snapshot = {
      config: loaded.config,
      source: loaded.source,
      dirty: false,
      savedAt: 0,
    };
  }

  getSnapshot = (): ConfigSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(patch: Partial<AppConfig>): void {
    this.replace({ ...this.snapshot.config, ...patch });
  }

  replace(config: unknown): void {
    this.snapshot = {
      ...this.snapshot,
      config: normalizeConfig(config),
      dirty: true,
    };
    this.emit();
  }

  save(): boolean {
    const saved = saveConfig(this.snapshot.config);
    if (saved) {
      this.snapshot = {
        ...this.snapshot,
        source: 'beta',
        dirty: false,
        savedAt: Date.now(),
      };
      this.emit();
    }
    return saved;
  }

  reset(): void {
    this.replace(createDefaultConfig());
  }

  import(value: string | unknown): void {
    this.replace(importConfig(value));
  }

  export(options: { includeSecrets?: boolean } = {}): string {
    return JSON.stringify(
      createExportConfig(this.snapshot.config, options),
      null,
      2,
    );
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const configController = new ConfigController();
