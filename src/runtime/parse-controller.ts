import type { SubtitleResult, SummaryRequest, SummaryService, VideoPlatformAdapter } from '../contracts/runtime';
import { createVideoContextKey, type VideoContext } from '../contracts/video-context';
import { parseUploadedSubtitle } from '../platform/bilibili';
import type { AppController } from './app-controller';

export interface SummarySettings {
  model: string;
  presetId: string;
  prompt: string;
  skipDuration: number;
}

export interface ParseControllerDependencies {
  app: AppController;
  platform: VideoPlatformAdapter;
  summaryService: SummaryService;
  getSummarySettings: () => SummarySettings;
  shouldAutoOpenPanel?: () => boolean;
  getCachedSummary?: (request: SummaryRequest) => string | null;
  setCachedSummary?: (request: SummaryRequest, summary: string) => void;
  onSubtitleReady?: (context: VideoContext, subtitle: SubtitleResult) => void | Promise<void>;
  onSummaryReady?: (context: VideoContext, summary: string) => void;
}

export class ParseController {
  private parsing = false;

  constructor(private readonly dependencies: ParseControllerDependencies) {}

  resetForRouteChange(): number {
    this.parsing = false;
    this.dependencies.platform.clearRouteCaptureState();
    return this.dependencies.app.beginRouteChange();
  }

  async start(options: { autoTriggered?: boolean } = {}): Promise<void> {
    if (this.parsing) return;
    this.parsing = true;

    const { app, platform } = this.dependencies;
    const generation = app.getSnapshot().routeGeneration;
    let context: VideoContext | null = null;

    try {
      app.update({
        phase: 'detecting',
        panelOpen: options.autoTriggered
          ? app.getSnapshot().panelOpen || Boolean(this.dependencies.shouldAutoOpenPanel?.())
          : true,
        errorMessage: '',
        summary: '',
      });

      context = await this.waitForCurrentContext(generation);
      if (!context?.bvid) throw new Error('无法读取当前 B站视频信息');

      const contextKey = createVideoContextKey(context);
      app.update({ video: context, contextKey });
      if (!this.isCurrent(generation, contextKey)) return;

      const settings = this.dependencies.getSummarySettings();
      if (context.duration > 0 && settings.skipDuration > 0 && context.duration < settings.skipDuration) {
        app.update({
          phase: 'no-subtitle',
          statusMessage: `当前分集短于 ${settings.skipDuration} 秒，已按设置跳过`,
        });
        return;
      }

      const task = app.createTaskController();
      app.update({ phase: 'fetching-subtitle' });
      const subtitle = await platform.fetchSubtitle(context, task.signal);
      if (!this.isCurrent(generation, contextKey)) return;
      if (!subtitle?.transcript.trim()) {
        app.update({
          phase: 'no-subtitle',
          statusMessage: `P${context.page} 未发现可用字幕，可上传或粘贴字幕继续处理`,
        });
        return;
      }
      await this.summarizeSubtitle(context, subtitle, settings, generation, task.signal);
    } catch (error) {
      this.handleError(error, generation, context ? createVideoContextKey(context) : undefined);
    } finally {
      this.parsing = false;
    }
  }

  async startWithManualSubtitle(rawText: string, filename = ''): Promise<void> {
    if (this.parsing) return;
    const parsed = parseUploadedSubtitle(rawText, filename);
    if (!parsed.transcript.trim()) throw new Error('没有读取到可用字幕内容');

    this.parsing = true;
    const { app, platform } = this.dependencies;
    const generation = app.getSnapshot().routeGeneration;
    let contextKey = '';
    try {
      const context = platform.getCurrentContext();
      if (!context?.bvid) throw new Error('无法读取当前 B站视频信息');
      contextKey = createVideoContextKey(context);
      app.update({
        phase: 'fetching-subtitle',
        panelOpen: true,
        manualSubtitleOpen: false,
        video: context,
        contextKey,
        summary: '',
        errorMessage: '',
        statusMessage: '正在处理手动字幕…',
      });
      const task = app.createTaskController();
      await this.summarizeSubtitle(
        context,
        { transcript: parsed.transcript, segments: parsed.segments, source: 'manual' },
        this.dependencies.getSummarySettings(),
        generation,
        task.signal,
      );
    } catch (error) {
      this.handleError(error, generation, contextKey || undefined);
      throw error;
    } finally {
      this.parsing = false;
    }
  }

