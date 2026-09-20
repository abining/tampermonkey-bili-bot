import type { AppCommands } from '../contracts/app-commands';
import {
  INITIAL_APP_SNAPSHOT,
  type AnalysisKind,
  type AppSnapshot,
} from '../contracts/app-snapshot';

type Listener = () => void;

export interface AppCommandHandlers {
  startParsing?: (options?: { autoTriggered?: boolean }) => Promise<void>;
  parseManualSubtitle?: (rawText: string, filename?: string) => Promise<void>;
  regenerateSummary?: (presetId?: string) => Promise<void>;
  retrySubtitle?: () => Promise<void>;
  ask?: (question: string) => Promise<void>;
  runAnalysis?: (kind: AnalysisKind) => Promise<void>;
  copyText?: (text: string) => Promise<void>;
  copySummary?: () => Promise<void>;
  copyPortablePrompt?: () => Promise<void>;
  copyImagePrompt?: () => Promise<void>;
  sendTextToFlomo?: (text: string) => Promise<void>;
  sendSummaryToFlomo?: () => Promise<void>;
  downloadAnalysisRaw?: (kind: AnalysisKind) => Promise<void>;
  downloadTranscript?: () => Promise<void>;
  downloadSubtitleSrt?: () => Promise<void>;
  generateImage?: () => Promise<void>;
  saveGeneratedImage?: () => Promise<void>;
  insertSummaryIntoComment?: () => Promise<void>;
  insertSummaryIntoNote?: () => Promise<void>;
  fillGeneratedImageComment?: () => Promise<void>;
}

export class AppController implements AppCommands {
  private snapshot: AppSnapshot = INITIAL_APP_SNAPSHOT;
  private listeners = new Set<Listener>();
  private currentAbortController: AbortController | null = null;
  private commandHandlers: AppCommandHandlers = {};

