import type { RouteFreshness } from './types';

export const BILI_API_TIMEOUT_MS = 12_000;
export const BILI_SUBTITLE_TIMEOUT_MS = 15_000;

export class BiliRiskControlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BiliRiskControlError';
  }
}

export class StaleVideoContextError extends Error {
  constructor(message = '视频路由或分集上下文已经变化') {
    super(message);
    this.name = 'StaleVideoContextError';
  }
}

export function createAbortError(message = '用户已打断'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === 'AbortError' || /aborted|abort|打断/i.test(error.message));
}

export function isStaleVideoContextError(error: unknown): error is StaleVideoContextError {
  return error instanceof StaleVideoContextError;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

export function throwIfStale(freshness?: RouteFreshness): void {
  if (freshness?.isCurrent && !freshness.isCurrent()) {
    throw new StaleVideoContextError();
  }
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = BILI_API_TIMEOUT_MS,
): Promise<Response> {
  const externalSignal = options.signal;
  const controller = new AbortController();
  let timedOut = false;
  let fetchResolved = false;

  const onExternalAbort = () => controller.abort();
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) onExternalAbort();
    else externalSignal.addEventListener('abort', onExternalAbort);
  }

  let raceTimer: number | null = null;
  const raceTimeout = new Promise<never>((_, reject) => {
    raceTimer = window.setTimeout(() => {
      if (!fetchResolved) {
        reject(new Error(`请求超时（${Math.round(timeoutMs / 1000)}秒）`));
      }
    }, timeoutMs + 3_000);
  });

  try {
    const response = await Promise.race([
      fetch(url, { ...options, signal: controller.signal }),
      raceTimeout,
    ]);
    fetchResolved = true;
    return response;
  } catch (error) {
    fetchResolved = true;
    if (isAbortError(error)) {
      if (externalSignal?.aborted && !timedOut) throw createAbortError();
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}秒）`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    if (raceTimer !== null) window.clearTimeout(raceTimer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

export function randomDelay(minMs: number, maxMs: number, signal?: AbortSignal): Promise<void> {
  const delayMs = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve, reject) => {
    let timer: number | null = null;
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const onAbort = () => {
      if (timer !== null) window.clearTimeout(timer);
      cleanup();
      reject(createAbortError());
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort);
    timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
  });
}

export async function retryWithBackoff<T>(
  task: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    throwIfAborted(signal);
    try {
      return await task();
    } catch (error) {
      if (isAbortError(error) || isStaleVideoContextError(error)) throw error;
      lastError = error;
      if (attempt === maxRetries) break;
      const delayMs = baseDelayMs * (2 ** attempt) + Math.random() * 1_000;
      await randomDelay(delayMs, delayMs, signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const SAFE_FETCH_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Origin: 'https://www.bilibili.com',
};

export function createSafeBiliFetcher(signal?: AbortSignal) {
  return async (url: string, options: RequestInit = {}): Promise<Response> => {
    const response = await fetchWithTimeout(url, {
      ...options,
      credentials: 'include',
      headers: {
        ...SAFE_FETCH_HEADERS,
        Referer: window.location.href,
        ...options.headers,
      },
      signal: signal ?? options.signal,
    }, BILI_API_TIMEOUT_MS);

    if (response.status === 412) {
      throw new BiliRiskControlError('触发B站风控(412)，请求被拒绝，请稍后再试');
    }
    if (response.status === 403) {
      throw new BiliRiskControlError('被B站拒绝访问(403)，可能需要登录或IP被限制');
    }
    if (response.status === 429) {
      throw new BiliRiskControlError('请求过于频繁(429)，触发限流');
    }
    return response;
  };
}

