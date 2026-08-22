import type { ApiProfile, AppConfig } from './types';

interface ApiProfileFallback {
  apiUrl: string;
  apiKey: string;
  model: string;
  modelList: string[];
}

export function createApiProfileId(now = Date.now()): string {
  return `api_profile_${now}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeApiProfiles(
  profiles: unknown,
  fallback: ApiProfileFallback,
): ApiProfile[] {
  const source = Array.isArray(profiles) ? profiles : [];
  const normalized = source
    .map((value, index): ApiProfile | null => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const profile = value as Partial<ApiProfile>;
      const modelList = Array.isArray(profile.modelList)
        ? profile.modelList.map(String).filter(Boolean)
        : [];
      return {
        id: String(profile.id || createApiProfileId()),
        name: String(profile.name || `配置 ${index + 1}`),
        apiUrl: String(profile.apiUrl || ''),
        apiKey: String(profile.apiKey || ''),
        model: String(profile.model || modelList[0] || ''),
        modelList,
      };
    })
    .filter((profile): profile is ApiProfile => Boolean(profile));

  if (normalized.length > 0) return normalized;

  return [{
    id: 'api_profile_default',
    name: '默认配置',
    apiUrl: String(fallback.apiUrl || ''),
    apiKey: String(fallback.apiKey || ''),
    model: String(fallback.model || ''),
    modelList: Array.isArray(fallback.modelList) ? fallback.modelList.slice() : [],
  }];
}

export function applyActiveApiProfile(config: AppConfig): AppConfig {
  const active = config.apiProfiles.find(
    (profile) => profile.id === config.activeApiProfileId,
  ) || config.apiProfiles[0];

  if (!active) return config;

  return {
    ...config,
    activeApiProfileId: active.id,
    apiUrl: active.apiUrl,
    apiKey: active.apiKey,
    model: active.model,
    modelList: active.modelList.slice(),
  };
}