  getSnapshot = (): AppSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(patch: Partial<AppSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  connectCommandHandlers(handlers: AppCommandHandlers): void {
    this.commandHandlers = { ...this.commandHandlers, ...handlers };
  }

  beginRouteChange(): number {
    this.abortCurrentTask();
    const routeGeneration = this.snapshot.routeGeneration + 1;
    const panelOpen = this.snapshot.panelOpen;
    this.update({
      ...INITIAL_APP_SNAPSHOT,
      routeGeneration,
      panelOpen,
    });
    return routeGeneration;
  }

  createTaskController(): AbortController {
    this.abortCurrentTask();
    this.currentAbortController = new AbortController();
    return this.currentAbortController;
  }

  isGenerationCurrent(generation: number, contextKey?: string): boolean {
    if (generation !== this.snapshot.routeGeneration) return false;
    if (contextKey && contextKey !== this.snapshot.contextKey) return false;
    return true;
  }

  async startParsing(options?: { autoTriggered?: boolean }): Promise<void> {
    if (this.commandHandlers.startParsing) {
      await this.commandHandlers.startParsing(options);
      return;
    }
    this.update({
      phase: 'detecting',
      panelOpen: true,
      errorMessage: '',
    });
  }

  async parseManualSubtitle(rawText: string, filename = ''): Promise<void> {
    if (!this.commandHandlers.parseManualSubtitle) {
      throw new Error('手动字幕服务尚未接入');
    }
    await this.commandHandlers.parseManualSubtitle(rawText, filename);
  }

  async regenerateSummary(presetId?: string): Promise<void> {
    if (!this.commandHandlers.regenerateSummary) {
      throw new Error('摘要重生成服务尚未接入');
    }
    await this.commandHandlers.regenerateSummary(presetId);
  }

  abortCurrentTask(): void {
    if (this.currentAbortController && !this.currentAbortController.signal.aborted) {
      this.currentAbortController.abort();
    }
    this.currentAbortController = null;
  }

  async retrySubtitle(): Promise<void> {
    if (this.commandHandlers.retrySubtitle) {
      await this.commandHandlers.retrySubtitle();
      return;
    }
    await this.startParsing({ autoTriggered: false });
  }

  async ask(question: string): Promise<void> {
    if (this.commandHandlers.ask) {
      await this.commandHandlers.ask(question);
      return;
    }
    throw new Error('AI 对话服务尚未接入');
  }

  async runAnalysis(kind: AnalysisKind): Promise<void> {
    if (!this.commandHandlers.runAnalysis) throw new Error('内容分析服务尚未接入');
    await this.commandHandlers.runAnalysis(kind);
  }

  async copyText(text: string): Promise<void> {
    if (!this.commandHandlers.copyText) throw new Error('复制服务尚未接入');
    await this.commandHandlers.copyText(text);
  }

  async copySummary(): Promise<void> {
    if (!this.commandHandlers.copySummary) throw new Error('复制服务尚未接入');
    await this.commandHandlers.copySummary();
  }

  async copyPortablePrompt(): Promise<void> {
    if (!this.commandHandlers.copyPortablePrompt) throw new Error('提示词复制服务尚未接入');
    await this.commandHandlers.copyPortablePrompt();
  }

  async copyImagePrompt(): Promise<void> {
    if (!this.commandHandlers.copyImagePrompt) throw new Error('复制服务尚未接入');
    await this.commandHandlers.copyImagePrompt();
  }

  async sendTextToFlomo(text: string): Promise<void> {
    if (!this.commandHandlers.sendTextToFlomo) throw new Error('Flomo 服务尚未接入');
    await this.commandHandlers.sendTextToFlomo(text);
  }

  async sendSummaryToFlomo(): Promise<void> {
    if (!this.commandHandlers.sendSummaryToFlomo) throw new Error('Flomo 服务尚未接入');
    await this.commandHandlers.sendSummaryToFlomo();
  }

  async downloadAnalysisRaw(kind: AnalysisKind): Promise<void> {
    if (!this.commandHandlers.downloadAnalysisRaw) throw new Error('分析原文导出服务尚未接入');
    await this.commandHandlers.downloadAnalysisRaw(kind);
  }

  async downloadTranscript(): Promise<void> {
    if (!this.commandHandlers.downloadTranscript) throw new Error('字幕下载服务尚未接入');
    await this.commandHandlers.downloadTranscript();
  }

  async downloadSubtitleSrt(): Promise<void> {
    if (!this.commandHandlers.downloadSubtitleSrt) throw new Error('SRT 下载服务尚未接入');
    await this.commandHandlers.downloadSubtitleSrt();
  }

  async generateImage(): Promise<void> {
    if (!this.commandHandlers.generateImage) throw new Error('生图服务尚未接入');
    await this.commandHandlers.generateImage();
  }

  async saveGeneratedImage(): Promise<void> {
    if (!this.commandHandlers.saveGeneratedImage) throw new Error('图片保存服务尚未接入');
    await this.commandHandlers.saveGeneratedImage();
  }

  async insertSummaryIntoComment(): Promise<void> {
    if (!this.commandHandlers.insertSummaryIntoComment) throw new Error('评论区写入服务尚未接入');
    await this.commandHandlers.insertSummaryIntoComment();
  }

  async insertSummaryIntoNote(): Promise<void> {
    if (!this.commandHandlers.insertSummaryIntoNote) throw new Error('笔记写入服务尚未接入');
    await this.commandHandlers.insertSummaryIntoNote();
  }

  async fillGeneratedImageComment(): Promise<void> {
    if (!this.commandHandlers.fillGeneratedImageComment) throw new Error('评论区图片服务尚未接入');
    await this.commandHandlers.fillGeneratedImageComment();
  }

  updateSummary(summary: string): void {
    const generatedImage = this.snapshot.generatedImage.imageUrl
      ? {
          ...this.snapshot.generatedImage,
          statusMessage: '摘要已修改，请重新生成配图',
        }
      : this.snapshot.generatedImage;
    this.update({ summary, generatedImage });
  }

  setPanelOpen(panelOpen: boolean): void {
    this.update({ panelOpen });
  }

  setSettingsOpen(settingsOpen: boolean): void {
    this.update({ settingsOpen });
  }

  setManualSubtitleOpen(manualSubtitleOpen: boolean): void {
    this.update({ manualSubtitleOpen });
  }

  setActiveResult(activeResult: 'summary' | AnalysisKind): void {
    this.update({ activeResult });
  }
}

export const appController = new AppController();
