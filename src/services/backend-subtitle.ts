import type { SubtitleResult } from '../contracts/runtime';
import type { VideoContext } from '../contracts/video-context';
import {
  formatTranscript,
  normalizeSubtitleSegments,
  parseUploadedSubtitle,
} from '../platform/bilibili/subtitle-format';
import { isRecord } from '../utils/json';
import { gmRequest, isAbortError } from './gm-request';

export type BackendSubtitleSourceMode = 'video_id' | 'page_url';

export interface BackendSubtitleServiceConfig {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  sourceMode: BackendSubtitleSourceMode;
  timeoutSeconds: number;
  pollIntervalMs: number;
}

export interface BackendSubtitleCallbacks {
  onStatus?: (message: string) => void;
}

interface BackendJobState {
  status: string;
  jobId: string;
  statusUrl: string;
  fileUrl: string;
  error: string;
  subtitle: SubtitleResult | null;
}

function createAbortError(): Error {
  const error = new Error('用户已打断');
  error.name = 'AbortError';
  return error;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = window.setTimeout(finish, ms);
    signal.addEventListener('abort', abort, { once: true });

    function finish() {
      signal.removeEventListener('abort', abort);
      resolve();
    }

    function abort() {
      window.clearTimeout(timer);
      reject(createAbortError());
    }
  });
}

function absoluteUrl(value: unknown, baseUrl: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const resolved = new URL(raw, baseUrl);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:'
      ? resolved.href
      : '';
  } catch {
    return '';
  }
}

function apiKeyForUrl(url: string, apiUrl: string, apiKey: string): string {
  try {
    return new URL(url).origin === new URL(apiUrl).origin ? apiKey : '';
  } catch {
    return '';
  }
}

function createCanonicalPageUrl(context: VideoContext): string {
  const page = Math.max(1, Number(context.page) || 1);
  return `https://www.bilibili.com/video/${encodeURIComponent(context.bvid)}?p=${page}`;
}

function textToSubtitle(text: string, filename = ''): SubtitleResult | null {
  const value = String(text || '').trim();
  if (!value) return null;
  const looksLikeSrt = /(?:^|\n)\s*\d+\s*\r?\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->/m.test(value);
  const parsed = parseUploadedSubtitle(value, filename || (looksLikeSrt ? 'subtitle.srt' : 'subtitle.txt'));
  if (!parsed.transcript.trim()) return null;
  return {
    transcript: parsed.transcript,
    segments: parsed.segments,
    source: 'backend',
  };
}

function pickPayload(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  if (isRecord(value.data)) return { ...value, ...value.data };
  if (isRecord(value.result)) return { ...value, ...value.result };
  return value;
}

function parseJobState(value: unknown, apiUrl: string): BackendJobState {
  const payload = pickPayload(value);
  const rawSegments = payload.segments ?? payload.subtitles ?? payload.items;
  const segments = normalizeSubtitleSegments(rawSegments);
  const rawText = String(
    payload.transcript
    ?? payload.text
    ?? payload.subtitle
    ?? payload.content
    ?? '',
  );
  const transcript = rawText.trim() || formatTranscript(segments);
  const subtitle = transcript.trim()
    ? (segments.length
      ? { transcript, segments, source: 'backend' as const }
      : textToSubtitle(transcript, String(payload.filename || '')))
    : null;

  return {
    status: String(payload.status ?? payload.state ?? '').toLocaleLowerCase(),
    jobId: String(payload.job_id ?? payload.jobId ?? payload.id ?? '').trim(),
    statusUrl: absoluteUrl(payload.status_url ?? payload.statusUrl, apiUrl),
    fileUrl: absoluteUrl(
      payload.subtitle_url
      ?? payload.subtitleUrl
      ?? payload.file_url
      ?? payload.fileUrl
      ?? payload.download_url
      ?? payload.downloadUrl,
      apiUrl,
    ),
    error: String(payload.error ?? payload.message ?? payload.detail ?? '').trim(),
    subtitle,
  };
}

async function requestBackend(
  url: string,
  method: 'GET' | 'POST',
  apiKey: string,
  signal: AbortSignal,
  body?: Record<string, unknown>,
): Promise<{ rawText: string; state: BackendJobState | null }> {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, application/x-subrip, text/vtt',
  };
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  const response = await gmRequest({
    method,
    url,
    headers,
    data: body ? JSON.stringify(body) : undefined,
    signal,
    timeout: method === 'POST' ? 120_000 : 60_000,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`字幕后端 HTTP ${response.status}: ${response.responseText.slice(0, 240)}`);
  }
  const rawText = String(response.responseText || '').trim();
  if (!rawText) return { rawText: '', state: null };
  try {
    return { rawText, state: parseJobState(JSON.parse(rawText), url) };
  } catch {
    return { rawText, state: null };
  }
}

