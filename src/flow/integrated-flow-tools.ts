import { GM_getValue, GM_setValue, unsafeWindow } from '$';
import {
  FLOW_BROADCAST_CHANNEL,
  FLOW_PROMPT_MESSAGE_TYPE,
  type FlowPromptMessage,
  type FlowPromptOptions,
} from '../services/flow-dispatch';
import type { FlowReceiverWidget } from './receiver-widget';

interface FlowBridgeWindow extends Window {
  FlowPromptBridge?: {
    submit(text: string, options?: FlowPromptOptions): void;
    send(text: string, options?: FlowPromptOptions): void;
  };
  FlowSubmitPrompt?: (text: string, options?: FlowPromptOptions) => void;
}

interface PromptQueueItem {
  text: string;
  options: FlowPromptOptions;
  createdAt: number;
}

export interface IntegratedFlowTools {
  acceptPromptMessage(data: unknown): void;
  destroy(): void;
}

const TOOL_CONFIG = {
  scanIntervalMs: 2000,
  menuOpenDelayMs: 650,
  submenuDelayMs: 650,
  afterClickDelayMs: 250,
  toastTimeoutMs: 45_000,
  retryLimit: 6,
  retryBaseDelayMs: 7000,
  qualityText: '2K',
  downloadText: '下载',
};

const HACK_ID = 'tabbit-integrated-flow-react-hack';

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeStringArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function storageId(): string {
  const project = location.pathname.match(/\/project\/([^/]+)/)?.[1] || 'default_project';
  return `tabbit_flow_downloaded_${project}`;
}

