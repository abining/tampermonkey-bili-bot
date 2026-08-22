export interface FlowReceiverControls {
  monitorToggleButton: HTMLButtonElement;
  downloadCurrentButton: HTMLButtonElement;
  clearMemoryButton: HTMLButtonElement;
}

export interface FlowReceiverWidget {
  root: HTMLDivElement;
  controls: FlowReceiverControls;
  setStatus(text?: string): void;
  setLastJob(text?: string): void;
  beat(): void;
  setMonitorCount(text?: string): void;
  flashJob(text?: string): void;
  destroy(): void;
}

const WIDGET_ID = 'tabbit-flow-receiver-widget';
const COLLAPSED_KEY = 'tabbit_flow_receiver_collapsed';

export function createFlowReceiverWidget(): FlowReceiverWidget {
  document.getElementById(WIDGET_ID)?.remove();

  const root = document.createElement('div');
  root.id = WIDGET_ID;
  root.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:16px',
    'z-index:999999',
    'font-family:Arial,"Microsoft YaHei",sans-serif',
    'color:oklch(94% .01 160)',
    'line-height:1.35',
  ].join(';');

  const panel = document.createElement('div');
  panel.style.cssText = [
    'width:276px',
    'background:oklch(20% .018 165)',
    'border:1px solid oklch(42% .04 165)',
    'border-radius:8px',
    'box-shadow:0 14px 36px rgba(0,0,0,.34)',
    'overflow:hidden',
  ].join(';');

  const header = document.createElement('button');
  header.type = 'button';
  header.style.cssText = [
    'width:100%',
    'display:flex',
    'align-items:center',
    'gap:8px',
    'border:0',
    'background:oklch(23% .022 165)',
    'color:oklch(95% .01 165)',
    'padding:10px 12px',
    'cursor:pointer',
    'text-align:left',
  ].join(';');

  const dot = document.createElement('span');
  dot.style.cssText =
    'width:8px;height:8px;border-radius:999px;background:oklch(73% .16 155);box-shadow:0 0 0 3px oklch(73% .16 155 / .16);flex:0 0 auto;';

  const titleWrap = document.createElement('span');
  titleWrap.style.cssText = 'display:flex;flex-direction:column;gap:1px;min-width:0;flex:1;';
  const title = document.createElement('span');
  title.textContent = 'Flow 接收端';
  title.style.cssText = 'font-size:13px;font-weight:800;letter-spacing:0;';
  const subtitle = document.createElement('span');
  subtitle.textContent = '在线，等待生图任务';
  subtitle.style.cssText =
    'font-size:11px;color:oklch(78% .025 165);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  const toggleIcon = document.createElement('span');
  toggleIcon.textContent = '收起';
  toggleIcon.style.cssText = 'font-size:11px;color:oklch(76% .035 165);flex:0 0 auto;';
  titleWrap.append(title, subtitle);
  header.append(dot, titleWrap, toggleIcon);

  const body = document.createElement('div');
  body.style.cssText =
    'padding:10px 12px 12px;background:oklch(18% .014 165);display:flex;flex-direction:column;gap:8px;';
  const statusLine = document.createElement('div');
  statusLine.textContent = '接收 B站摘要，转发给 Flow 页面。';
  statusLine.style.cssText = 'font-size:12px;color:oklch(84% .018 165);';

  const meta = document.createElement('div');
  meta.style.cssText =
    'display:grid;grid-template-columns:56px 1fr;gap:5px 8px;font-size:11px;color:oklch(76% .024 165);';
  const lastJobLabel = document.createElement('span');
  lastJobLabel.textContent = '最近任务';
  const lastJob = document.createElement('b');
  lastJob.textContent = '暂无';
  lastJob.style.cssText =
    'color:oklch(91% .02 165);font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  const heartbeatLabel = document.createElement('span');
  heartbeatLabel.textContent = '心跳';
  const heartbeat = document.createElement('b');
  heartbeat.textContent = '刚刚';
  heartbeat.style.cssText = 'color:oklch(91% .02 165);font-weight:700;';
  meta.append(lastJobLabel, lastJob, heartbeatLabel, heartbeat);

  const monitorBox = document.createElement('div');
  monitorBox.style.cssText =
    'border-top:1px solid oklch(33% .026 165);padding-top:9px;display:flex;flex-direction:column;gap:8px;';
  const monitorTitle = document.createElement('div');
  monitorTitle.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:oklch(89% .016 165);font-weight:800;';
  const monitorTitleLabel = document.createElement('span');
  monitorTitleLabel.textContent = '新图监控下载';
  const monitorCount = document.createElement('span');
  monitorCount.textContent = '已记 0 / 下载 0 / 生图 0';
  monitorCount.style.cssText = 'font-size:11px;color:oklch(76% .024 165);font-weight:700;';
  monitorTitle.append(monitorTitleLabel, monitorCount);

  const monitorButtons = document.createElement('div');
  monitorButtons.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;';
  const buttonStyle = 'border:0;border-radius:6px;padding:7px 6px;font-size:12px;font-weight:800;cursor:pointer;';
  const monitorToggleButton = document.createElement('button');
  monitorToggleButton.type = 'button';
  monitorToggleButton.textContent = '开启监控';
  monitorToggleButton.style.cssText = `${buttonStyle}background:oklch(63% .14 155);color:oklch(15% .02 155);`;
  const downloadCurrentButton = document.createElement('button');
  downloadCurrentButton.type = 'button';
  downloadCurrentButton.textContent = '下载当前';
  downloadCurrentButton.disabled = true;
  downloadCurrentButton.style.cssText = `${buttonStyle}background:oklch(58% .12 250);color:oklch(97% .01 250);opacity:.55;cursor:default;`;
  const clearMemoryButton = document.createElement('button');
  clearMemoryButton.type = 'button';
  clearMemoryButton.textContent = '清记录';
  clearMemoryButton.style.cssText = `${buttonStyle}background:oklch(32% .025 165);color:oklch(91% .01 165);border:1px solid oklch(43% .04 165);`;
  monitorButtons.append(monitorToggleButton, downloadCurrentButton, clearMemoryButton);
  monitorBox.append(monitorTitle, monitorButtons);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;';
  const collapseButton = document.createElement('button');
  collapseButton.type = 'button';
  collapseButton.textContent = '最小化';
  collapseButton.style.cssText =
    'flex:1;border:1px solid oklch(43% .04 165);border-radius:6px;background:oklch(26% .02 165);color:oklch(94% .01 165);padding:7px 8px;font-size:12px;font-weight:700;cursor:pointer;';
  const readyState = document.createElement('span');
  readyState.textContent = '后台就绪';
  readyState.title = '这个标签页保持打开即可接收任务';
  readyState.style.cssText =
    'flex:1;border-radius:6px;background:oklch(63% .14 155);color:oklch(16% .02 155);padding:7px 8px;font-size:12px;font-weight:800;text-align:center;';
  actions.append(collapseButton, readyState);
  body.append(statusLine, meta, monitorBox, actions);

  const mini = document.createElement('button');
  mini.type = 'button';
  mini.style.cssText = [
    'display:none',
    'align-items:center',
    'gap:7px',
    'border:1px solid oklch(42% .04 165)',
    'border-radius:999px',
    'background:oklch(21% .018 165)',
    'color:oklch(94% .01 165)',
    'box-shadow:0 10px 30px rgba(0,0,0,.32)',
    'padding:8px 11px',
    'font-size:12px',
    'font-weight:800',
    'cursor:pointer',
  ].join(';');
  const miniDot = dot.cloneNode(true);
  const miniText = document.createElement('span');
  miniText.textContent = 'Flow 接收';
  mini.append(miniDot, miniText);

  panel.append(header, body);
  root.append(panel, mini);

  let collapsed = localStorage.getItem(COLLAPSED_KEY) !== 'false';
  const applyCollapsed = (value: boolean) => {
    collapsed = value;
    localStorage.setItem(COLLAPSED_KEY, collapsed ? 'true' : 'false');
    panel.style.display = collapsed ? 'none' : 'block';
    mini.style.display = collapsed ? 'inline-flex' : 'none';
    toggleIcon.textContent = collapsed ? '展开' : '收起';
  };
  header.addEventListener('click', () => applyCollapsed(true));
  collapseButton.addEventListener('click', () => applyCollapsed(true));
  mini.addEventListener('click', () => applyCollapsed(false));

  const mount = () => {
    if (!document.body || document.getElementById(WIDGET_ID)) return;
    document.body.appendChild(root);
    applyCollapsed(collapsed);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  }
  mount();

  const api: FlowReceiverWidget = {
    root,
    controls: { monitorToggleButton, downloadCurrentButton, clearMemoryButton },
    setStatus(text) {
      subtitle.textContent = text || '在线，等待生图任务';
      statusLine.textContent = text || '接收 B站摘要，转发给 Flow 页面。';
    },
    setLastJob(text) {
      lastJob.textContent = text || '暂无';
    },
    beat() {
      heartbeat.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    },
    setMonitorCount(text) {
      monitorCount.textContent = text || '已记 0 / 下载 0 / 生图 0';
    },
    flashJob(text) {
      api.setStatus('已转发 Flow 生图任务');
      api.setLastJob(text || '刚刚收到');
      mini.style.background = 'oklch(25% .04 155)';
      setTimeout(() => {
        mini.style.background = 'oklch(21% .018 165)';
      }, 1400);
      setTimeout(() => api.setStatus(), 2500);
    },
    destroy() {
      root.remove();
    },
  };
  return api;
}
