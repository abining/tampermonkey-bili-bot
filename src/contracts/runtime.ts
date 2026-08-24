import type { AppSnapshot } from './app-snapshot';
import type { SubtitleSegment, VideoContext } from './video-context';

export interface SubtitleResult {
  transcript: string;
  segments: SubtitleSegment[];
  source: 'capture' | 'api' | 'manual' | 'backend';
}

export interface VideoPlatformAdapter {
  getCurrentContext(): VideoContext | null;
  getRouteKey(): string;
  installSubtitleCapture(): void;
  clearRouteCaptureState(): void;
  fetchSubtitle(context: VideoContext, signal: AbortSignal): Promise<SubtitleResult | null>;
}

export interface SummaryRequest {
  context: VideoContext;
  transcript: string;
  segments: SubtitleSegment[];
  model: string;
  presetId: string;
  prompt: string;
}

export interface SummaryService {
  summarize(
    request: SummaryRequest,
    options: {
      signal: AbortSignal;
      onDelta?: (text: string) => void;
    },
  ): Promise<string>;
}

export interface RuntimeStore {
  getSnapshot(): AppSnapshot;
  update(patch: Partial<AppSnapshot>): void;
}
