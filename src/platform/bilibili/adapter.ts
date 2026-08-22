import type {
  SubtitleResult,
  VideoPlatformAdapter,
} from '../../contracts/runtime';
import type { VideoContext } from '../../contracts/video-context';
import {
  createCapturedSubtitleResult,
  clearRouteCaptureState,
  installSubtitleCapture,
  restoreSubtitleAfterCapture,
  SUBTITLE_CAPTURE_WAIT_TIMEOUT_MS,
  triggerSubtitleForCapture,
  waitForCapturedSubtitle,
  type CaptureSessionScope,
} from './subtitle-capture';
import {
  fetchSubtitleContent,
  fetchSubtitleDescriptorsResult,
  pickPreferredSubtitle,
} from './subtitle-api';
import { formatTranscript } from './subtitle-format';
import {
  isAbortError,
  isStaleVideoContextError,
  randomDelay,
  throwIfAborted,
  throwIfStale,
} from './shared';
import {
  createVideoContextFreshnessGuard,
  getBilibiliRouteKey,
  getCurrentVideoContext,
  getVideoContextKey,
} from './video-context';
import type {
  RouteFreshness,
  SubtitleCaptureSession,
  SubtitleDescriptorResult,
} from './types';

export interface BilibiliPlatformAdapterOptions {
  getRouteGeneration?: () => number;
  captureWaitTimeoutMs?: number;
  onSubtitleStatus?: (message: string) => void;
}

export class BilibiliPlatformAdapter implements VideoPlatformAdapter {
  private readonly getRouteGeneration: () => number;
  private readonly captureWaitTimeoutMs: number;
  private readonly subtitleCache = new Map<string, SubtitleResult>();

  constructor(private readonly options: BilibiliPlatformAdapterOptions = {}) {
    this.getRouteGeneration = options.getRouteGeneration ?? (() => 0);
    this.captureWaitTimeoutMs = options.captureWaitTimeoutMs
      ?? SUBTITLE_CAPTURE_WAIT_TIMEOUT_MS;
  }

  getCurrentContext(): VideoContext | null {
    return getCurrentVideoContext();
  }

  getRouteKey(): string {
    return getBilibiliRouteKey();
  }

  installSubtitleCapture(): void {
    installSubtitleCapture();
  }

  clearRouteCaptureState(): void {
    clearRouteCaptureState();
  }

  async fetchSubtitle(
    context: VideoContext,
    signal: AbortSignal,
  ): Promise<SubtitleResult | null> {
    const freshness = this.createFreshness(context);
    throwIfAborted(signal);
    throwIfStale(freshness);
    const contextKey = getVideoContextKey(context);
    const cached = this.subtitleCache.get(contextKey);
    if (cached) {
      this.options.onSubtitleStatus?.('已恢复当前分集字幕缓存');
      return cached;
    }

    const captured = await this.tryCaptureSubtitle(context, signal, freshness);
    if (captured) {
      this.cacheSubtitle(contextKey, captured);
      return captured;
    }
    const fetched = await this.fetchSubtitleWithRetry(context, signal, freshness);
    if (fetched) this.cacheSubtitle(contextKey, fetched);
    return fetched;
  }

  private cacheSubtitle(contextKey: string, subtitle: SubtitleResult): void {
    this.subtitleCache.delete(contextKey);
    this.subtitleCache.set(contextKey, subtitle);
    while (this.subtitleCache.size > 12) {
      const oldestKey = this.subtitleCache.keys().next().value;
      if (!oldestKey) break;
      this.subtitleCache.delete(oldestKey);
    }
  }

  private createFreshness(context: VideoContext): RouteFreshness {
    const expectedRouteKey = this.getRouteKey();
    const isContextCurrent = createVideoContextFreshnessGuard(context);
    return {
      expectedRouteKey,
      expectedContextKey: getVideoContextKey(context),
      isCurrent: () => this.getRouteKey() === expectedRouteKey && isContextCurrent(),
    };
  }

