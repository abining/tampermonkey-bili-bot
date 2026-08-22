import { GM_xmlhttpRequest } from '$';
import { buildChatCompletionsUrl } from './api-url';
import { createAbortError, gmRequest } from './gm-request';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AiConnection {
  apiUrl: string;
  apiKey: string;
  model: string;
}

export interface AiRequestOptions extends AiConnection {
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  enableThinking?: boolean;
  timeout?: number;
  lengthErrorMessage?: string;
}

export type StreamDeltaHandler = ((fullText: string, deltaText: string) => void) & {
  cancel?: () => void;
};

export interface ChatRequestBodyOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  enableThinking?: boolean;
}

const DEFAULT_LENGTH_ERROR =
  'AI 输出被截断：finish_reason=length。请调大最大输出 tokens，或换支持更大输出上限的模型/API。';

export function buildChatRequestBody(
  model: string,
  messages: ChatMessage[],
  options: ChatRequestBodyOptions = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2000,
  };
  if (options.stream) body.stream = true;
  if (options.enableThinking === false) {
    body.thinking = { type: 'disabled' };
    body.enable_thinking = false;
  }
  return body;
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      const record = part as Record<string, unknown>;
      return String(record.text ?? record.content ?? record.delta ?? '');
    })
    .join('');
}

function extractDelta(payload: unknown): { delta: string; finishReason: string } {
  if (!payload || typeof payload !== 'object') return { delta: '', finishReason: '' };
  const data = payload as Record<string, unknown>;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const choice = choices[0] as Record<string, unknown> | undefined;
  const choiceDelta = choice?.delta as Record<string, unknown> | undefined;
  const choiceMessage = choice?.message as Record<string, unknown> | undefined;
  const responseDelta =
    typeof data.delta === 'string' && String(data.type ?? '').includes('output_text') ? data.delta : '';
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const candidate = candidates[0] as Record<string, unknown> | undefined;
  const candidateContent = candidate?.content as Record<string, unknown> | undefined;
  const candidateParts = candidateContent?.parts;

  return {
    delta:
      contentToText(choiceDelta?.content) ||
      contentToText(choiceMessage?.content) ||
      responseDelta ||
      contentToText(data.output_text) ||
      contentToText(candidateParts),
    finishReason: String(choice?.finish_reason ?? candidate?.finishReason ?? data.finish_reason ?? ''),
  };
}

function extractResponseText(payload: unknown): { text: string; finishReason: string } {
  const direct = extractDelta(payload);
  if (direct.delta) return { text: direct.delta, finishReason: direct.finishReason };
  if (!payload || typeof payload !== 'object') return { text: '', finishReason: '' };

  const data = payload as Record<string, unknown>;
  const output = Array.isArray(data.output) ? data.output : [];
  const text = output
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const content = (item as Record<string, unknown>).content;
      return Array.isArray(content) ? content : [];
    })
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const record = part as Record<string, unknown>;
      return String(record.text ?? record.output_text ?? '');
    })
    .join('');

  return {
    text: text || contentToText(data.output_text),
    finishReason: String(data.finish_reason ?? ''),
  };
}

