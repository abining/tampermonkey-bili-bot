import type { SubtitleResult } from '../../contracts/runtime';
import type { VideoContext } from '../../contracts/video-context';
import {
  BILI_API_TIMEOUT_MS,
  BILI_SUBTITLE_TIMEOUT_MS,
  fetchWithTimeout,
  isAbortError,
  throwIfAborted,
  throwIfStale,
} from './shared';
import {
  formatTranscript,
  normalizeSubtitleSegments,
} from './subtitle-format';
import type {
  RouteFreshness,
  SubtitleDescriptor,
  SubtitleDescriptorResult,
} from './types';

interface SubtitleListApiResponse {
  data?: {
    subtitle?: {
      subtitles?: SubtitleDescriptor[];
    };
  };
}

export async function fetchSubtitleDescriptorsResult(
  cid: string,
  bvid: string,
  signal: AbortSignal,
  freshness?: RouteFreshness,
): Promise<SubtitleDescriptorResult> {
  if (!cid || !bvid) {
    return { subtitles: [], status: 'error', reason: '缺少 cid 或 bvid' };
  }

  let successfulResponses = 0;
  let lastError = '';
  for (const endpoint of ['wbi/v2', 'v2']) {
    throwIfAborted(signal);
    throwIfStale(freshness);
    try {
      const response = await fetchWithTimeout(
        `https://api.bilibili.com/x/player/${endpoint}?cid=${encodeURIComponent(cid)}&bvid=${encodeURIComponent(bvid)}`,
        { credentials: 'include', signal },
        BILI_API_TIMEOUT_MS,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as SubtitleListApiResponse;
      successfulResponses += 1;
      throwIfStale(freshness);
      const subtitles = data.data?.subtitle?.subtitles ?? [];
      if (subtitles.length) return { subtitles, status: 'available', reason: '' };
    } catch (error) {
      if (isAbortError(error)) throw error;
      throwIfStale(freshness);
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`[bilibili-bot] 字幕 ${endpoint} API 失败`, error);
    }
  }

  return successfulResponses > 0
    ? { subtitles: [], status: 'empty', reason: '' }
    : { subtitles: [], status: 'error', reason: lastError || '字幕接口请求失败' };
}

export async function fetchSubtitleContent(
  subtitleUrl: string,
  signal: AbortSignal,
  freshness?: RouteFreshness,
) {
  if (!subtitleUrl) return [];
  throwIfAborted(signal);
  throwIfStale(freshness);
  const url = subtitleUrl.startsWith('http') ? subtitleUrl : `https:${subtitleUrl}`;
  try {
    const response = await fetchWithTimeout(url, { signal }, BILI_SUBTITLE_TIMEOUT_MS);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as unknown;
    throwIfStale(freshness);
    return normalizeSubtitleSegments(data);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throwIfStale(freshness);
    console.warn('[bilibili-bot] 字幕正文获取失败', error);
    return [];
  }
}

export function pickPreferredSubtitle(
  subtitles: SubtitleDescriptor[],
): SubtitleDescriptor | null {
  return subtitles.find((subtitle) => subtitle.lan === 'zh-CN' || subtitle.lan === 'ai-zh')
    ?? subtitles[0]
    ?? null;
}

export async function fetchSubtitleFromApi(
  context: VideoContext,
  signal: AbortSignal,
  freshness?: RouteFreshness,
): Promise<SubtitleResult | null> {
  const descriptorResult = await fetchSubtitleDescriptorsResult(
    context.cid,
    context.bvid,
    signal,
    freshness,
  );
  if (descriptorResult.status !== 'available') return null;

  const target = pickPreferredSubtitle(descriptorResult.subtitles);
  if (!target?.subtitle_url) return null;
  const segments = await fetchSubtitleContent(target.subtitle_url, signal, freshness);
  const transcript = formatTranscript(segments);
  if (!segments.length || !transcript.trim()) return null;
  return { transcript, segments, source: 'api' };
}