function injectReactHack(): void {
  if (document.getElementById(HACK_ID)) return;
  const script = document.createElement('script');
  script.id = HACK_ID;
  script.textContent = String.raw`
    (function () {
      if (window.__tabbit_flow_react_hack_installed) return;
      window.__tabbit_flow_react_hack_installed = true;
      var getProps = function (el) {
        if (!el) return null;
        var key = Object.keys(el).find(function (name) {
          return name.indexOf('__reactProps$') === 0 || name.indexOf('__reactEventHandlers$') === 0;
        });
        return key ? el[key] : null;
      };
      var trigger = function (el, eventName, eventData) {
        var current = el;
        while (current && current !== document.body) {
          var props = getProps(current);
          if (props && typeof props[eventName] === 'function') {
            try {
              props[eventName](Object.assign({
                preventDefault: function () {},
                stopPropagation: function () {},
                nativeEvent: { isTrusted: true },
                isTrusted: true
              }, eventData || {}));
              return true;
            } catch (_) {}
          }
          current = current.parentElement;
        }
        return false;
      };
      var tileSelector = function (tileId) {
        var escaped = String(tileId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return 'div[data-tile-id="' + escaped + '"]';
      };
      document.addEventListener('FMD_RightClick', function (event) {
        var root = document.querySelector(tileSelector(event.detail));
        var element = root && (root.querySelector('img') || root);
        if (!element) return;
        var rect = element.getBoundingClientRect();
        trigger(element, 'onContextMenu', {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          button: 2,
          buttons: 2
        });
      });
      document.addEventListener('FMD_ClickItem', function (event) {
        var keyword = event.detail;
        var items = Array.from(document.querySelectorAll('[role="menuitem"], button, [role="menuitemradio"], div[role="menuitem"]'));
        var target = items.find(function (element) {
          var rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && element.textContent && element.textContent.indexOf(keyword) !== -1;
        });
        if (!target) return;
        var eventData = { button: 0, pointerType: 'mouse', pointerId: 1 };
        trigger(target, 'onPointerDown', eventData);
        trigger(target, 'onPointerUp', eventData);
        trigger(target, 'onClick', eventData);
        target.click();
      });
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
}

export function setupIntegratedFlowTools(widget: FlowReceiverWidget): IntegratedFlowTools {
  const downloadedStorageKey = storageId();
  let downloadedIds = new Set(safeStringArray(GM_getValue(downloadedStorageKey, '[]')));
  let seenTileIds = new Set<string>();
  const pendingTileIds = new Set<string>();
  const retryCountById = new Map<string, number>();
  let queue: string[] = [];
  let observer: MutationObserver | undefined;
  let scanTimer: ReturnType<typeof setInterval> | undefined;
  let monitoring = false;
  let processing = false;
  const promptQueue: PromptQueueItem[] = [];
  let promptProcessing = false;
  let handledPromptJobIds = new Set<string>();
  let broadcastChannel: BroadcastChannel | undefined;

  const saveDownloadedIds = () => {
    GM_setValue(downloadedStorageKey, JSON.stringify([...downloadedIds]));
  };
  const updateCounts = () => {
    widget.setMonitorCount(
      `已记 ${downloadedIds.size} / 下载 ${queue.length + pendingTileIds.size} / 生图 ${promptQueue.length}`,
    );
  };
  const setStatus = (text: string) => {
    widget.setStatus(text);
    updateCounts();
  };
  const attrEscape = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const findTileById = (tileId: string) =>
    document.querySelector<HTMLElement>(`div[data-tile-id="${attrEscape(tileId)}"]`);
  const getReadyTileContainers = () =>
    Array.from(document.querySelectorAll<HTMLElement>('div[data-tile-id]')).filter((container) => {
      if (!container.dataset.tileId) return false;
      if (!container.querySelector('a[href*="/edit/"]')) return false;
      return !container.querySelector('a[href*="/collection/"]');
    });
  const getCurrentTileIds = () =>
    getReadyTileContainers()
      .map((container) => container.dataset.tileId || '')
      .filter(Boolean);
  const findMenuItem = (keyword: string) =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="menuitem"], button, [role="menuitemradio"], div[role="menuitem"]',
      ),
    ).find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && Boolean(element.textContent?.includes(keyword));
    });

  const closeVisibleToasts = async () => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('li[data-sonner-toast] button'),
    ).filter((button) => button.textContent?.includes('关闭'));
    for (const button of buttons) {
      button.click();
      await sleep(100);
    }
  };

  const waitForDownloadToast = async (): Promise<-1 | 0 | 1> => {
    let elapsed = 0;
    while (elapsed < TOOL_CONFIG.toastTimeoutMs && monitoring) {
      const toasts = Array.from(document.querySelectorAll<HTMLElement>('li[data-sonner-toast]'));
      for (const toast of toasts) {
        const text = toast.textContent || '';
        if (text.includes('失败') || text.toLowerCase().includes('error')) return -1;
        if (
          text.includes('已完成高清重塑') ||
          text.includes('已下载') ||
          text.includes('保存') ||
          text.includes('成功') ||
          text.toLowerCase().includes('download')
        ) {
          await closeVisibleToasts();
          return 1;
        }
      }
      await sleep(500);
      elapsed += 500;
    }
    return 0;
  };

  const markDownloaded = (tileId: string) => {
    downloadedIds.add(tileId);
    saveDownloadedIds();
    const tile = findTileById(tileId);
    if (tile && !tile.querySelector('.tabbit-flow-downloaded-mark')) {
      const mark = document.createElement('div');
      mark.className = 'tabbit-flow-downloaded-mark';
      mark.textContent = '已下';
      mark.style.cssText =
        'position:absolute;left:8px;bottom:8px;z-index:99999;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,.95);color:#fff;font-size:12px;font-weight:700;pointer-events:none;';
      tile.style.position = 'relative';
      tile.appendChild(mark);
    }
    updateCounts();
  };

  const downloadTile = async (tileId: string): Promise<{ ok: boolean; reason?: string }> => {
    if (downloadedIds.has(tileId)) return { ok: true };
    const tile = findTileById(tileId);
    const editLink = tile?.querySelector<HTMLAnchorElement>('a[href*="/edit/"]');
    if (!tile || !editLink) return { ok: false, reason: '图片卡片还没准备好' };
    try {
      editLink.scrollIntoView({ block: 'center', inline: 'center' });
      await sleep(550);
      await closeVisibleToasts();
      document.body.click();
      await sleep(200);
      document.dispatchEvent(new CustomEvent('FMD_RightClick', { detail: tileId }));
      await sleep(TOOL_CONFIG.menuOpenDelayMs);
      let qualityItem = findMenuItem(TOOL_CONFIG.qualityText);
      if (!qualityItem) {
        document.dispatchEvent(new CustomEvent('FMD_ClickItem', { detail: TOOL_CONFIG.downloadText }));
        await sleep(TOOL_CONFIG.submenuDelayMs);
        qualityItem = findMenuItem(TOOL_CONFIG.qualityText);
      }
      if (!qualityItem) {
        document.body.click();
        return { ok: false, reason: '下载菜单未出现' };
      }
      document.dispatchEvent(new CustomEvent('FMD_ClickItem', { detail: TOOL_CONFIG.qualityText }));
      await sleep(TOOL_CONFIG.afterClickDelayMs);
      document.body.click();
      const toastStatus = await waitForDownloadToast();
      if (toastStatus === -1) return { ok: false, reason: '页面提示下载失败' };
      markDownloaded(tileId);
      return { ok: true };
    } catch (error) {
      console.error('[省流助手-Flow] 下载异常:', error);
      return { ok: false, reason: error instanceof Error ? error.message : '下载异常' };
    }
  };

  const retryLater = (tileId: string, reason = '下载失败') => {
    const count = (retryCountById.get(tileId) || 0) + 1;
    retryCountById.set(tileId, count);
    if (count > TOOL_CONFIG.retryLimit) {
      console.warn(`[省流助手-Flow] 已放弃下载 ${tileId}: ${reason}`);
      setStatus('部分图片下载失败');
      return;
    }
    setTimeout(() => {
      if (monitoring && !downloadedIds.has(tileId)) enqueueTile(tileId, 'retry');
    }, TOOL_CONFIG.retryBaseDelayMs * count);
  };

  const processQueue = async () => {
    if (processing) return;
    processing = true;
    while (monitoring && queue.length) {
      const tileId = queue.shift();
      if (!tileId) continue;
      pendingTileIds.delete(tileId);
      updateCounts();
      if (downloadedIds.has(tileId)) continue;
      setStatus('下载中');
      const result = await downloadTile(tileId);
      if (!result.ok && monitoring) retryLater(tileId, result.reason);
      await sleep(900);
    }
    processing = false;
    if (monitoring) setStatus(queue.length ? '排队中' : '监控中');
  };

  function enqueueTile(tileId: string, source: string): void {
    if (!tileId || downloadedIds.has(tileId) || pendingTileIds.has(tileId)) return;
    pendingTileIds.add(tileId);
    queue.push(tileId);
    console.info('[省流助手-Flow] 下载队列:', tileId, source);
    setStatus('发现新图，准备下载');
    void processQueue();
  }

  const scanForNewTiles = () => {
    if (!monitoring) return;
    for (const tileId of getCurrentTileIds()) {
      if (seenTileIds.has(tileId)) continue;
      seenTileIds.add(tileId);
      enqueueTile(tileId, 'new');
    }
  };
  const enqueueCurrentTiles = () => {
    const ids = getCurrentTileIds();
    for (const tileId of ids) {
      seenTileIds.add(tileId);
      if (!downloadedIds.has(tileId)) enqueueTile(tileId, 'current');
    }
    setStatus(ids.length ? '当前图片已入队' : '未发现图片');
  };
  const startMonitoring = () => {
    if (monitoring || !document.body) return;
    monitoring = true;
    queue = [];
    pendingTileIds.clear();
    retryCountById.clear();
    seenTileIds = new Set(getCurrentTileIds());
    observer = new MutationObserver(scanForNewTiles);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tile-id', 'href', 'src'],
    });
    scanTimer = setInterval(scanForNewTiles, TOOL_CONFIG.scanIntervalMs);
    widget.controls.monitorToggleButton.textContent = '停止监控';
    widget.controls.monitorToggleButton.style.background = 'oklch(62% .18 28)';
    widget.controls.monitorToggleButton.style.color = 'oklch(98% .01 28)';
    widget.controls.downloadCurrentButton.disabled = false;
    widget.controls.downloadCurrentButton.style.opacity = '1';
    widget.controls.downloadCurrentButton.style.cursor = 'pointer';
    setStatus(`监控中，已忽略当前 ${seenTileIds.size} 张`);
  };
  const stopMonitoring = () => {
    monitoring = false;
    queue = [];
    pendingTileIds.clear();
    observer?.disconnect();
    observer = undefined;
    if (scanTimer) clearInterval(scanTimer);
    scanTimer = undefined;
    widget.controls.monitorToggleButton.textContent = '开启监控';
    widget.controls.monitorToggleButton.style.background = 'oklch(63% .14 155)';
    widget.controls.monitorToggleButton.style.color = 'oklch(15% .02 155)';
    widget.controls.downloadCurrentButton.disabled = true;
    widget.controls.downloadCurrentButton.style.opacity = '.55';
    widget.controls.downloadCurrentButton.style.cursor = 'default';
    setStatus('在线，等待生图任务');
  };
  const clearDownloadedMemory = () => {
    downloadedIds = new Set();
    saveDownloadedIds();
    document.querySelectorAll('.tabbit-flow-downloaded-mark').forEach((element) => element.remove());
    setStatus('下载记录已清空');
  };

  const findSubmitButton = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => {
      const icon = button.querySelector<HTMLElement>('i.google-symbols');
      const text = button.textContent || '';
      const submitLike = icon?.textContent?.trim() === 'arrow_forward' || text.includes('创建');
      return submitLike && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
    });

  const fillPromptText = async (text: string): Promise<{ ok: boolean; reason?: string }> => {
    const editor = document.querySelector<HTMLElement>('[data-slate-editor="true"]');
    if (!editor) return { ok: false, reason: '未找到 Flow 输入框' };
    try {
      editor.scrollIntoView({ block: 'center', inline: 'center' });
      await sleep(200);
      editor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      editor.focus();
      const selection = unsafeWindow.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection?.removeAllRanges();
      selection?.addRange(range);
      await sleep(50);
      const transfer = new DataTransfer();
      transfer.setData('text/plain', text);
      editor.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertFromPaste',
          dataTransfer: transfer,
          bubbles: true,
          cancelable: true,
        } as InputEventInit),
      );
      editor.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
      return { ok: true };
    } catch (error) {
      console.error('[省流助手-Flow] 填入失败:', error);
      return { ok: false, reason: error instanceof Error ? error.message : '填入失败' };
    }
  };

  const submitGeneration = async (): Promise<{ ok: boolean; reason?: string }> => {
    await sleep(600);
    document.dispatchEvent(new CustomEvent('FMD_ClickItem', { detail: '创建' }));
    document.dispatchEvent(new CustomEvent('FMD_ClickItem', { detail: 'arrow_forward' }));
    let button = findSubmitButton();
    let waited = 0;
    while (!button && waited < 4000) {
      await sleep(500);
      waited += 500;
      button = findSubmitButton();
    }
    if (!button) return { ok: false, reason: '未找到可点击的创建按钮' };
    button.click();
    return { ok: true };
  };
  const waitForGenerationReady = async (timeout: number) => {
    let elapsed = 0;
    while (elapsed < timeout) {
      if (findSubmitButton()) return true;
      await sleep(1000);
      elapsed += 1000;
    }
    return false;
  };
  const runPromptJob = async (job: PromptQueueItem): Promise<{ ok: boolean; reason?: string }> => {
    const text = job.text.trim();
    if (!text) return { ok: false, reason: '收到的文字为空' };
    setStatus('填词中');
    const filled = await fillPromptText(text);
    if (!filled.ok) return filled;
    setStatus('提交生图');
    const submitted = await submitGeneration();
    if (!submitted.ok) return submitted;
    setStatus('等待生图完成');
    await sleep(2000);
    await waitForGenerationReady(Number(job.options.waitMs) || 120_000);
    setStatus(monitoring ? '监控中' : '已提交生图');
    return { ok: true };
  };
  const processPromptQueue = async () => {
    if (promptProcessing) return;
    promptProcessing = true;
    while (promptQueue.length) {
      const job = promptQueue.shift();
      updateCounts();
      if (!job) continue;
      const result = await runPromptJob(job);
      if (!result.ok) {
        console.warn('[省流助手-Flow] 生图任务失败:', result.reason);
        setStatus(result.reason || '接口任务失败');
      }
      await sleep(800);
    }
    promptProcessing = false;
    if (monitoring) setStatus('监控中');
    updateCounts();
  };
  const enqueuePromptJob = (text: string, options: FlowPromptOptions = {}) => {
    promptQueue.push({ text, options, createdAt: Date.now() });
    setStatus('收到生图任务');
    updateCounts();
    void processPromptQueue();
  };
  const acceptPromptMessage = (data: unknown) => {
    if (!data || typeof data !== 'object') return;
    const message = data as Partial<FlowPromptMessage>;
    if (message.type !== FLOW_PROMPT_MESSAGE_TYPE || !message.text) return;
    if (message.id) {
      if (handledPromptJobIds.has(message.id)) return;
      handledPromptJobIds.add(message.id);
      if (handledPromptJobIds.size > 300) {
        handledPromptJobIds = new Set([...handledPromptJobIds].slice(-120));
      }
    }
    enqueuePromptJob(message.text, message.options || {});
  };

  const messageHandler = (event: MessageEvent) => {
    if (event.origin && event.origin !== unsafeWindow.location.origin) return;
    acceptPromptMessage(event.data);
  };
  unsafeWindow.addEventListener('message', messageHandler);
  if ('BroadcastChannel' in unsafeWindow) {
    broadcastChannel = new BroadcastChannel(FLOW_BROADCAST_CHANNEL);
    broadcastChannel.onmessage = (event) => acceptPromptMessage(event.data);
  }

  const flowWindow = unsafeWindow as unknown as FlowBridgeWindow;
  flowWindow.FlowPromptBridge = {
    submit: enqueuePromptJob,
    send: enqueuePromptJob,
  };
  flowWindow.FlowSubmitPrompt = enqueuePromptJob;

  const toggleHandler = () => (monitoring ? stopMonitoring() : startMonitoring());
  widget.controls.monitorToggleButton.addEventListener('click', toggleHandler);
  widget.controls.downloadCurrentButton.addEventListener('click', enqueueCurrentTiles);
  widget.controls.clearMemoryButton.addEventListener('click', clearDownloadedMemory);
  injectReactHack();
  updateCounts();

  return {
    acceptPromptMessage,
    destroy() {
      stopMonitoring();
      unsafeWindow.removeEventListener('message', messageHandler);
      broadcastChannel?.close();
      widget.controls.monitorToggleButton.removeEventListener('click', toggleHandler);
      widget.controls.downloadCurrentButton.removeEventListener('click', enqueueCurrentTiles);
      widget.controls.clearMemoryButton.removeEventListener('click', clearDownloadedMemory);
      delete flowWindow.FlowPromptBridge;
      delete flowWindow.FlowSubmitPrompt;
    },
  };
}
