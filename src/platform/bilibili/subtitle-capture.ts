import type { SubtitleSegment } from '../../contracts/video-context';
import {
  createAbortError,
  randomDelay,
  StaleVideoContextError,
  throwIfAborted,
  throwIfStale,
} from './shared';
import {
  findSubtitleSegmentsDeep,
  formatTranscript,
  parseSubtitleJsonText,
} from './subtitle-format';
import type {
  CapturedSubtitleEntry,
  RouteFreshness,
  SubtitleCaptureSession,
  SubtitleToggleState,
} from './types';
import { getBilibiliRouteKey } from './video-context';

export const SUBTITLE_CAPTURE_CONTROL_TIMEOUT_MS = 3_500;
export const SUBTITLE_CAPTURE_WAIT_TIMEOUT_MS = 5_000;

interface CaptureRequestContext {
  routeKey: string;
  requestStartedAt: number;
}

type CapturePayloadListener = (
  url: string,
  text: string,
  json: unknown,
  requestContext: CaptureRequestContext,
) => void;

interface CaptureBridge {
  version: number;
  installed: boolean;
  listeners: Set<CapturePayloadListener>;
}

type CapturePageWindow = Window & typeof globalThis & {
  __BILI_BOT_SUBTITLE_CAPTURE_BRIDGE__?: CaptureBridge;
};

declare const unsafeWindow: CapturePageWindow | undefined;

interface CaptureWaiter {
  routeKey: string;
  minRequestStartedAt: number;
  resolve: (entry: CapturedSubtitleEntry) => void;
  reject: (error: Error) => void;
}

const captureEntries: CapturedSubtitleEntry[] = [];
let captureWaiters: CaptureWaiter[] = [];
let listenerRegistered = false;
const CAPTURE_BRIDGE_VERSION = 2;

function getCaptureWindow(): CapturePageWindow {
  return typeof unsafeWindow !== 'undefined'
    ? unsafeWindow
    : window as CapturePageWindow;
}

function getCaptureBridge(): CaptureBridge {
  const captureWindow = getCaptureWindow();
  if (
    !captureWindow.__BILI_BOT_SUBTITLE_CAPTURE_BRIDGE__
    || captureWindow.__BILI_BOT_SUBTITLE_CAPTURE_BRIDGE__.version !== CAPTURE_BRIDGE_VERSION
  ) {
    captureWindow.__BILI_BOT_SUBTITLE_CAPTURE_BRIDGE__ = {
      version: CAPTURE_BRIDGE_VERSION,
      installed: false,
      listeners: new Set(),
    };
  }
  return captureWindow.__BILI_BOT_SUBTITLE_CAPTURE_BRIDGE__;
}

function acceptCapturedSubtitle(
  url: string,
  text: string,
  json: unknown,
  requestContext: CaptureRequestContext,
): void {
  const payload = json ?? parseSubtitleJsonText(text);
  const segments = findSubtitleSegmentsDeep(payload);
  const transcript = formatTranscript(segments);
  if (!segments.length || !transcript.trim()) return;

  const entry: CapturedSubtitleEntry = {
    url,
    routeKey: requestContext.routeKey,
    requestStartedAt: requestContext.requestStartedAt,
    segments,
    transcript,
    createdAt: Date.now(),
  };
  captureEntries.push(entry);
  if (captureEntries.length > 5) captureEntries.shift();

  const waiters = captureWaiters;
  captureWaiters = [];
  for (const waiter of waiters) {
    if (
      entry.routeKey === waiter.routeKey
      && entry.requestStartedAt >= waiter.minRequestStartedAt
    ) waiter.resolve(entry);
    else captureWaiters.push(waiter);
  }
}