  private createCaptureScope(freshness: RouteFreshness): CaptureSessionScope {
    const generation = this.getRouteGeneration();
    const routeKey = freshness.expectedRouteKey ?? this.getRouteKey();
    return {
      ...freshness,
      generation,
      getGeneration: this.getRouteGeneration,
      routeKey,
      getRouteKey: () => this.getRouteKey(),
    };
  }

  private async tryCaptureSubtitle(
    context: VideoContext,
    signal: AbortSignal,
    freshness: RouteFreshness,
  ): Promise<SubtitleResult | null> {
    const scope = this.createCaptureScope(freshness);
    const captureStartedAt = Date.now();
    const capturePromise = waitForCapturedSubtitle(
      this.captureWaitTimeoutMs,
      signal,
      captureStartedAt,
      freshness,
    );
    void capturePromise.catch(() => undefined);
    let session: SubtitleCaptureSession | null = null;

    try {
      this.options.onSubtitleStatus?.('正在捕获播放器字幕...');
      const triggerResult = await triggerSubtitleForCapture(signal, scope);
      session = triggerResult.session;
      if (!triggerResult.triggered) throw new Error('未找到可安全触发的字幕控件');

      this.options.onSubtitleStatus?.('已触发播放器字幕，正在捕获...');
      const entry = await capturePromise;
      throwIfStale(freshness);
      restoreSubtitleAfterCapture(session, scope);
      return createCapturedSubtitleResult(entry);
    } catch (error) {
      if (isAbortError(error) || isStaleVideoContextError(error)) throw error;
      console.warn(
        `[bilibili-bot] ${context.bvid} P${context.page} 播放器字幕捕获未命中，回退接口`,
        error,
      );
      return null;
    } finally {
      restoreSubtitleAfterCapture(session, scope);
    }
  }

  private async resolveDescriptorResult(
    result: SubtitleDescriptorResult,
    signal: AbortSignal,
    freshness: RouteFreshness,
  ): Promise<SubtitleResult | null> {
    if (result.status !== 'available') return null;
    const descriptor = pickPreferredSubtitle(result.subtitles);
    if (!descriptor?.subtitle_url) return null;
    const segments = await fetchSubtitleContent(descriptor.subtitle_url, signal, freshness);
    const transcript = formatTranscript(segments);
    if (!segments.length || !transcript.trim()) return null;
    return { transcript, segments, source: 'api' };
  }

  private async fetchSubtitleWithRetry(
    context: VideoContext,
    signal: AbortSignal,
    freshness: RouteFreshness,
  ): Promise<SubtitleResult | null> {
    this.options.onSubtitleStatus?.('正在通过字幕接口获取...');
    const first = await fetchSubtitleDescriptorsResult(
      context.cid,
      context.bvid,
      signal,
      freshness,
    );
    const firstResolved = await this.resolveDescriptorResult(first, signal, freshness);
    if (firstResolved) return firstResolved;

    this.options.onSubtitleStatus?.(
      first.status === 'empty'
        ? '暂未发现字幕，正在二次确认...'
        : '字幕接口暂时失败，正在重试...',
    );
    await randomDelay(1_500, 1_500, signal);
    throwIfStale(freshness);

    const current = getCurrentVideoContext();
    const retryContext = current && getVideoContextKey(current) === getVideoContextKey(context)
      ? current
      : context;
    const retry = await fetchSubtitleDescriptorsResult(
      retryContext.cid,
      retryContext.bvid,
      signal,
      freshness,
    );
    const retryResolved = await this.resolveDescriptorResult(retry, signal, freshness);
    if (retryResolved) return retryResolved;
    if (retry.status === 'error') {
      throw new Error(`字幕接口请求失败：${retry.reason || first.reason || '请稍后重试'}`);
    }
    return null;
  }
}

export const bilibiliPlatformAdapter = new BilibiliPlatformAdapter();
