import { unsafeWindow } from '$';
import type { ChatMessage } from './ai-client';
import { gmRequest } from './gm-request';

export interface FlomoVideoInfo {
  title?: string;
}

export interface BuildFlomoContentOptions {
  summary: string;
  video?: FlomoVideoInfo;
  pageUrl?: string;
  conversation?: ChatMessage[];
  model?: string;
  tags?: string;
}

export interface SendToFlomoOptions extends BuildFlomoContentOptions {
  webhookUrl: string;
  timeout?: number;
  signal?: AbortSignal;
}

export interface FlomoSendResult {
  content: string;
  response: unknown;
}

export function buildFlomoContent(options: BuildFlomoContentOptions): string {
  const lines: string[] = [];
  if (options.video) {
    lines.push(`📄 ${options.video.title || '未知标题'}`);
    lines.push(`🔗 ${options.pageUrl || unsafeWindow.location.href}`);
    lines.push('');
  }
  lines.push('===== 🤖 AI 总结 =====', options.summary);

  const dialog = (options.conversation || []).filter((message) => message.role !== 'system').slice(2);
  if (dialog.length) {
    lines.push('', '===== 💬 后续对话 =====');
    for (const message of dialog) {
      lines.push(message.role === 'user' ? '【我】' : `【AI · ${options.model || 'AI'}】`);
      lines.push(message.content, '');
    }
  }

  const tags = String(options.tags || '').trim();
  if (tags) lines.push('---', tags);
  return lines.join('\n');
}

function isSuccessResponse(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return true;
  const data = payload as Record<string, unknown>;
  return data.code === undefined || data.code === 0 || data.code === 200 || data.message === 'ok';
}

export async function sendToFlomo(options: SendToFlomoOptions): Promise<FlomoSendResult> {
  if (!String(options.webhookUrl || '').trim()) throw new Error('请先配置 flomo API 地址');
  const content = buildFlomoContent(options);
  const response = await gmRequest({
    method: 'POST',
    url: options.webhookUrl,
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({ content }),
    timeout: options.timeout ?? 30_000,
    signal: options.signal,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status} ${String(response.responseText ?? '')}`);
  }

  let payload: unknown = {};
  if (response.responseText) {
    try {
      payload = JSON.parse(response.responseText);
    } catch {
      payload = response.responseText;
    }
  }
  if (!isSuccessResponse(payload)) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String(payload.message)
        : '发送失败';
    throw new Error(message);
  }
  return { content, response: payload };
}