export function installSubtitleCapture(): void {
  const captureWindow = getCaptureWindow();
  const bridge = getCaptureBridge();
  if (!listenerRegistered) {
    bridge.listeners.add(acceptCapturedSubtitle);
    listenerRegistered = true;
  }
  if (bridge.installed) return;
  bridge.installed = true;

  const notifyListeners = (
    url: string,
    text: string,
    json: unknown,
    requestContext: CaptureRequestContext,
  ) => {
    for (const listener of bridge.listeners) {
      try {
        listener(url, text, json, requestContext);
      } catch (error) {
        console.warn('[bilibili-bot] 字幕捕获监听器处理失败', error);
      }
    }
  };
  const subtitleUrlPattern = /subtitle/i;
  const originalFetch = captureWindow.fetch;
  if (typeof originalFetch === 'function') {
    captureWindow.fetch = async (...args: Parameters<typeof fetch>) => {
      const requestStartedAt = Date.now();
      const requestRouteKey = getBilibiliRouteKey(captureWindow.location.href);
      const response = await originalFetch.apply(captureWindow, args);
      try {
        const request = args[0];
        const url = typeof request === 'string'
          ? request
          : request instanceof URL
            ? request.href
            : request.url;
        if (subtitleUrlPattern.test(url)) {
          response.clone().text()
            .then((text) => notifyListeners(url, text, null, {
              routeKey: requestRouteKey,
              requestStartedAt,
            }))
            .catch((error) => console.warn('[bilibili-bot] 读取字幕 fetch 响应失败', error));
        }
      } catch (error) {
        console.warn('[bilibili-bot] 捕获字幕 fetch 失败', error);
      }
      return response;
    };
  }

  const XMLHttpRequestConstructor = captureWindow.XMLHttpRequest;
  if (XMLHttpRequestConstructor?.prototype) {
    const requestUrls = new WeakMap<XMLHttpRequest, string>();
    const originalOpen = XMLHttpRequestConstructor.prototype.open;
    const originalSend = XMLHttpRequestConstructor.prototype.send;

    XMLHttpRequestConstructor.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
      requestUrls.set(this, String(args[1] ?? ''));
      return Reflect.apply(originalOpen, this, args);
    } as typeof originalOpen;

    XMLHttpRequestConstructor.prototype.send = function (this: XMLHttpRequest, ...args: unknown[]) {
      const request = this;
      const url = requestUrls.get(request) ?? '';
      const requestContext: CaptureRequestContext = {
        routeKey: getBilibiliRouteKey(captureWindow.location.href),
        requestStartedAt: Date.now(),
      };
      if (subtitleUrlPattern.test(url)) {
        request.addEventListener('readystatechange', () => {
          if (request.readyState !== 4) return;
          try {
            if (request.responseType === 'json') {
              notifyListeners(url, '', request.response, requestContext);
              return;
            }
            if (request.responseType && request.responseType !== 'text') return;
            notifyListeners(url, request.responseText ?? '', null, requestContext);
          } catch (error) {
            console.warn('[bilibili-bot] 捕获字幕 XHR 失败', error);
          }
        });
      }
      return Reflect.apply(originalSend, this, args);
    } as typeof originalSend;
  }
}

export function clearRouteCaptureState(reason = '视频路由已经变化'): void {
  captureEntries.length = 0;
  const waiters = captureWaiters;
  captureWaiters = [];
  for (const waiter of waiters) waiter.reject(new StaleVideoContextError(reason));
}

