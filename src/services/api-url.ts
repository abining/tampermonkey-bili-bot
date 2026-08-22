const KNOWN_ENDPOINT_PATTERN =
  /\/(?:chat\/completions|completions|images\/generations|images\/edits|responses|models)$/i;

export function normalizeApiUrl(apiUrl: unknown): string {
  return String(apiUrl ?? '').trim().replace(/\/+$/, '');
}

export function normalizeImageSize(raw: unknown): string {
  const value = String(raw ?? '').trim().replace(/[×＊*]/g, 'x').toLowerCase();
  if (!value) return '1024x1024';
  if (value === 'auto') return value;
  return /^\d{2,5}x\d{2,5}$/.test(value) ? value : '';
}

function escapeRegExp(text: unknown): string {
  return String(text ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildApiUrl(apiUrl: unknown, endpointPath: unknown): string {
  const endpoint = String(endpointPath ?? '').replace(/^\/+/, '');
  const url = normalizeApiUrl(apiUrl);
  if (!url || !endpoint) return url;

  const exactEndpoint = new RegExp(`/${escapeRegExp(endpoint)}$`, 'i');
  if (exactEndpoint.test(url)) return url;

  const versionMatch = url.match(/^(.*\/v\d+)(?:\/.*)?$/i);
  if (versionMatch) return `${versionMatch[1]}/${endpoint}`;

  if (KNOWN_ENDPOINT_PATTERN.test(url)) {
    return url.replace(KNOWN_ENDPOINT_PATTERN, `/${endpoint}`);
  }

  return `${url}/${endpoint}`;
}

export function buildChatCompletionsUrl(apiUrl: unknown): string {
  return buildApiUrl(apiUrl, 'chat/completions');
}

export function buildModelsUrl(apiUrl: unknown): string {
  return buildApiUrl(apiUrl, 'models');
}
