import type { AnalysisKind } from './app-snapshot';

export interface AppCommands {
  startParsing(options?: { autoTriggered?: boolean }): Promise<void>;
  parseManualSubtitle(rawText: string, filename?: string): Promise<void>;
  regenerateSummary(presetId?: string): Promise<void>;
  abortCurrentTask(): void;
  retrySubtitle(): Promise<void>;
  ask(question: string): Promise<void>;
  runAnalysis(kind: AnalysisKind): Promise<void>;
  copyText(text: string): Promise<void>;
  copySummary(): Promise<void>;
  copyPortablePrompt(): Promise<void>;
  copyImagePrompt(): Promise<void>;
  sendTextToFlomo(text: string): Promise<void>;
  sendSummaryToFlomo(): Promise<void>;
  downloadAnalysisRaw(kind: AnalysisKind): Promise<void>;
  downloadTranscript(): Promise<void>;
  downloadSubtitleSrt(): Promise<void>;
  generateImage(): Promise<void>;
  saveGeneratedImage(): Promise<void>;
  insertSummaryIntoComment(): Promise<void>;
  insertSummaryIntoNote(): Promise<void>;
  fillGeneratedImageComment(): Promise<void>;
  updateSummary(summary: string): void;
  setPanelOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setManualSubtitleOpen(open: boolean): void;
  setActiveResult(result: 'summary' | AnalysisKind): void;
}