export function waitForCapturedSubtitle(
  timeoutMs = 20_000,
  signal?: AbortSignal,
  minRequestStartedAt = 0,
  freshness?: RouteFreshness,
): Promise<CapturedSubtitleEntry> {
  installSubtitleCapture();
  throwIfAborted(signal);
  throwIfStale(freshness);

  const expectedRouteKey = freshness?.expectedRouteKey ?? getBilibiliRouteKey();
  let latest: CapturedSubtitleEntry | undefined;
  for (let index = captureEntries.length - 1; index >= 0; index -= 1) {
    const entry = captureEntries[index];
    if (
      entry.routeKey === expectedRouteKey
      && entry.requestStartedAt >= minRequestStartedAt
    ) {
      latest = entry;
      break;
    }
  }
  if (latest && Date.now() - latest.createdAt < 60_000) {
    return Promise.resolve(latest);
  }

  return new Promise((resolve, reject) => {
    let completed = false;
    const waiter: CaptureWaiter = {
      routeKey: expectedRouteKey,
      minRequestStartedAt,
      resolve: (entry) => finish(entry),
      reject: (error) => fail(error),
    };
    const timer = window.setTimeout(() => {
      fail(new Error('等待超时：请先点击播放器右下角的字幕按钮，并选择可用字幕'));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timer);
      captureWaiters = captureWaiters.filter((item) => item !== waiter);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (entry: CapturedSubtitleEntry) => {
      if (completed) return;
      try {
        throwIfStale(freshness);
      } catch (error) {
        fail(error instanceof Error ? error : new StaleVideoContextError());
        return;
      }
      completed = true;
      cleanup();
      resolve(entry);
    };
    const fail = (error: Error) => {
      if (completed) return;
      completed = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(createAbortError());

    captureWaiters.push(waiter);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort);
  });
}

function isUsablePlayerElement(element: HTMLElement | null): element is HTMLElement {
  return Boolean(element?.isConnected && document.contains(element));
}

export function clickBilibiliElement(element: HTMLElement | null): boolean {
  if (!isUsablePlayerElement(element)) return false;
  try {
    for (const type of ['mouseover', 'mouseenter', 'mousedown', 'mouseup', 'click']) {
      element.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
      }));
    }
    element.click();
    return true;
  } catch {
    return false;
  }
}

export function clickSubtitleToggleOnce(element: HTMLElement | null): boolean {
  if (!isUsablePlayerElement(element)) return false;
  try {
    for (const type of ['mouseover', 'mouseenter', 'mousedown', 'mouseup']) {
      element.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
      }));
    }
    element.click();
    return true;
  } catch {
    return false;
  }
}

export function getSubtitleToggleElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '.bpx-player-ctrl-subtitle,.bpx-player-ctrl-btn-subtitle',
  );
}

export function getSubtitleToggleState(toggle = getSubtitleToggleElement()): SubtitleToggleState {
  if (!isUsablePlayerElement(toggle)) return { state: 'unknown', toggle };

  const ariaPressed = String(toggle.getAttribute('aria-pressed') ?? '').toLowerCase();
  if (ariaPressed === 'true') return { state: 'on', toggle, source: 'aria-pressed' };
  if (ariaPressed === 'false') return { state: 'off', toggle, source: 'aria-pressed' };
  const ariaChecked = String(toggle.getAttribute('aria-checked') ?? '').toLowerCase();
  if (ariaChecked === 'true') return { state: 'on', toggle, source: 'aria-checked' };
  if (ariaChecked === 'false') return { state: 'off', toggle, source: 'aria-checked' };

  const classText = `${String(toggle.className)} ${String(toggle.getAttribute('data-state') ?? '')}`;
  if (/(^|\s|[-_])(active|on|enabled|show|selected)(\s|$|[-_])/i.test(classText)) {
    return { state: 'on', toggle, source: 'class' };
  }
  if (/(^|\s|[-_])(off|disabled|hide|hidden)(\s|$|[-_])/i.test(classText)) {
    return { state: 'off', toggle, source: 'class' };
  }

  const label = [
    toggle.getAttribute('title'),
    toggle.getAttribute('aria-label'),
    toggle.textContent,
  ].filter(Boolean).join(' ');
  if (/关闭.*字幕|隐藏.*字幕/.test(label)) return { state: 'on', toggle, source: 'label' };
  if (/打开.*字幕|显示.*字幕/.test(label)) return { state: 'off', toggle, source: 'label' };

  const subtitleLayer = document.querySelector<HTMLElement>(
    '.bpx-player-subtitle-wrap,.bpx-player-subtitle,.bpx-player-subtitle-panel',
  );
  if (subtitleLayer?.isConnected && subtitleLayer.textContent && subtitleLayer.getClientRects().length) {
    return { state: 'on', toggle, source: 'visible-layer' };
  }
  return { state: 'unknown', toggle };
}