export function callAiStream(
  messages: ChatMessage[],
  onDelta: StreamDeltaHandler | undefined,
  options: AiRequestOptions,
): Promise<string> {
  const apiUrl = buildChatCompletionsUrl(options.apiUrl);
  const apiKey = String(options.apiKey ?? '').trim();
  const model = String(options.model ?? '').trim();
  if (!apiUrl || !apiKey || !model) {
    return Promise.reject(new Error('请填写 apiUrl、apiKey 和 model'));
  }

  return new Promise((resolve, reject) => {
    let fullText = '';
    let receivedLength = 0;
    let buffer = '';
    let finishReason = '';
    let receivedDone = false;
    let settled = false;
    const signal = options.signal;
    const lengthErrorMessage = options.lengthErrorMessage ?? DEFAULT_LENGTH_ERROR;

    const cancelPendingDelta = () => onDelta?.cancel?.();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      cancelPendingDelta();
      callback();
    };

    const consume = (text: string, flush: boolean) => {
      buffer += text;
      const lines = buffer.split(/\r?\n/);
      buffer = flush ? '' : lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const rawPayload = trimmed.slice(5).trim();
        if (!rawPayload) continue;
        if (rawPayload === '[DONE]') {
          receivedDone = true;
          continue;
        }
        try {
          const parsed = extractDelta(JSON.parse(rawPayload));
          if (parsed.finishReason) finishReason = parsed.finishReason;
          if (parsed.delta) {
            fullText += parsed.delta;
            onDelta?.(fullText, parsed.delta);
          }
        } catch {
          // 部分兼容服务会在 progress 中给出不完整 JSON，等待下一段再处理。
        }
      }
    };

    const request = GM_xmlhttpRequest({
      method: 'POST',
      url: apiUrl,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'text/event-stream',
      },
      data: JSON.stringify(
        buildChatRequestBody(model, messages, {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          stream: true,
          enableThinking: options.enableThinking,
        }),
      ),
      timeout: options.timeout ?? 180_000,
      onprogress: (event) => {
        const text = String(event.responseText ?? '');
        if (text.length <= receivedLength) return;
        consume(text.slice(receivedLength), false);
        receivedLength = text.length;
        if (!receivedDone) return;
        finish(() => {
          if (finishReason === 'length') reject(new Error(lengthErrorMessage));
          else if (!fullText) reject(new Error('API 响应格式异常'));
          else resolve(fullText);
        });
        try {
          request.abort();
        } catch {
          // 请求已经结束时无需处理。
        }
      },
      onload: (response) => {
        if (settled) return;
        const text = String(response.responseText ?? '');
        if (response.status < 200 || response.status >= 300) {
          finish(() => reject(new Error(`API 错误: ${response.status} ${text.slice(0, 500)}`)));
          return;
        }
        if (text.length > receivedLength) consume(text.slice(receivedLength), false);
        consume('', true);
        if (!fullText) {
          try {
            const extracted = extractResponseText(JSON.parse(text));
            fullText = extracted.text;
            finishReason = extracted.finishReason || finishReason;
            if (fullText) onDelta?.(fullText, fullText);
          } catch {
            // 统一在下方返回“响应格式异常”。
          }
        }
        finish(() => {
          if (finishReason === 'length') reject(new Error(lengthErrorMessage));
          else if (!fullText) reject(new Error('API 响应格式异常'));
          else resolve(fullText);
        });
      },
      onerror: () => finish(() => reject(new Error('网络请求失败'))),
      ontimeout: () => finish(() => reject(new Error('API 请求超时'))),
      onabort: () => {
        finish(() => {
          if (fullText.trim()) resolve(`${fullText}\n\n_⏹ 已被用户打断_`);
          else reject(createAbortError());
        });
      },
    });

    function abort(): void {
      try {
        request.abort();
      } catch {
        finish(() => reject(createAbortError()));
      }
    }

    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
  });
}

export async function callAi(messages: ChatMessage[], options: AiRequestOptions): Promise<string> {
  const apiUrl = buildChatCompletionsUrl(options.apiUrl);
  const apiKey = String(options.apiKey ?? '').trim();
  const model = String(options.model ?? '').trim();
  if (!apiUrl || !apiKey || !model) throw new Error('请填写 apiUrl、apiKey 和 model');

  const response = await gmRequest({
    method: 'POST',
    url: apiUrl,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    data: JSON.stringify(
      buildChatRequestBody(model, messages, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        enableThinking: options.enableThinking,
      }),
    ),
    timeout: options.timeout,
    signal: options.signal,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`API 错误: ${response.status} ${String(response.responseText ?? '').slice(0, 500)}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(response.responseText);
  } catch {
    throw new Error('API 响应不是有效 JSON');
  }
  const result = extractResponseText(payload);
  if (result.finishReason === 'length') {
    throw new Error(options.lengthErrorMessage ?? DEFAULT_LENGTH_ERROR);
  }
  if (!result.text) throw new Error('API 响应格式异常');
  return result.text;
}

export function createThrottledDelta(
  handler: (fullText: string, deltaText: string) => void,
  intervalMs = 80,
): StreamDeltaHandler {
  let lastCall = 0;
  let pendingFull = '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  const throttled = ((fullText: string, deltaText: string) => {
    pendingFull = fullText;
    const now = Date.now();
    if (now - lastCall >= intervalMs) {
      lastCall = now;
      if (timer) clearTimeout(timer);
      timer = undefined;
      handler(pendingFull, deltaText);
      return;
    }
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      lastCall = Date.now();
      handler(pendingFull, '');
    }, intervalMs - (now - lastCall));
  }) as StreamDeltaHandler;

  throttled.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  return throttled;
}