  async regenerate(presetId?: string): Promise<void> {
    if (this.parsing) return;
    const snapshot = this.dependencies.app.getSnapshot();
    if (!snapshot.video || !snapshot.transcript.trim()) {
      await this.start({ autoTriggered: false });
      return;
    }

    this.parsing = true;
    const generation = snapshot.routeGeneration;
    const contextKey = snapshot.contextKey;
    try {
      const task = this.dependencies.app.createTaskController();
      const settings = this.dependencies.getSummarySettings();
      await this.summarizeSubtitle(
        snapshot.video,
        {
          transcript: snapshot.transcript,
          segments: snapshot.subtitleSegments,
          source: 'manual',
        },
        { ...settings, presetId: presetId || settings.presetId },
        generation,
        task.signal,
        true,
      );
    } catch (error) {
      this.handleError(error, generation, contextKey);
    } finally {
      this.parsing = false;
    }
  }

  private async summarizeSubtitle(
    context: VideoContext,
    subtitle: SubtitleResult,
    settings: SummarySettings,
    generation: number,
    signal: AbortSignal,
    ignoreCache = false,
  ): Promise<void> {
    const { app } = this.dependencies;
    const contextKey = createVideoContextKey(context);
    if (!this.isCurrent(generation, contextKey)) return;
    app.update({
      transcript: subtitle.transcript,
      subtitleSegments: subtitle.segments,
      statusMessage: subtitle.source === 'manual' ? '已使用手动字幕' : app.getSnapshot().statusMessage,
    });
    await this.dependencies.onSubtitleReady?.(context, subtitle);
    if (!this.isCurrent(generation, contextKey)) return;

    const request = this.createSummaryRequest(context, subtitle, settings);
    const cached = ignoreCache ? null : this.dependencies.getCachedSummary?.(request);
    if (cached) {
      app.update({
        phase: 'ready',
        summary: cached,
        activeResult: 'summary',
        statusMessage: '已恢复当前分集摘要缓存',
      });
      this.dependencies.onSummaryReady?.(context, cached);
      return;
    }

    app.update({ phase: 'summarizing', summary: '', activeResult: 'summary' });
    const summary = await this.dependencies.summaryService.summarize(request, {
      signal,
      onDelta: (text) => {
        if (this.isCurrent(generation, contextKey)) app.update({ summary: text });
      },
    });
    if (!this.isCurrent(generation, contextKey)) return;
    this.dependencies.setCachedSummary?.(request, summary);
    app.update({
      phase: 'ready',
      summary,
      statusMessage: '当前分集摘要已生成',
    });
    this.dependencies.onSummaryReady?.(context, summary);
  }

  private handleError(error: unknown, generation: number, contextKey?: string): void {
    if (!this.dependencies.app.isGenerationCurrent(generation, contextKey)) return;
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
      this.dependencies.app.update({ phase: 'interrupted' });
      return;
    }
    this.dependencies.app.update({
      phase: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  private isCurrent(generation: number, contextKey: string): boolean {
    const currentContext = this.dependencies.platform.getCurrentContext();
    if (!currentContext) return false;
    return this.dependencies.app.isGenerationCurrent(
      generation,
      createVideoContextKey(currentContext) === contextKey ? contextKey : '__stale__',
    );
  }

  private async waitForCurrentContext(
    generation: number,
    timeoutMs = 6_000,
  ): Promise<VideoContext | null> {
    const startedAt = Date.now();
    while (this.dependencies.app.isGenerationCurrent(generation)) {
      const context = this.dependencies.platform.getCurrentContext();
      if (context?.bvid && context.cid) return context;
      if (Date.now() - startedAt >= timeoutMs) return null;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
    }
    return null;
  }

  private createSummaryRequest(
    context: VideoContext,
    subtitle: SubtitleResult,
    settings: SummarySettings,
  ): SummaryRequest {
    return {
      context,
      transcript: subtitle.transcript,
      segments: subtitle.segments,
      model: settings.model,
      presetId: settings.presetId,
      prompt: settings.prompt,
    };
  }
}
