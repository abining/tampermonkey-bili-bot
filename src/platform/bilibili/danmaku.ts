import type { SubtitleSegment } from '../../contracts/video-context';
import {
  BiliRiskControlError,
  createSafeBiliFetcher,
  isAbortError,
  retryWithBackoff,
  throwIfAborted,
  throwIfStale,
} from './shared';
import {
  buildSubtitleBlocks,
  formatTimelineRange,
} from './subtitle-format';
import type {
  DanmakuFetchOptions,
  DanmakuItem,
} from './types';

const DANMAKU_MAX_RETRIES = 2;
const DANMAKU_RETRY_BASE_DELAY_MS = 5_000;

async function fetchDanmakuXml(
  safeFetch: ReturnType<typeof createSafeBiliFetcher>,
  cid: string,
): Promise<DanmakuItem[]> {
  const response = await safeFetch(
    `https://api.bilibili.com/x/v1/dm/list.so?oid=${encodeURIComponent(cid)}`,
  );
  if (!response.ok) throw new Error(`弹幕API请求失败: HTTP ${response.status}`);

  const xmlText = new TextDecoder('utf-8').decode(await response.arrayBuffer());
  const documentNode = new DOMParser().parseFromString(xmlText, 'text/xml');
  return Array.from(documentNode.querySelectorAll('d')).flatMap((node) => {
    const parts = (node.getAttribute('p') ?? '').split(',');
    const text = node.textContent?.trim() ?? '';
    if (!text) return [];
    return [{ time: Number.parseFloat(parts[0] ?? '') || 0, text }];
  });
}

export async function fetchAllDanmaku(
  cid: string,
  signal: AbortSignal,
  options: DanmakuFetchOptions = {},
): Promise<DanmakuItem[]> {
  if (!cid) return [];
  const safeFetch = createSafeBiliFetcher(signal);
  const maxDanmaku = options.maxDanmaku ?? 3_000;
  try {
    throwIfAborted(signal);
    throwIfStale(options);
    options.onStatus?.('正在获取弹幕...');
    const danmaku = await retryWithBackoff(
      () => fetchDanmakuXml(safeFetch, cid),
      DANMAKU_MAX_RETRIES,
      DANMAKU_RETRY_BASE_DELAY_MS,
      signal,
    );
    throwIfStale(options);
    options.onStatus?.(`已获取 ${danmaku.length} 条弹幕...`);
    return danmaku.slice(0, maxDanmaku);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throwIfStale(options);
    console.warn('[bilibili-bot] 获取弹幕失败', error);
    if (error instanceof BiliRiskControlError) {
      console.warn('[bilibili-bot] 检测到风控，停止弹幕请求');
    }
    return [];
  }
}

export function formatDanmakuText(danmaku: DanmakuItem[]): string {
  return danmaku.map((item, index) => {
    const minutes = Math.floor(item.time / 60);
    const seconds = Math.floor(item.time % 60);
    return `[${index + 1}] [${minutes}:${String(seconds).padStart(2, '0')}] ${item.text}`;
  }).join('\n');
}

export interface AlignedTimelineItem {
  time: number;
  from: number;
  to: number;
  label: string;
  subtitle: string;
  danmaku: string[];
}

export function alignTimeline(
  subtitles: SubtitleSegment[],
  danmaku: DanmakuItem[],
): AlignedTimelineItem[] {
  const subtitleBlocks = buildSubtitleBlocks(subtitles);
  const sortedDanmaku = [...danmaku].sort((left, right) => left.time - right.time);
  return subtitleBlocks.map((segment) => {
    const matched = sortedDanmaku
      .filter((item) => item.time >= segment.from - 2 && item.time <= segment.to + 2)
      .map((item) => item.text);
    return {
      time: segment.from,
      from: segment.from,
      to: segment.to,
      label: formatTimelineRange(segment.from, segment.to),
      subtitle: segment.content,
      danmaku: matched,
    };
  });
}

