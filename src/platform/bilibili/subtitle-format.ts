import type { SubtitleSegment } from '../../contracts/video-context';
import type {
  SubtitleBlock,
  SubtitleTimelineMeta,
} from './types';

type UnknownSubtitleSegment = Record<string, unknown>;

function readSegmentText(segment: UnknownSubtitleSegment): string {
  return String(
    segment.content
    ?? segment.text
    ?? segment.sentence
    ?? segment.t
    ?? segment.c
    ?? '',
  ).replace(/\s+/g, ' ').trim();
}

export function normalizeSubtitleSegments(source: unknown): SubtitleSegment[] {
  const sourceRecord = source && typeof source === 'object'
    ? source as Record<string, unknown>
    : null;
  const list = Array.isArray(source)
    ? source
    : Array.isArray(sourceRecord?.body)
      ? sourceRecord.body
      : [];

  const segments: SubtitleSegment[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const segment = item as UnknownSubtitleSegment;
    let from = Number(
      segment.from
      ?? segment.start_time
      ?? segment.start
      ?? segment.st
      ?? 0,
    );
    if (!Number.isFinite(from)) from = 0;

    let to = Number(segment.to ?? segment.end_time ?? segment.end);
    if (!Number.isFinite(to)) {
      const duration = Number(segment.d);
      to = from + (Number.isFinite(duration) && duration > 0 ? duration : 2);
    }
    if (to < from) to = from;

    const content = readSegmentText(segment);
    if (!content) continue;
    segments.push({ from, to, content });
  }

  return segments.sort((left, right) => {
    if (left.from !== right.from) return left.from - right.from;
    return left.to - right.to;
  });
}

