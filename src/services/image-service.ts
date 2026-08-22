import { buildApiUrl, normalizeApiUrl, normalizeImageSize } from './api-url';
import { sendPromptToFlow, type FlowDispatchResult } from './flow-dispatch';
import { gmRequest, isAbortError } from './gm-request';

export const DEFAULT_IMAGE_PROMPT =
  '根据以下视频内容总结，生成一张信息可视化的精美配图，风格清晰美观，适合作为视频总结的封面图：\n\n{summary}';

export type ImageApiKind = 'images' | 'responses' | 'chat';

export interface ImageApiCandidate {
  key: string;
  kind: ImageApiKind;
  url: string;
}

export interface ImageGenerationOptions {
  apiUrl: string;
  apiKey: string;
  model: string;
  size?: string;
  signal?: AbortSignal;
  timeout?: number;
}

export interface ImageFromSummaryOptions extends Partial<ImageGenerationOptions> {
  fallbackApiUrl?: string;
  fallbackApiKey?: string;
  promptTemplate?: string;
  summaryMaxLength?: number;
}

export interface DispatchImageOptions extends ImageFromSummaryOptions {
  mode?: 'api' | 'flow';
  flowUrl?: string;
  videoTitle?: string;
  pageUrl?: string;
  openFlowWhenOffline?: boolean;
}

export type DispatchImageResult =
  | { mode: 'api'; prompt: string; imageDataUrl: string }
  | { mode: 'flow'; prompt: string; dispatch: FlowDispatchResult };

export function buildImagePrompt(
  summary: unknown,
  template = DEFAULT_IMAGE_PROMPT,
  maxLength = 5000,
): string {
  const cleanSummary = String(summary ?? '')
    .slice(0, maxLength)
    .replace(/[#*_\[\]()]/g, '');
  return template.includes('{summary}')
    ? template.replace(/\{summary}/g, cleanSummary)
    : `${template}\n\n${cleanSummary}`;
}

function addUniqueCandidate(
  candidates: ImageApiCandidate[],
  kind: ImageApiKind,
  candidateUrl: string,
): void {
  const url = normalizeApiUrl(candidateUrl);
  if (!url) return;
  const key = `${kind}|${url}`;
  if (!candidates.some((candidate) => candidate.key === key)) {
    candidates.push({ key, kind, url });
  }
}

export function buildImageApiCandidates(apiUrl: unknown): ImageApiCandidate[] {
  const url = normalizeApiUrl(apiUrl);
  const candidates: ImageApiCandidate[] = [];
  if (!url) return candidates;

  if (/\/images\/generations$/i.test(url)) addUniqueCandidate(candidates, 'images', url);
  if (/\/responses$/i.test(url)) addUniqueCandidate(candidates, 'responses', url);

  addUniqueCandidate(candidates, 'images', buildApiUrl(url, 'images/generations'));
  addUniqueCandidate(candidates, 'responses', buildApiUrl(url, 'responses'));
  if (/\/chat\/completions$/i.test(url)) addUniqueCandidate(candidates, 'chat', url);
  addUniqueCandidate(candidates, 'chat', buildApiUrl(url, 'chat/completions'));
  return candidates;
}

export function getImageRequestBodies(
  kind: ImageApiKind,
  model: string,
  imagePrompt: string,
  requestedSize?: string,
): Record<string, unknown>[] {
  const size = normalizeImageSize(requestedSize) || '1024x1024';
  if (kind === 'images') {
    const base = { model, prompt: imagePrompt, n: 1, size };
    return [{ ...base, response_format: 'b64_json' }, base];
  }
  if (kind === 'responses') {
    const tool: Record<string, unknown> = { type: 'image_generation' };
    if (size !== 'auto') tool.size = size;
    return [
      { model, input: imagePrompt, tools: [tool] },
      { model, input: imagePrompt, tools: [{ type: 'image_generation' }] },
    ];
  }
  const sizeHint = size !== 'auto' ? `\n\n请严格按 ${size} 画布尺寸生成，保持对应宽高比。` : '';
  return [
    { model, messages: [{ role: 'user', content: imagePrompt + sizeHint }] },
    { model, messages: [{ role: 'user', content: imagePrompt + sizeHint }], modalities: ['text', 'image'] },
  ];
}

export function normalizeExtractedImage(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^data:image\//i.test(text) || /^https?:\/\//i.test(text)) return text;
  const compact = text.replace(/\s/g, '');
  if (compact.length > 100 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    return `data:image/png;base64,${compact}`;
  }
  return '';
}

export function extractImageDataUrl(payload: unknown): string {
  if (!payload) return '';
  const seen = new Set<object>();

  const walk = (node: unknown, key = '', parent?: Record<string, unknown>): string => {
    if (node == null) return '';
    if (typeof node === 'string') {
      if (/^(b64_json|base64|image_base64|result)$/i.test(key)) {
        const parentType = String(parent?.type ?? parent?.kind ?? parent?.object ?? '');
        if (!parentType || /image|generation/i.test(parentType)) {
          const direct = normalizeExtractedImage(node);
          if (direct) return direct;
        }
      }
      if (/^(url|image_url|output_url)$/i.test(key)) {
        const direct = normalizeExtractedImage(node);
        if (direct) return direct;
      }
      const dataUrl = node.match(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/i)?.[0];
      if (dataUrl) return normalizeExtractedImage(dataUrl);
      const markdownUrl = node.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+|data:image\/[^)\s]+)\)/i)?.[1];
      return markdownUrl ? normalizeExtractedImage(markdownUrl) : '';
    }
    if (typeof node !== 'object') return '';
    if (seen.has(node)) return '';
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item, key, parent);
        if (found) return found;
      }
      return '';
    }

    const record = node as Record<string, unknown>;
    if (record.image_url && typeof record.image_url === 'object') {
      const imageUrl = record.image_url as Record<string, unknown>;
      const found = walk(imageUrl.url ?? imageUrl.data ?? imageUrl.b64_json, 'image_url', imageUrl);
      if (found) return found;
    }
    for (const [property, value] of Object.entries(record)) {
      const found = walk(value, property, record);
      if (found) return found;
    }
    return '';
  };

  return walk(payload);
}

