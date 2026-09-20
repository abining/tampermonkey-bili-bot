import { cloneJson } from '../utils/json';
import {
  COMMENT_PROMPT_TEXT,
  DANMAKU_PROMPT_TEXT,
  DEFAULT_FULL_ANALYSIS_PRESETS,
  DEFAULT_SUMMARY_PRESETS,
  IMAGE_GENERATION_PROMPT_TEXT,
  SUMMARY_PROMPT_TEXT,
} from './presets';
import type {
  AppConfig,
  ResultActionButtonConfig,
  ResultActionButtonId,
} from './types';

export const DEFAULT_FLOW_PROJECT_URL = 'https://labs.google/fx/zh/tools/flow/project/0ad40d66-236b-42f3-a95f-dde090db0fae';

export const RESULT_ACTION_BUTTON_IDS: ResultActionButtonId[] = [
  'copy_summary',
  'edit_summary',
  'generate_image',
  'copy_image_prompt',
  'post_comment',
  'post_note',
  'send_flomo',
  'download_transcript',
  'download_srt',
  'save_image',
  'fill_image_comment',
];

export function getDefaultResultActionButtons(): ResultActionButtonConfig[] {
  return RESULT_ACTION_BUTTON_IDS.map((id) => ({ id, enabled: true }));
}

const DEFAULT_CONFIG_VALUE: AppConfig = {
  apiUrl: 'https://xxxx/v1',
  apiKey: 'sk-xxxx',
  model: 'deepseek-v4-flash',
  flomoApiUrl: '',
  flomoTags: '#B站省流助手 #视频摘要',
  modelList: [
    'claude-opus-4-6',
    'gemini-3-flash-preview',
    'gpt-5.4',
    'deepseek-v4-flash',
  ],
  apiProfiles: [],
  activeApiProfileId: 'api_profile_default',
  promptText: SUMMARY_PROMPT_TEXT,
  commentPromptText: COMMENT_PROMPT_TEXT,
  commentTextPresets: ['省流'],
  danmakuPromptText: DANMAKU_PROMPT_TEXT,
  fullAnalysisPromptText: DEFAULT_FULL_ANALYSIS_PRESETS[0].prompt,
  fullAnalysisPresets: DEFAULT_FULL_ANALYSIS_PRESETS,
  activeFullAnalysisPresetId: 'fullpreset_video_review',
  fullDataMaxChars: 64000,
  summaryMaxTokens: 4000,
  skipDuration: 60,
  autoParse: true,
  autoOpenPanelWhileProcessing: false,
  enableThinking: true,
  promptPresets: DEFAULT_SUMMARY_PRESETS,
  activePresetId: 'preset_default',
  enableImageGen: false,
  imageGenApiUrl: '',
  imageGenApiKey: '',
  imageGenModel: 'gemini-3.1-flash-image-preview',
  imageGenModelList: ['gemini-3.1-flash-image-preview'],
  imageGenSize: '1024x1024',
  enableImageAutoDownload: true,
  imageGenMode: 'api',
  flowProjectUrl: DEFAULT_FLOW_PROJECT_URL,
  enableFlowBackgroundOpen: true,
  imageGenPromptText: IMAGE_GENERATION_PROMPT_TEXT,
  commentMaxPages: 8,
  commentLimit: 188,
  commentMinDelay: 1800,
  commentMaxDelay: 3800,
  autoSubmitCommentSummary: false,
  enableAutoDownloadSubtitle: false,
  enableBackendSubtitle: false,
  backendSubtitleApiUrl: '',
  backendSubtitleApiKey: '',
  backendSubtitleSourceMode: 'video_id',
  backendSubtitleTimeoutSeconds: 900,
  backendSubtitlePollIntervalMs: 2_000,
  resultActionButtons: getDefaultResultActionButtons(),
};

export const DEFAULT_CONFIG: Readonly<AppConfig> = DEFAULT_CONFIG_VALUE;

export function createDefaultConfig(): AppConfig {
  return cloneJson(DEFAULT_CONFIG_VALUE);
}
