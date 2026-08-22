import type { SubtitleSegment, VideoContext } from './video-context';

export type AppPhase =
  | 'idle'
  | 'detecting'
  | 'fetching-subtitle'
  | 'summarizing'
  | 'ready'
  | 'no-subtitle'
  | 'interrupted'
  | 'error';

export type AsyncResultStatus =
  | 'idle'
  | 'loading'
  | 'streaming'
  | 'ready'
  | 'interrupted'
  | 'error';

export type AnalysisKind = 'comments' | 'danmaku' | 'full';

export interface AnalysisResultSnapshot {
  status: AsyncResultStatus;
  text: string;
  rawText: string;
  statusMessage: string;
  errorMessage: string;
  itemCount: number;
  truncated: boolean;
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
}

export interface GeneratedImageSnapshot {
  status: AsyncResultStatus;
  imageUrl: string;
  prompt: string;
  statusMessage: string;
  errorMessage: string;
  mode: 'api' | 'flow';
}

export interface ActionFeedback {
  type: 'info' | 'success' | 'error';
  message: string;
  createdAt: number;
}

export function createEmptyAnalysisResult(): AnalysisResultSnapshot {
  return {
    status: 'idle',
    text: '',
    rawText: '',
    statusMessage: '',
    errorMessage: '',
    itemCount: 0,
    truncated: false,
  };
}

export function createEmptyGeneratedImage(): GeneratedImageSnapshot {
  return {
    status: 'idle',
    imageUrl: '',
    prompt: '',
    statusMessage: '',
    errorMessage: '',
    mode: 'api',
  };
}

export interface AppSnapshot {
  phase: AppPhase;
  routeGeneration: number;
  contextKey: string;
  video: VideoContext | null;
  transcript: string;
  subtitleSegments: SubtitleSegment[];
  summary: string;
  errorMessage: string;
  statusMessage: string;
  settingsOpen: boolean;
  panelOpen: boolean;
  manualSubtitleOpen: boolean;
  activeResult: 'summary' | AnalysisKind;
  analyses: Record<AnalysisKind, AnalysisResultSnapshot>;
  conversation: ConversationTurn[];
  generatedImage: GeneratedImageSnapshot;
  actionFeedback: ActionFeedback | null;
}

export const INITIAL_APP_SNAPSHOT: AppSnapshot = {
  phase: 'idle',
  routeGeneration: 0,
  contextKey: '',
  video: null,
  transcript: '',
  subtitleSegments: [],
  summary: '',
  errorMessage: '',
  statusMessage: '',
  settingsOpen: false,
  panelOpen: false,
  manualSubtitleOpen: false,
  activeResult: 'summary',
  analyses: {
    comments: createEmptyAnalysisResult(),
    danmaku: createEmptyAnalysisResult(),
    full: createEmptyAnalysisResult(),
  },
  conversation: [],
  generatedImage: createEmptyGeneratedImage(),
  actionFeedback: null,
};