async function fetchSubtitleFile(
  fileUrl: string,
  apiUrl: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<SubtitleResult | null> {
  const response = await requestBackend(
    fileUrl,
    'GET',
    apiKeyForUrl(fileUrl, apiUrl, apiKey),
    signal,
  );
  if (response.state?.subtitle) return response.state.subtitle;
  return textToSubtitle(response.rawText, fileUrl);
}

function createJobUrl(apiUrl: string, state: BackendJobState): string {
  if (state.statusUrl) return state.statusUrl;
  if (!state.jobId) return '';
  return `${apiUrl.replace(/\/+$/, '')}/${encodeURIComponent(state.jobId)}`;
}

function isPendingStatus(status: string): boolean {
  return !status || [
    'accepted',
    'created',
    'pending',
    'queued',
    'processing',
    'running',
    'transcribing',
  ].includes(status);
}

function isFailedStatus(status: string): boolean {
  return ['canceled', 'cancelled', 'error', 'failed', 'failure', 'rejected'].includes(status);
}

export async function fetchSubtitleFromBackend(
  context: VideoContext,
  config: BackendSubtitleServiceConfig,
  signal: AbortSignal,
  callbacks: BackendSubtitleCallbacks = {},
): Promise<SubtitleResult | null> {
  const apiUrl = String(config.apiUrl || '').trim();
  if (!config.enabled || !apiUrl) return null;
  callbacks.onStatus?.('正在提交字幕后端任务...');
  const pageUrl = createCanonicalPageUrl(context);

  const requestBody = {
    version: 1,
    input: config.sourceMode === 'page_url'
      ? {
          type: 'url',
          url: pageUrl,
        }
      : {
          type: 'bilibili',
          bvid: context.bvid,
          cid: context.cid,
          aid: context.aid,
          page: context.page,
        },
    video: {
      platform: 'bilibili',
      bvid: context.bvid,
      cid: context.cid,
      aid: context.aid,
      page: context.page,
      page_url: pageUrl,
      title: context.title,
      part_title: context.partTitle,
      duration: context.duration,
    },
    output: {
      language: 'zh-CN',
      timestamps: true,
      preferred_format: 'json',
      accepted_formats: ['json', 'srt', 'text'],
    },
  };

  try {
    const initial = await requestBackend(
      apiUrl,
      'POST',
      config.apiKey,
      signal,
      requestBody,
    );
    if (initial.state?.subtitle) return initial.state.subtitle;
    if (!initial.state) return textToSubtitle(initial.rawText, apiUrl);
    if (initial.state.fileUrl) {
      callbacks.onStatus?.('字幕后端已完成，正在下载字幕文件...');
      return fetchSubtitleFile(initial.state.fileUrl, apiUrl, config.apiKey, signal);
    }
    if (isFailedStatus(initial.state.status)) {
      throw new Error(initial.state.error || '字幕后端任务失败');
    }

    const jobUrl = createJobUrl(apiUrl, initial.state);
    if (!jobUrl || !isPendingStatus(initial.state.status)) {
      throw new Error(initial.state.error || '字幕后端没有返回字幕内容或可轮询的任务地址');
    }

    const deadline = Date.now() + Math.max(30, config.timeoutSeconds) * 1_000;
    const interval = Math.max(500, config.pollIntervalMs);
    while (Date.now() < deadline) {
      callbacks.onStatus?.(`字幕后端处理中${initial.state.jobId ? ` · ${initial.state.jobId}` : ''}`);
      await wait(interval, signal);
      const polled = await requestBackend(
        jobUrl,
        'GET',
        apiKeyForUrl(jobUrl, apiUrl, config.apiKey),
        signal,
      );
      if (polled.state?.subtitle) return polled.state.subtitle;
      if (!polled.state) {
        const subtitle = textToSubtitle(polled.rawText, jobUrl);
        if (subtitle) return subtitle;
        continue;
      }
      if (polled.state.fileUrl) {
        callbacks.onStatus?.('字幕后端已完成，正在下载字幕文件...');
        return fetchSubtitleFile(polled.state.fileUrl, apiUrl, config.apiKey, signal);
      }
      if (isFailedStatus(polled.state.status)) {
        throw new Error(polled.state.error || '字幕后端任务失败');
      }
    }
    throw new Error(`字幕后端处理超时（${Math.max(30, config.timeoutSeconds)} 秒）`);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error(`字幕后端请求失败：${error instanceof Error ? error.message : String(error)}`);
  }
}
