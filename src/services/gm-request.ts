import { GM_xmlhttpRequest } from '$';

export interface GmTextResponse {
  finalUrl?: string;
  readyState?: number;
  responseHeaders?: string;
  responseText: string;
  status: number;
  statusText?: string;
}

export interface GmRequestOptions {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  data?: BodyInit;
  timeout?: number;
  signal?: AbortSignal;
  onProgress?: (response: GmTextResponse) => void;
}

export function createAbortError(message = '用户已打断'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
}

export function gmRequest(options: GmRequestOptions): Promise<GmTextResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const signal = options.signal;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', abort);
      callback();
    };

    const request = GM_xmlhttpRequest({
      method: options.method ?? 'GET',
      url: options.url,
      headers: options.headers,
      data: options.data,
      timeout: options.timeout ?? 120_000,
      onprogress: options.onProgress
        ? (response) => options.onProgress?.(response as GmTextResponse)
        : undefined,
      onload: (response) => settle(() => resolve(response as GmTextResponse)),
      onerror: (error) =>
        settle(() => reject(new Error(`网络请求失败: ${error?.error || 'GM_xmlhttpRequest error'}`))),
      ontimeout: () => settle(() => reject(new Error('API 请求超时'))),
      onabort: () => settle(() => reject(createAbortError())),
    });

    function abort(): void {
      try {
        request.abort();
      } catch {
        settle(() => reject(createAbortError()));
      }
    }

    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
  });
}