export function parseSubtitleJsonText(text: string): unknown | null {
  if (!text) return null;
  const cleaned = text.replace(/^\uFEFF/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}$/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export function findSubtitleSegmentsDeep(
  node: unknown,
  seen = new Set<object>(),
): SubtitleSegment[] {
  if (!node || typeof node !== 'object' || seen.has(node)) return [];
  seen.add(node);

  const direct = normalizeSubtitleSegments(node);
  if (direct.length) return direct;

  if (Array.isArray(node)) {
    for (const item of node) {
      const segments = findSubtitleSegmentsDeep(item, seen);
      if (segments.length) return segments;
    }
    return [];
  }

  for (const value of Object.values(node)) {
    const segments = findSubtitleSegmentsDeep(value, seen);
    if (segments.length) return segments;
  }
  return [];
}

export function formatTranscript(subtitles: SubtitleSegment[]): string {
  return subtitles
    .map((item) => item.content)
    .filter((text) => text.trim())
    .join('\n');
}

export function formatTimelineTimestamp(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function formatTimelineRange(from: number, to: number): string {
  const startLabel = formatTimelineTimestamp(from);
  const endLabel = formatTimelineTimestamp(to);
  if (!Number.isFinite(Number(to)) || Number(to) <= Number(from) || startLabel === endLabel) {
    return startLabel;
  }
  return `${startLabel}-${endLabel}`;
}

export function buildSubtitleBlocks(
  subtitles: SubtitleSegment[],
  options: { pauseBreakSec?: number; maxChars?: number } = {},
): SubtitleBlock[] {
  const segments = normalizeSubtitleSegments(subtitles);
  if (!segments.length) return [];

  let pauseBreakSec = Number(options.pauseBreakSec);
  if (!Number.isFinite(pauseBreakSec) || pauseBreakSec < 0) pauseBreakSec = 1.2;
  let maxChars = Number(options.maxChars);
  if (!Number.isFinite(maxChars) || maxChars < 20) maxChars = 110;

  const blocks: SubtitleBlock[] = [];
  let current = { ...segments[0] };
  for (const segment of segments.slice(1)) {
    const gap = segment.from - current.to;
    const mergedContent = `${current.content} ${segment.content}`;
    if (gap <= pauseBreakSec && mergedContent.length <= maxChars) {
      current.to = Math.max(current.to, segment.to);
      current.content = mergedContent;
    } else {
      blocks.push(current);
      current = { ...segment };
    }
  }
  blocks.push(current);
  return blocks;
}

export function buildSubtitleTimelineMeta(
  subtitles: SubtitleSegment[],
): SubtitleTimelineMeta | null {
  const segments = normalizeSubtitleSegments(subtitles);
  if (!segments.length) return null;
  const start = Number(segments[0].from) || 0;
  const last = segments[segments.length - 1];
  const end = Math.max(start, Number(last.to ?? last.from) || start);
  return {
    start,
    end,
    segmentCount: segments.length,
    blockCount: buildSubtitleBlocks(segments).length,
  };
}

export function formatTranscriptWithTimeline(subtitles: SubtitleSegment[]): string {
  return buildSubtitleBlocks(subtitles)
    .map((block) => `[${formatTimelineRange(block.from, block.to)}] ${block.content}`)
    .join('\n');
}

export function buildAiTranscript(
  subtitleBody: SubtitleSegment[],
  fallbackTranscript: string,
): string {
  const timelineTranscript = formatTranscriptWithTimeline(subtitleBody);
  if (!timelineTranscript) return fallbackTranscript || '';

  const meta = buildSubtitleTimelineMeta(subtitleBody);
  if (!meta) return timelineTranscript;
  return [
    '【字幕时间范围总览】',
    `字幕覆盖范围: [${formatTimelineRange(meta.start, meta.end)}]`,
    `字幕段数: ${meta.segmentCount}`,
    `整理后时间块: ${meta.blockCount}`,
    '',
    '【按时间范围整理的字幕】',
    timelineTranscript,
  ].join('\n');
}

export function parseSubtitleTimeToSeconds(timeText: string): number {
  const parts = timeText.trim().replace(',', '.').split(':');
  if (parts.length < 3) return 0;
  const hours = Number(parts[0]) || 0;
  const minutes = Number(parts[1]) || 0;
  const seconds = Number(parts[2]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

export function parseSrtToSegments(srtText: string): SubtitleSegment[] {
  if (!srtText) return [];
  const segments: SubtitleSegment[] = [];
  const blocks = srtText.replace(/\r/g, '').trim().split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (/^\d+$/.test(lines[0] ?? '')) lines.shift();
    const timeLine = lines.shift() ?? '';
    const match = timeLine.match(
      /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/,
    );
    if (!match) continue;
    const content = lines.join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!content) continue;
    segments.push({
      from: parseSubtitleTimeToSeconds(match[1]),
      to: parseSubtitleTimeToSeconds(match[2]),
      content,
    });
  }
  return normalizeSubtitleSegments(segments);
}

export function parseUploadedSubtitle(
  rawText: string,
  filename = '',
): { transcript: string; segments: SubtitleSegment[] } {
  if (!rawText) return { transcript: '', segments: [] };
  const isSrt = /\.srt$/i.test(filename)
    || /\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(rawText);
  if (!isSrt) return { transcript: rawText.trim(), segments: [] };
  const segments = parseSrtToSegments(rawText);
  return { transcript: formatTranscript(segments), segments };
}

export function toSrtTimestamp(seconds: number): string {
  const totalMs = Math.floor(Math.max(0, Number(seconds) || 0) * 1_000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1_000);
  const milliseconds = totalMs % 1_000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

export function buildSrtContent(subtitles: SubtitleSegment[]): string {
  return normalizeSubtitleSegments(subtitles)
    .map((segment, index) => [
      String(index + 1),
      `${toSrtTimestamp(segment.from)} --> ${toSrtTimestamp(segment.to)}`,
      segment.content,
    ].join('\n'))
    .join('\n\n');
}

export function hasStructuredSubtitleData(subtitles: SubtitleSegment[]): boolean {
  return normalizeSubtitleSegments(subtitles).length > 0;
}

