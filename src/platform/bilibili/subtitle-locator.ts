import type { SubtitleSegment } from '../../contracts/video-context';
import {
  buildSubtitleTimelineMeta,
  formatTimelineRange,
  normalizeSubtitleSegments,
} from './subtitle-format';

export function normalizeSubtitleSearchText(text: string): string {
  return String(text || '').toLowerCase().replace(/[^0-9a-z\u4e00-\u9fa5]+/g, '');
}

export function extractSubtitleSearchTerms(text: string): string[] {
  const matches = String(text || '').toLowerCase().match(/[0-9a-z\u4e00-\u9fa5]{2,}/g) ?? [];
  const terms: string[] = [];
  const seen = new Set<string>();
  const compact = normalizeSubtitleSearchText(text);
  if (compact.length >= 2 && compact.length <= 48) {
    seen.add(compact);
    terms.push(compact);
  }
  for (const match of matches) {
    const term = normalizeSubtitleSearchText(match);
    if (term.length < 2 || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
  }
  return terms.slice(0, 12);
}

export function buildSubtitleSearchBigrams(text: string): string[] {
  const compact = normalizeSubtitleSearchText(text);
  const bigrams: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    const bigram = compact.slice(index, index + 2);
    if (seen.has(bigram)) continue;
    seen.add(bigram);
    bigrams.push(bigram);
  }
  return bigrams;
}

export function scoreSubtitleSegmentForQuery(
  segmentText: string,
  compactQuery: string,
  terms: string[],
  bigrams: string[],
): number {
  const haystack = normalizeSubtitleSearchText(segmentText);
  if (!haystack) return 0;
  let score = 0;
  if (compactQuery.length >= 2 && haystack.includes(compactQuery)) {
    score += 200 + Math.min(80, compactQuery.length * 2);
  }
  for (const term of terms) {
    if (haystack.includes(term)) score += Math.min(60, term.length * 8);
  }
  for (const bigram of bigrams) {
    if (haystack.includes(bigram)) score += 3;
  }
  return score;
}

export function buildSubtitleLocatorContext(
  question: string,
  subtitles: SubtitleSegment[],
): string {
  const segments = normalizeSubtitleSegments(subtitles);
  if (!segments.length) return '';

  const compactQuery = normalizeSubtitleSearchText(question);
  const terms = extractSubtitleSearchTerms(question);
  const bigrams = buildSubtitleSearchBigrams(question);
  const scored = segments
    .map((segment, index) => ({
      index,
      score: scoreSubtitleSegmentForQuery(segment.content, compactQuery, terms, bigrams),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  if (!scored.length) return '';

  const selected: Array<{ index: number; score: number }> = [];
  for (const item of scored) {
    if (selected.length >= 6) break;
    if (selected.some((existing) => Math.abs(existing.index - item.index) <= 1)) continue;
    selected.push(item);
  }

  const windows = selected
    .map((item) => ({
      start: Math.max(0, item.index - 1),
      end: Math.min(segments.length - 1, item.index + 1),
    }))
    .sort((left, right) => left.start - right.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const current of windows) {
    const last = merged[merged.length - 1];
    if (last && current.start <= last.end + 1) last.end = Math.max(last.end, current.end);
    else merged.push({ ...current });
  }

  const lines = [
    '【字幕定位参考】',
    '以下是和当前问题最相关的原始字幕片段。回答定位问题时，只能引用这里已经出现的时间范围。',
  ];
  const meta = buildSubtitleTimelineMeta(segments);
  if (meta) lines.push(`当前字幕覆盖范围: [${formatTimelineRange(meta.start, meta.end)}]`);

  merged.forEach((windowItem, windowIndex) => {
    const first = segments[windowItem.start];
    const last = segments[windowItem.end];
    lines.push('', `片段${windowIndex + 1} [${formatTimelineRange(first.from, last.to)}]`);
    for (let index = windowItem.start; index <= windowItem.end; index += 1) {
      const segment = segments[index];
      lines.push(`[${formatTimelineRange(segment.from, segment.to)}] ${segment.content}`);
    }
  });
  return lines.join('\n');
}

