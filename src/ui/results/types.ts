export type ResultAsyncCallback = () => void | Promise<void>;

export type SummaryResultStatus =
  | 'idle'
  | 'loading'
  | 'streaming'
  | 'ready'
  | 'empty'
  | 'interrupted'
  | 'error';

export type ResultsView = 'summary' | 'comments' | 'danmaku' | 'full-analysis';

export type ResultsActionKey =
  | 'copy'
  | 'edit-summary'
  | 'regenerate'
  | 'insert-comment'
  | 'flomo'
  | 'download-txt'
  | 'download-srt'
  | 'generate-image'
  | 'copy-image-prompt'
  | 'save-image'
  | 'fill-image-comment';

export interface ResultPreset {
  id: string;
  name: string;
  icon?: string;
  prompt?: string;
}

export interface ResultsActionAvailability {
  disabled?: boolean;
  hidden?: boolean;
  loading?: boolean;
  label?: string;
  title?: string;
}

export type ResultsActionAvailabilityMap = Partial<
  Record<ResultsActionKey, ResultsActionAvailability>
>;

export interface ResultsPanelActions {
  onCopy?: ResultAsyncCallback;
  onEditSummary?: ResultAsyncCallback;
  onRegenerate?: ResultAsyncCallback;
  onInsertComment?: ResultAsyncCallback;
  onSendFlomo?: ResultAsyncCallback;
  onDownloadTranscript?: ResultAsyncCallback;
  onDownloadSrt?: ResultAsyncCallback;
  onGenerateImage?: ResultAsyncCallback;
  onCopyImagePrompt?: ResultAsyncCallback;
  onSaveImage?: ResultAsyncCallback;
  onFillImageComment?: ResultAsyncCallback;
}

export interface AnalysisResultState {
  status: SummaryResultStatus;
  content?: string;
  error?: string;
  statusMessage?: string;
}

export interface ResultsAnalysisState {
  comments?: AnalysisResultState;
  danmaku?: AnalysisResultState;
  fullAnalysis?: AnalysisResultState;
}

export interface ResultsAnalysisCallbacks {
  onRunComments?: ResultAsyncCallback;
  onRunDanmaku?: ResultAsyncCallback;
  onRunFullAnalysis?: ResultAsyncCallback;
  onCopyComments?: ResultAsyncCallback;
  onCopyDanmaku?: ResultAsyncCallback;
  onCopyFullAnalysis?: ResultAsyncCallback;
  onSendCommentsFlomo?: ResultAsyncCallback;
  onSendDanmakuFlomo?: ResultAsyncCallback;
  onSendFullAnalysisFlomo?: ResultAsyncCallback;
  onExportComments?: ResultAsyncCallback;
  onExportDanmaku?: ResultAsyncCallback;
  onExportFullAnalysis?: ResultAsyncCallback;
}

export type ConversationRole = 'user' | 'assistant' | 'system';

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  model?: string;
  streaming?: boolean;
  error?: boolean;
}

export interface ResultsConversationProps {
  messages?: ConversationMessage[];
  pending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onAsk?: (question: string) => void | Promise<void>;
  onAbort?: ResultAsyncCallback;
}

export interface ResultsPanelProps {
  summary: string;
  status: SummaryResultStatus;
  statusMessage?: string;
  error?: string;
  model?: string;
  presets?: ResultPreset[];
  activePresetId?: string;
  disabled?: boolean;
  actions?: ResultsPanelActions;
  actionAvailability?: ResultsActionAvailabilityMap;
  actionOrder?: ResultsActionKey[];
  analyses?: ResultsAnalysisState;
  analysisCallbacks?: ResultsAnalysisCallbacks;
  conversation?: ResultsConversationProps;
  imageUrl?: string;
  imageAlt?: string;
  imageStatusMessage?: string;
  imageError?: string;
  activeView?: ResultsView;
  defaultView?: ResultsView;
  onViewChange?: (view: ResultsView) => void;
  onPresetChange?: (presetId: string) => void | Promise<void>;
  onAbortSummary?: ResultAsyncCallback;
  onCopyPortablePrompt?: ResultAsyncCallback;
  emptyTitle?: string;
  emptyDescription?: string;
}
