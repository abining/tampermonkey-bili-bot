import {
  callAiStream,
  type AiConnection,
  type ChatMessage,
  type StreamDeltaHandler,
} from './ai-client';

export interface SummaryVideoInfo {
  title?: string;
  collectionTitle?: string;
  partTitle?: string;
  page?: number;
  upName?: string;
  desc?: string;
}

export interface BuildSummaryPromptOptions {
  instruction: string;
  transcript: string;
  video: SummaryVideoInfo;
  pageUrl?: string;
  hasTimeline?: boolean;
  maxTranscriptChars?: number;
}

export interface BuiltSummaryPrompt {
  prompt: string;
  transcript: string;
  originalTranscriptLength: number;
  truncated: boolean;
}

export interface SummaryRequestOptions extends BuildSummaryPromptOptions, AiConnection {
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number | string;
  enableThinking?: boolean;
  timeout?: number;
  lengthErrorMessage?: string;
  onDelta?: StreamDeltaHandler;
}

export interface SummaryRequestResult extends BuiltSummaryPrompt {
  summary: string;
  messages: ChatMessage[];
}

export interface PortablePromptOptions extends Omit<BuildSummaryPromptOptions, 'maxTranscriptChars'> {
  usageNote?: string;
}

export function cleanVideoDescription(text: unknown): string {
  return String(text ?? '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function limitText(text: unknown, maxLength: number): string {
  const clean = cleanVideoDescription(text);
  if (!clean || clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength)}\n...（简介过长，已截断）`;
}

export function normalizeSummaryMaxTokens(value: unknown, fallback = 4000): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.max(500, Math.min(30_000, parsed)) : fallback;
}

export function checkApiConfigured(
  connection: Partial<AiConnection>,
  placeholders: Partial<Pick<AiConnection, 'apiUrl' | 'apiKey'>> = {},
): { configured: boolean; reason: string } {
  const apiUrl = String(connection.apiUrl ?? '').trim().replace(/\/+$/, '');
  const apiKey = String(connection.apiKey ?? '').trim();
  if (!apiUrl || !apiKey) return { configured: false, reason: 'API URL 或 API Key 未填写' };
  if (placeholders.apiUrl && apiUrl === String(placeholders.apiUrl).trim().replace(/\/+$/, '')) {
    return { configured: false, reason: 'API URL 仍是默认占位符，请填写真实的 API 地址' };
  }
  if (placeholders.apiKey && apiKey === String(placeholders.apiKey).trim()) {
    return { configured: false, reason: 'API Key 仍是默认占位符，请填写真实的 API Key' };
  }
  if (!String(connection.model ?? '').trim()) return { configured: false, reason: '模型未填写' };
  return { configured: true, reason: '' };
}

function appendVideoInfo(parts: string[], video: SummaryVideoInfo, pageUrl: string): void {
  parts.push(`视频URL: ${pageUrl}`);
  parts.push(`视频标题: ${video.title ?? ''}`);
  if (video.collectionTitle && video.collectionTitle !== video.title) {
    parts.push(`所属课程/合集: ${video.collectionTitle}`);
    parts.push(`当前分集: P${video.page || 1} ${video.partTitle || video.title || ''}`);
  }
  parts.push(`UP主: ${video.upName ?? ''}`);
  const description = limitText(video.desc, 1500);
  if (description) parts.push(`视频简介: ${description}`);
}

export function buildSummaryPrompt(options: BuildSummaryPromptOptions): BuiltSummaryPrompt {
  const transcript = String(options.transcript ?? '');
  const maxChars = Math.max(1, options.maxTranscriptChars ?? 64_000);
  const truncated = transcript.length > maxChars;
  const requestTranscript = truncated ? transcript.slice(0, maxChars) : transcript;
  const parts = [String(options.instruction ?? '').trim(), ''];
  appendVideoInfo(parts, options.video, options.pageUrl || window.location.href);
  parts.push('');
  parts.push(
    options.hasTimeline
      ? '字幕内容（每行开头的 [开始-结束] 是视频时间范围；回答涉及具体片段、原话或定位时，请尽量保留对应时间范围）:'
      : '字幕内容:',
  );
  parts.push(requestTranscript);

  return {
    prompt: parts.join('\n'),
    transcript: requestTranscript,
    originalTranscriptLength: transcript.length,
    truncated,
  };
}

export function buildPortableSummaryPrompt(options: PortablePromptOptions): string {
  const parts = ['===== 📝 AI 提示词 =====', options.instruction, '', '===== 📺 视频信息 ====='];
  appendVideoInfo(parts, options.video, options.pageUrl || window.location.href);
  parts.push('');
  parts.push(options.hasTimeline ? '===== 📄 字幕内容（带时间轴） =====' : '===== 📄 字幕内容 =====');
  if (options.hasTimeline) {
    parts.push(
      '说明：下方先给出字幕覆盖范围总览，再给出每个片段的 [开始-结束] 时间范围。回答涉及具体片段时，请尽量带上对应时间范围。',
    );
  }
  parts.push(options.transcript, '', '===== 💡 使用说明 =====');
  parts.push(
    options.usageNote ||
      '请将以上全部内容复制粘贴到任意 AI 对话（如 ChatGPT、DeepSeek、Kimi 等），即可生成视频摘要。',
  );
  return parts.join('\n');
}

export async function requestSummary(options: SummaryRequestOptions): Promise<SummaryRequestResult> {
  const built = buildSummaryPrompt(options);
  const messages: ChatMessage[] = [{ role: 'user', content: built.prompt }];
  const summary = await callAiStream(messages, options.onDelta, {
    apiUrl: options.apiUrl,
    apiKey: options.apiKey,
    model: options.model,
    signal: options.signal,
    temperature: options.temperature,
    maxTokens: normalizeSummaryMaxTokens(options.maxTokens),
    enableThinking: options.enableThinking,
    timeout: options.timeout,
    lengthErrorMessage: options.lengthErrorMessage,
  });
  if (!summary.trim()) throw new Error('AI 未返回文字总结内容');
  return { ...built, summary, messages: [...messages, { role: 'assistant', content: summary }] };
}