export async function requestImageFromCandidate(
  candidate: ImageApiCandidate,
  imagePrompt: string,
  options: ImageGenerationOptions,
): Promise<string> {
  let lastError = '';
  const bodies = getImageRequestBodies(candidate.kind, options.model, imagePrompt, options.size);
  for (const body of bodies) {
    try {
      const response = await gmRequest({
        method: 'POST',
        url: candidate.url,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        data: JSON.stringify(body),
        timeout: options.timeout,
        signal: options.signal,
      });
      const text = String(response.responseText ?? '');
      let payload: unknown = text;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        // 某些兼容接口直接返回 data URL 或 Markdown 图片。
      }
      if (response.status < 200 || response.status >= 300) {
        lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`;
        continue;
      }
      const imageDataUrl = extractImageDataUrl(payload);
      if (imageDataUrl) return imageDataUrl;
      lastError = '响应里没有解析到图片数据';
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError || '生图请求失败');
}

export async function generateImageByApi(
  imagePrompt: string,
  options: ImageGenerationOptions,
): Promise<string> {
  if (!options.apiUrl || !options.apiKey || !options.model) {
    throw new Error('请配置生图模型的 API URL、API Key 和模型');
  }
  const candidates = buildImageApiCandidates(options.apiUrl);
  let lastError = '';
  for (const candidate of candidates) {
    try {
      console.info(`[省流助手-生图] 尝试 ${candidate.kind} 接口:`, candidate.url);
      return await requestImageFromCandidate(candidate, imagePrompt, options);
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = `${candidate.kind} ${candidate.url} -> ${error instanceof Error ? error.message : String(error)}`;
      console.warn(`[省流助手-生图] ${lastError}`);
    }
  }
  throw new Error(lastError || '生图 API 未返回图片数据');
}

export async function generateImageFromSummary(
  summary: string,
  options: ImageFromSummaryOptions,
): Promise<{ prompt: string; imageDataUrl: string }> {
  const apiUrl = options.apiUrl || options.fallbackApiUrl || '';
  const apiKey = options.apiKey || options.fallbackApiKey || '';
  const model = options.model || 'gemini-2.0-flash-preview-image-generation';
  const prompt = buildImagePrompt(
    summary,
    options.promptTemplate || DEFAULT_IMAGE_PROMPT,
    options.summaryMaxLength,
  );
  const imageDataUrl = await generateImageByApi(prompt, {
    apiUrl,
    apiKey,
    model,
    size: options.size,
    signal: options.signal,
    timeout: options.timeout,
  });
  return { prompt, imageDataUrl };
}

export async function dispatchImageGeneration(
  summary: string,
  options: DispatchImageOptions,
): Promise<DispatchImageResult> {
  const prompt = buildImagePrompt(
    summary,
    options.promptTemplate || DEFAULT_IMAGE_PROMPT,
    options.summaryMaxLength,
  );
  if (options.mode === 'flow') {
    return {
      mode: 'flow',
      prompt,
      dispatch: sendPromptToFlow(prompt, {
        flowUrl: options.flowUrl,
        videoTitle: options.videoTitle,
        pageUrl: options.pageUrl,
        openWhenOffline: options.openFlowWhenOffline,
      }),
    };
  }
  const generated = await generateImageFromSummary(summary, options);
  return { mode: 'api', prompt: generated.prompt, imageDataUrl: generated.imageDataUrl };
}
