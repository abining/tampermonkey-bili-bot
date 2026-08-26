import { buildSummaryCacheKey, getCachedSummary, setCachedSummary } from '../cache';
import type { SummaryRequest } from '../contracts/runtime';
import { createVideoContextKey } from '../contracts/video-context';
import { BilibiliPlatformAdapter, buildAiTranscript } from '../platform/bilibili';
import { appController } from './app-controller';
import { configController } from './config-controller';
import { ParseController } from './parse-controller';
import { RouteController } from './route-controller';
import { RuntimeSummaryService } from './summary-adapter';
import { FeatureController } from './feature-controller';
import { downloadTranscript } from '../services';

const INIT_DELAY_MS = 2_000;

function getActivePrompt(): string {
  const config = configController.getSnapshot().config;
  return config.promptPresets.find((preset) => preset.id === config.activePresetId)?.prompt
    || config.promptText;
}

function createCacheKey(request: SummaryRequest): string {
  return buildSummaryCacheKey(
    request.context,
    request.model,
    request.presetId,
    request.prompt,
    buildAiTranscript(request.segments, request.transcript),
  );
}

export class BilibiliApplication {
  private started = false;
  private readonly platform = new BilibiliPlatformAdapter({
    getRouteGeneration: () => appController.getSnapshot().routeGeneration,
    onSubtitleStatus: (statusMessage) => appController.update({ statusMessage }),
    getBackendSubtitleConfig: () => {
      const config = configController.getSnapshot().config;
      return {
        enabled: config.enableBackendSubtitle,
        apiUrl: config.backendSubtitleApiUrl,
        apiKey: config.backendSubtitleApiKey,
        sourceMode: config.backendSubtitleSourceMode,
        timeoutSeconds: config.backendSubtitleTimeoutSeconds,
        pollIntervalMs: config.backendSubtitlePollIntervalMs,
      };
    },
  });
  private readonly featureController = new FeatureController(
    appController,
    configController,
    (contextKey) => {
      const current = this.platform.getCurrentContext();
      return Boolean(current && createVideoContextKey(current) === contextKey);
    },
  );
  private readonly parseController = new ParseController({
    app: appController,
    platform: this.platform,
    summaryService: new RuntimeSummaryService(configController),
    shouldAutoOpenPanel: () => configController.getSnapshot().config.autoOpenPanelWhileProcessing,
    getSummarySettings: () => {
      const config = configController.getSnapshot().config;
      return {
        model: config.model,
        presetId: config.activePresetId,
        prompt: getActivePrompt(),
        skipDuration: config.skipDuration,
      };
    },
    getCachedSummary: (request) => getCachedSummary(createCacheKey(request)),
    setCachedSummary: (request, summary) => {
      setCachedSummary(createCacheKey(request), {
        summary,
        model: request.model,
        presetId: request.presetId,
        title: request.context.title,
      });
    },
    onSubtitleReady: async (context, subtitle) => {
      const config = configController.getSnapshot().config;
      if (!config.enableAutoDownloadSubtitle) return;
      const result = await downloadTranscript(subtitle.transcript, context, {
        useDirectory: true,
        allowDirectoryPicker: false,
        allowFilePicker: false,
      });
      const current = this.platform.getCurrentContext();
      if (result === 'downloaded' && current && createVideoContextKey(current) === createVideoContextKey(context)) {
        appController.update({ statusMessage: '字幕已自动保存' });
      }
    },
    onSummaryReady: (context) => {
      if (!configController.getSnapshot().config.enableImageGen) return;
      const current = this.platform.getCurrentContext();
      if (!current || createVideoContextKey(current) !== createVideoContextKey(context)) return;
      void this.featureController.generateImage().catch(() => undefined);
    },
  });
  private readonly routeController = new RouteController({
    getRouteKey: () => this.platform.getRouteKey(),
    onRouteChange: () => {
      this.featureController.resetForRouteChange();
      this.parseController.resetForRouteChange();
      this.scheduleConfiguredStart(800);
    },
  });

  start(): void {
    if (this.started) return;
    this.started = true;
    this.platform.installSubtitleCapture();
    this.routeController.install();
    appController.connectCommandHandlers({
      startParsing: (options) => this.parseController.start(options),
      parseManualSubtitle: (rawText, filename) => this.parseController.startWithManualSubtitle(rawText, filename),
      regenerateSummary: async (presetId) => {
        if (presetId) {
          const config = configController.getSnapshot().config;
          const preset = config.promptPresets.find((item) => item.id === presetId);
          if (preset) {
            configController.update({
              activePresetId: preset.id,
              promptText: preset.prompt,
            });
            configController.save();
          }
        }
        await this.parseController.regenerate(presetId);
      },
      retrySubtitle: () => this.parseController.start({ autoTriggered: false }),
      ask: (question) => this.featureController.ask(question),
      runAnalysis: (kind) => this.featureController.runAnalysis(kind),
      copyText: (text) => this.featureController.copyTextContent(text),
      copySummary: () => this.featureController.copySummary(),
      copyPortablePrompt: () => this.featureController.copyPortablePrompt(),
      copyImagePrompt: () => this.featureController.copyImagePrompt(),
      sendTextToFlomo: (text) => this.featureController.sendTextToFlomo(text),
      sendSummaryToFlomo: () => this.featureController.sendSummaryToFlomo(),
      downloadAnalysisRaw: (kind) => this.featureController.downloadAnalysisRaw(kind),
      downloadTranscript: () => this.featureController.downloadTranscript(),
      downloadSubtitleSrt: () => this.featureController.downloadSubtitleSrt(),
      generateImage: () => this.featureController.generateImage(),
      saveGeneratedImage: () => this.featureController.saveGeneratedImage(),
      insertSummaryIntoComment: () => this.featureController.insertSummaryIntoComment(),
      fillGeneratedImageComment: () => this.featureController.fillGeneratedImageComment(),
    });
    this.scheduleConfiguredStart(INIT_DELAY_MS);
  }

  private scheduleConfiguredStart(delayMs: number): void {
    const config = configController.getSnapshot().config;
    if (!config.autoParse) return;
    window.setTimeout(() => {
      void this.parseController.start({ autoTriggered: true });
    }, delayMs);
  }
}

export const bilibiliApplication = new BilibiliApplication();
