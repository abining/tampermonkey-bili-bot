export type ImageGenerationMode = 'api' | 'flow';

export type ResultActionButtonId =
  | 'copy_summary'
  | 'edit_summary'
  | 'generate_image'
  | 'copy_image_prompt'
  | 'post_comment'
  | 'send_flomo'
  | 'download_transcript'
  | 'download_srt'
  | 'save_image'
  | 'fill_image_comment';

export interface ResultActionButtonConfig {
  id: ResultActionButtonId;
  enabled: boolean;
}

export interface PromptPreset {
  id: string;
  name: string;
  icon: string;
  prompt: string;
}

export interface ApiProfile {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  model: string;
  modelList: string[];
}

export interface AppConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  flomoApiUrl: string;
  flomoTags: string;
  modelList: string[];
  apiProfiles: ApiProfile[];
  activeApiProfileId: string;
  promptText: string;
  commentPromptText: string;
  commentTextPresets: string[];
  danmakuPromptText: string;
  fullAnalysisPromptText: string;
  fullAnalysisPresets: PromptPreset[];
  activeFullAnalysisPresetId: string;
  fullDataMaxChars: number;
  summaryMaxTokens: number;
  skipDuration: number;
  autoParse: boolean;
  autoOpenPanelWhileProcessing: boolean;
  enableThinking: boolean;
  promptPresets: PromptPreset[];
  activePresetId: string;
  enableImageGen: boolean;
  imageGenApiUrl: string;
  imageGenApiKey: string;
  imageGenModel: string;
  imageGenSize: string;
  enableImageAutoDownload: boolean;
  imageGenMode: ImageGenerationMode;
  flowProjectUrl: string;
  enableFlowBackgroundOpen: boolean;
  imageGenPromptText: string;
  commentMaxPages: number;
  commentLimit: number;
  commentMinDelay: number;
  commentMaxDelay: number;
  autoSubmitCommentSummary: boolean;
  enableAutoDownloadSubtitle: boolean;
  resultActionButtons: ResultActionButtonConfig[];
}
