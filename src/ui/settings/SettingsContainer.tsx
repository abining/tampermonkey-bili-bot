import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { SettingsPanel } from './SettingsPanel';
import { defaultSettingsConfigAdapter } from './adapter';
import { SETTINGS_CSS_TEXT, SETTINGS_STYLE_MARKER } from './styles';
import type {
  SettingsContainerProps,
  SettingsExportOptions,
} from './types';

function chooseConfigFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    let settled = false;

    const finish = (value: string | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      input.remove();
      if (error) reject(error);
      else resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      file.text()
        .then((text) => finish(text))
        .catch((error) => finish(null, error));
    }, { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    input.hidden = true;
    document.body.appendChild(input);
    input.click();
  });
}

function downloadJson(text: string): void {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `bilibili-video-summary-config-${date}.json`;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function SettingsContainer({
  adapter = defaultSettingsConfigAdapter,
  busy = false,
  closeOnSave = true,
  onClose,
  onSaved,
  onRuntimeConfigChanged,
}: SettingsContainerProps) {
  const config = useSyncExternalStore(
    adapter.subscribe,
    adapter.getConfigSnapshot,
    adapter.getConfigSnapshot,
  );
  const [cacheStats, setCacheStats] = useState(() => adapter.getCacheStats());
  const modelRequestRef = useRef<AbortController | null>(null);
  const imageModelRequestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    modelRequestRef.current?.abort();
    imageModelRequestRef.current?.abort();
  }, []);

  const save = async (draft: typeof config) => {
    const saved = await adapter.saveConfig(draft);
    await onRuntimeConfigChanged?.(saved);
    await onSaved?.(saved);
    if (closeOnSave) onClose();
  };

  const importDraft = async () => {
    const text = await chooseConfigFile();
    return text === null ? undefined : adapter.importDraft(text);
  };

  const exportDraft = async (
    draft: typeof config,
    options: SettingsExportOptions,
  ) => {
    if (options.includeSecrets) {
      const confirmed = window.confirm(
        '导出的文件将包含 API Key。请只保存到可信位置，确定继续吗？',
      );
      if (!confirmed) return;
    }
    downloadJson(adapter.exportDraft(draft, options));
  };

  const resetDraft = () => {
    if (!window.confirm('将当前草稿恢复为默认设置？保存前不会写入存储。')) {
      return undefined;
    }
    return adapter.createResetDraft();
  };

  const clearCache = () => {
    if (!window.confirm('确定清空摘要缓存吗？此操作不会删除 API 配置。')) return;
    setCacheStats(adapter.clearCache());
  };

  const fetchModels = async (profile: Parameters<typeof adapter.fetchModels>[0]) => {
    modelRequestRef.current?.abort();
    const controller = new AbortController();
    modelRequestRef.current = controller;
    try {
      return await adapter.fetchModels(profile, controller.signal);
    } finally {
      if (modelRequestRef.current === controller) modelRequestRef.current = null;
    }
  };

  const fetchImageModels = async (
    options: Parameters<typeof adapter.fetchImageModels>[0],
  ) => {
    imageModelRequestRef.current?.abort();
    const controller = new AbortController();
    imageModelRequestRef.current = controller;
    try {
      return await adapter.fetchImageModels(options, controller.signal);
    } finally {
      if (imageModelRequestRef.current === controller) imageModelRequestRef.current = null;
    }
  };

  return (
    <>
      <style data-style-id={SETTINGS_STYLE_MARKER}>{SETTINGS_CSS_TEXT}</style>
      <SettingsPanel
        config={config}
        cacheStats={cacheStats}
        busy={busy}
        onSave={save}
        onCancel={onClose}
        onImport={importDraft}
        onExport={exportDraft}
        onReset={resetDraft}
        onFetchModels={fetchModels}
        onFetchImageModels={fetchImageModels}
        onClearSummaryCache={clearCache}
      />
    </>
  );
}

