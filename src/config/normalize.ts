import { cloneJson, isRecord } from '../utils/json';
import { applyActiveApiProfile, normalizeApiProfiles } from './api-profiles';
import {
  createDefaultConfig,
  getDefaultResultActionButtons,
  RESULT_ACTION_BUTTON_IDS,
} from './defaults';
import {
  DEFAULT_FULL_ANALYSIS_PRESETS,
  DEFAULT_SUMMARY_PRESETS,
} from './presets';
import type {
  AppConfig,
  PromptPreset,
  ResultActionButtonConfig,
  ResultActionButtonId,
} from './types';

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback.slice();
  return value.map(String).filter(Boolean);
}

function normalizePromptPresets(
  value: unknown,
  builtIns: PromptPreset[],
  mergeBuiltIns: boolean,
): PromptPreset[] {
  const source = Array.isArray(value) ? value : [];
  const presets = source
    .map((item): PromptPreset | null => {
      if (!isRecord(item)) return null;
      const id = String(item.id || '').trim();
      const prompt = String(item.prompt || '');
      if (!id || !prompt) return null;
      return {
        id,
        name: String(item.name || id),
        icon: String(item.icon || ''),
        prompt,
      };
    })
    .filter((item): item is PromptPreset => Boolean(item));

  if (!mergeBuiltIns && presets.length > 0) return presets;

  const merged = presets.slice();
  for (const builtIn of builtIns) {
    if (!merged.some((preset) => preset.id === builtIn.id)) {
      merged.push(cloneJson(builtIn));
    }
  }
  return merged;
}

export function normalizeResultActionButtons(value: unknown): ResultActionButtonConfig[] {
  if (!Array.isArray(value)) return getDefaultResultActionButtons();
  if (value.length === 0) return [];

  const known = new Set<string>(RESULT_ACTION_BUTTON_IDS);
  const seen = new Set<string>();
  const normalized: ResultActionButtonConfig[] = [];

  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = String(item.id || '') as ResultActionButtonId;
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    normalized.push({ id, enabled: item.enabled !== false });
  }

  for (const id of RESULT_ACTION_BUTTON_IDS) {
    if (!seen.has(id)) normalized.push({ id, enabled: true });
  }
  return normalized;
}

export function normalizeConfig(value: unknown): AppConfig {
  const defaults = createDefaultConfig();
  const saved = isRecord(value) ? value : {};
  const merged = {
    ...defaults,
    ...saved,
  } as AppConfig;

  merged.modelList = normalizeStringArray(saved.modelList, defaults.modelList);
  merged.commentTextPresets = normalizeStringArray(
    saved.commentTextPresets,
    defaults.commentTextPresets,
  );
  merged.promptPresets = normalizePromptPresets(
    saved.promptPresets,
    DEFAULT_SUMMARY_PRESETS,
    true,
  );
  merged.fullAnalysisPresets = normalizePromptPresets(
    saved.fullAnalysisPresets,
    DEFAULT_FULL_ANALYSIS_PRESETS,
    false,
  );
  merged.resultActionButtons = normalizeResultActionButtons(saved.resultActionButtons);
  merged.imageGenMode = saved.imageGenMode === 'flow' ? 'flow' : 'api';

  merged.apiProfiles = normalizeApiProfiles(saved.apiProfiles, merged);
  if (!merged.apiProfiles.some((profile) => profile.id === merged.activeApiProfileId)) {
    merged.activeApiProfileId = merged.apiProfiles[0].id;
  }

  if (!merged.promptPresets.some((preset) => preset.id === merged.activePresetId)) {
    merged.activePresetId = merged.promptPresets[0]?.id || defaults.activePresetId;
  }
  if (!merged.fullAnalysisPresets.some(
    (preset) => preset.id === merged.activeFullAnalysisPresetId,
  )) {
    merged.activeFullAnalysisPresetId = merged.fullAnalysisPresets[0]?.id
      || defaults.activeFullAnalysisPresetId;
  }

  return applyActiveApiProfile(merged);
}