export function waitForSubtitleCaptureControl(
  timeoutMs = SUBTITLE_CAPTURE_CONTROL_TIMEOUT_MS,
  signal?: AbortSignal,
  freshness?: RouteFreshness,
): Promise<HTMLElement | null> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let timer: number | null = null;
    const cleanup = () => {
      if (timer !== null) window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    const check = () => {
      try {
        throwIfStale(freshness);
      } catch (error) {
        cleanup();
        reject(error);
        return;
      }
      const toggle = getSubtitleToggleElement();
      if (toggle) {
        cleanup();
        resolve(toggle);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        cleanup();
        resolve(null);
        return;
      }
      timer = window.setTimeout(check, 50);
    };

    if (signal?.aborted) onAbort();
    else {
      signal?.addEventListener('abort', onAbort);
      check();
    }
  });
}

function pickSubtitleLanguageItem(): HTMLElement | null {
  const selectors = [
    '.bpx-player-ctrl-subtitle-language-item[data-lan="zh-CN"]',
    '.bpx-player-ctrl-subtitle-language-item[data-lan="ai-zh"]',
    '.bpx-player-ctrl-subtitle-language-item',
  ];
  for (const selector of selectors) {
    const item = document.querySelector<HTMLElement>(selector);
    if (item) return item;
  }
  return null;
}

export interface CaptureSessionScope extends RouteFreshness {
  generation: number;
  getGeneration: () => number;
  routeKey: string;
  getRouteKey: () => string;
}

export function isCaptureSessionCurrent(
  session: SubtitleCaptureSession,
  scope: CaptureSessionScope,
): boolean {
  return session.generation === scope.getGeneration()
    && session.routeKey === scope.getRouteKey()
    && scope.isCurrent?.() !== false
    && isUsablePlayerElement(session.toggle);
}

export async function triggerSubtitleForCapture(
  signal: AbortSignal,
  scope: CaptureSessionScope,
): Promise<{ triggered: boolean; session: SubtitleCaptureSession | null }> {
  const toggle = await waitForSubtitleCaptureControl(
    SUBTITLE_CAPTURE_CONTROL_TIMEOUT_MS,
    signal,
    scope,
  );
  if (!toggle) return { triggered: false, session: null };
  const before = getSubtitleToggleState(toggle);
  const session: SubtitleCaptureSession = {
    generation: scope.generation,
    routeKey: scope.routeKey,
    toggle,
    originalState: before.state,
    toggledByScript: false,
  };
  if (!isCaptureSessionCurrent(session, scope)) return { triggered: false, session };

  if (before.state === 'off') {
    session.toggledByScript = clickSubtitleToggleOnce(toggle);
    return { triggered: session.toggledByScript, session };
  }

  const languageItem = pickSubtitleLanguageItem();
  if (languageItem) {
    return { triggered: clickBilibiliElement(languageItem), session };
  }
  if (before.state === 'on' && clickSubtitleToggleOnce(toggle)) {
    await randomDelay(160, 160, signal);
    if (!isCaptureSessionCurrent(session, scope)) return { triggered: false, session };
    if (getSubtitleToggleState(toggle).state === 'off') {
      return { triggered: clickSubtitleToggleOnce(toggle), session };
    }
  }
  return {
    triggered: false,
    session,
  };
}

export function restoreSubtitleAfterCapture(
  session: SubtitleCaptureSession | null,
  scope: CaptureSessionScope,
): boolean {
  if (!session?.toggledByScript || !isCaptureSessionCurrent(session, scope)) return false;
  if (getSubtitleToggleState(session.toggle).state !== 'on') return false;
  const restored = clickSubtitleToggleOnce(session.toggle);
  if (restored) session.toggledByScript = false;
  return restored;
}

export function createCapturedSubtitleResult(entry: CapturedSubtitleEntry): {
  transcript: string;
  segments: SubtitleSegment[];
  source: 'capture';
} {
  return {
    transcript: entry.transcript,
    segments: entry.segments,
    source: 'capture',
  };
}
