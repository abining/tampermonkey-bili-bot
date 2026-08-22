export const LEGACY_STORAGE_KEYS = {
  config: 'bili_summary_pro_config',
  positions: 'bili_summary_pro_positions',
  summaryCache: 'bili_summary_pro_summary_cache_v1',
} as const;

export const FLOW_STORAGE_KEYS = {
  promptJob: 'tabbit_flow_prompt_job_v1',
  heartbeat: 'tabbit_flow_receiver_heartbeat_v1',
} as const;

export const DOWNLOAD_DIRECTORY_DB = {
  database: 'tabbit_subtitle_download_v1',
  store: 'handles',
  key: 'subtitle-directory',
} as const;

export const LEGACY_SOURCE_BASELINE = {
  sha256: '92919b0033d4c9e417550f689997455f64e73be39b4c05c4691840ad40dd4b35',
  lines: 9658,
  bytes: 422659,
} as const;
