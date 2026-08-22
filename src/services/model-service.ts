import { buildModelsUrl } from './api-url';
import { gmRequest } from './gm-request';

export interface FetchModelListOptions {
  apiUrl: string;
  apiKey: string;
  timeout?: number;
  signal?: AbortSignal;
}

function modelName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const model = value as Record<string, unknown>;
  return String(model.id ?? model.model ?? model.name ?? '').trim();
}

export async function fetchModelList(options: FetchModelListOptions): Promise<string[]> {
  if (!options.apiUrl || !options.apiKey) throw new Error('请先填写 API URL 和 API Key');
  const modelsUrl = buildModelsUrl(options.apiUrl);
  const response = await gmRequest({
    method: 'GET',
    url: modelsUrl,
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: options.timeout ?? 30_000,
    signal: options.signal,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}: ${String(response.responseText ?? '').slice(0, 200)}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(response.responseText);
  } catch {
    throw new Error(`模型列表响应不是有效 JSON: ${response.responseText.slice(0, 200)}`);
  }

  let source: unknown[] = [];
  if (Array.isArray(payload)) source = payload;
  else if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) source = record.data;
    else if (Array.isArray(record.models)) source = record.models;
    else if (record.data && typeof record.data === 'object') {
      const nested = record.data as Record<string, unknown>;
      if (Array.isArray(nested.models)) source = nested.models;
    }
  }

  const models = [...new Set(source.map(modelName).filter(Boolean))];
  if (!models.length) {
    throw new Error(`未解析到任何模型，响应: ${JSON.stringify(payload).slice(0, 200)}`);
  }
  return models;
}
