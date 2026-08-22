import { GM_addValueChangeListener, GM_getValue, GM_setValue, unsafeWindow } from '$';
import {
  FLOW_HEARTBEAT_INTERVAL_MS,
  FLOW_HEARTBEAT_KEY,
  FLOW_PROMPT_JOB_KEY,
  parseFlowValue,
  postFlowPromptJob,
  type FlowPromptJob,
} from '../services/flow-dispatch';
import { setupIntegratedFlowTools, type IntegratedFlowTools } from './integrated-flow-tools';
import { createFlowReceiverWidget, type FlowReceiverWidget } from './receiver-widget';

export class FlowRuntime {
  private started = false;
  private widget?: FlowReceiverWidget;
  private tools?: IntegratedFlowTools;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private lastJobId = '';

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    console.info('[省流助手-Flow] Flow 接收端已启动，等待 B站脚本发送生图提示词');

    this.widget = createFlowReceiverWidget();
    this.tools = setupIntegratedFlowTools(this.widget);
    GM_addValueChangeListener(FLOW_PROMPT_JOB_KEY, (_name, _oldValue, newValue, remote) => {
      if (remote) this.handleJob(newValue);
    });
    setTimeout(() => this.handleJob(GM_getValue(FLOW_PROMPT_JOB_KEY, '')), 1200);
    this.writeHeartbeat();
    this.heartbeatTimer = setInterval(() => this.writeHeartbeat(), FLOW_HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    this.tools?.destroy();
    this.widget?.destroy();
    this.tools = undefined;
    this.widget = undefined;
  }

  private handleJob(value: unknown): void {
    const job = parseFlowValue<FlowPromptJob>(value);
    if (!job?.text || job.id === this.lastJobId) return;
    this.lastJobId = job.id || String(Date.now());
    postFlowPromptJob(job);
    setTimeout(() => postFlowPromptJob(job), 1500);
    setTimeout(() => postFlowPromptJob(job), 4000);
    this.widget?.flashJob(job.title || job.id || '新任务');
  }

  private writeHeartbeat(): void {
    GM_setValue(
      FLOW_HEARTBEAT_KEY,
      JSON.stringify({ url: unsafeWindow.location.href, ts: Date.now() }),
    );
    this.widget?.beat();
  }
}
