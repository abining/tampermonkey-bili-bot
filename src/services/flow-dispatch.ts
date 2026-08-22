import { GM_getValue, GM_openInTab, GM_setValue, unsafeWindow } from '$';

export const FLOW_PROMPT_JOB_KEY = 'tabbit_flow_prompt_job_v1';
export const FLOW_HEARTBEAT_KEY = 'tabbit_flow_receiver_heartbeat_v1';
export const FLOW_PROMPT_MESSAGE_TYPE = 'FLOW_PROMPT_SUBMIT';
export const FLOW_BROADCAST_CHANNEL = 'flow-prompt-bridge';
export const DEFAULT_FLOW_PROJECT_URL =
  'https://labs.google/fx/zh/tools/flow/project/0ad40d66-236b-42f3-a95f-dde090db0fae';
export const FLOW_HEARTBEAT_INTERVAL_MS = 10_000;
export const FLOW_HEARTBEAT_MAX_AGE_MS = 35_000;

export interface FlowPromptOptions {
  id?: string;
  waitMs?: number;
  [key: string]: unknown;
}

export interface FlowPromptJob {
  id: string;
  text: string;
  options: FlowPromptOptions;
  source?: string;
  title?: string;
  pageUrl?: string;
  createdAt?: number;
}

export interface FlowHeartbeat {
  url: string;
  ts: number;
}

export interface FlowDispatchOptions {
  flowUrl?: string;
  videoTitle?: string;
  pageUrl?: string;
  openWhenOffline?: boolean;
}

export interface FlowDispatchResult {
  job: FlowPromptJob;
  opened: boolean;
  flowUrl: string;
  receiverAlive: boolean;
}

export interface FlowPromptMessage {
  source: 'BiliSummaryFlowRelay';
  type: typeof FLOW_PROMPT_MESSAGE_TYPE;
  id: string;
  text: string;
  options: FlowPromptOptions;
}

export function parseFlowValue<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch (error) {
    console.warn('[省流助手-Flow] 解析任务失败:', error);
    return null;
  }
}

export function normalizeFlowUrl(url: unknown): string {
  return String(url ?? '').replace(/[?#].*$/, '').replace(/\/+$/, '');
}

export function getFlowReceiverHeartbeat(): FlowHeartbeat | null {
  return parseFlowValue<FlowHeartbeat>(GM_getValue(FLOW_HEARTBEAT_KEY, ''));
}

export function isFlowReceiverAlive(
  flowUrl: string,
  heartbeat = getFlowReceiverHeartbeat(),
  now = Date.now(),
): boolean {
  if (!heartbeat?.ts) return false;
  const age = now - Number(heartbeat.ts);
  if (!Number.isFinite(age) || age < 0 || age > FLOW_HEARTBEAT_MAX_AGE_MS) return false;
  const expected = normalizeFlowUrl(flowUrl);
  const actual = normalizeFlowUrl(heartbeat.url);
  return !expected || !actual || expected === actual;
}

export function openFlowProjectInBackground(flowUrl: string): boolean {
  if (!flowUrl) return false;
  try {
    const tab = GM_openInTab(flowUrl, { active: false, insert: true, setParent: true });
    if (tab) return true;
  } catch (error) {
    console.warn('[省流助手-Flow] GM_openInTab 后台打开失败:', error);
  }
  try {
    return Boolean(unsafeWindow.open(flowUrl, '_blank', 'noopener,noreferrer'));
  } catch {
    return false;
  }
}

export function createFlowPromptMessage(job: FlowPromptJob): FlowPromptMessage {
  return {
    source: 'BiliSummaryFlowRelay',
    type: FLOW_PROMPT_MESSAGE_TYPE,
    id: job.id || '',
    text: job.text,
    options: job.options || {},
  };
}

export function postFlowPromptJob(job: FlowPromptJob): void {
  if (!job?.text) return;
  const message = createFlowPromptMessage(job);
  unsafeWindow.postMessage(message, unsafeWindow.location.origin);
  if (!('BroadcastChannel' in unsafeWindow)) return;
  try {
    const channel = new BroadcastChannel(FLOW_BROADCAST_CHANNEL);
    channel.postMessage(message);
    setTimeout(() => channel.close(), 500);
  } catch (error) {
    console.warn('[省流助手-Flow] BroadcastChannel 转发失败:', error);
  }
}

export function sendPromptToFlow(
  imagePrompt: string,
  options: FlowDispatchOptions = {},
): FlowDispatchResult {
  if (!imagePrompt.trim()) throw new Error('没有可发送的生图提示词');

  const job: FlowPromptJob = {
    id: `flow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text: imagePrompt,
    options: {},
    source: 'bili-summary',
    title: options.videoTitle ?? '',
    pageUrl: options.pageUrl || unsafeWindow.location.href,
    createdAt: Date.now(),
  };
  job.options.id = job.id;
  GM_setValue(FLOW_PROMPT_JOB_KEY, JSON.stringify(job));

  const flowUrl = String(options.flowUrl || DEFAULT_FLOW_PROJECT_URL).trim();
  const receiverAlive = isFlowReceiverAlive(flowUrl);
  const opened = Boolean(
    flowUrl && !receiverAlive && options.openWhenOffline !== false && openFlowProjectInBackground(flowUrl),
  );
  return { job, opened, flowUrl, receiverAlive };
}
