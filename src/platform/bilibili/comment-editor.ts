import {
  createAbortError,
  throwIfStale,
} from './shared';
import type {
  CommentEditor,
  RouteFreshness,
} from './types';

type QueryRoot = Document | Element | ShadowRoot;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isUsableBiliElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.closest('#tabbit-ai-summary-panel, #tabbit-settings-overlay')) return false;
  if ('disabled' in element && Boolean(element.disabled)) return false;
  if (element.getAttribute('aria-disabled') === 'true') return false;
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

export function deepQuerySelectorAll(
  selector: string,
  root: QueryRoot = document,
): HTMLElement[] {
  const results = new Set<HTMLElement>();
  const visited = new Set<QueryRoot>();
  const walk = (node: QueryRoot) => {
    if (visited.has(node)) return;
    visited.add(node);
    if (node instanceof Element && node.matches(selector) && node instanceof HTMLElement) {
      results.add(node);
    }
    node.querySelectorAll(selector).forEach((item) => {
      if (item instanceof HTMLElement) results.add(item);
    });
    node.querySelectorAll('*').forEach((item) => {
      if (item.shadowRoot) walk(item.shadowRoot);
    });
    if (node instanceof Element && node.shadowRoot) walk(node.shadowRoot);
  };
  walk(root);
  return [...results];
}

export function getCommentAreaRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('bili-comment-box')
    ?? document.querySelector<HTMLElement>('#comment')
    ?? document.querySelector<HTMLElement>('.reply-box')
    ?? document.querySelector<HTMLElement>('.comment-container')
    ?? document.querySelector<HTMLElement>('[class*="comment"]');
}

export function isBiliCommentEditorCandidate(
  element: Element | null,
): element is CommentEditor {
  if (!isUsableBiliElement(element)) return false;
  const tag = element.tagName.toLowerCase();
  if (element.id === 'body' || tag === 'bili-comment-box' || tag === 'bili-comment-rich-textarea') {
    return false;
  }
  if (tag === 'textarea' || element.classList.contains('brt-editor')) return true;
  if (element.getAttribute('contenteditable') !== 'true') return false;
  const placeholder = element.getAttribute('placeholder')
    ?? element.getAttribute('aria-placeholder')
    ?? '';
  return Boolean(element.closest('.brt-root') || element.closest('#input') || /评论|回复/.test(placeholder));
}

function findBiliRichTextEditor(root: QueryRoot): CommentEditor | null {
  for (const host of deepQuerySelectorAll('bili-comment-rich-textarea', root)) {
    if (!host.shadowRoot) continue;
    const editor = deepQuerySelectorAll(
      '.brt-editor, [contenteditable="true"], textarea',
      host.shadowRoot,
    ).find(isBiliCommentEditorCandidate);
    if (editor) return editor;
  }
  return null;
}

export async function findBiliCommentEditor(
  options: RouteFreshness & { signal?: AbortSignal } = {},
): Promise<CommentEditor | null> {
  const root = getCommentAreaRoot();
  root?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const selectors = [
    '.brt-editor',
    '[contenteditable="true"].brt-editor',
    'textarea[placeholder*="评论"]',
    'textarea[placeholder*="回复"]',
    '#comment textarea',
    '.reply-box textarea',
    '.comment-send textarea',
    '#comment [contenteditable="true"]',
    '.reply-box [contenteditable="true"]',
    '.comment-send [contenteditable="true"]',
    '[contenteditable="true"][placeholder*="评论"]',
    '[contenteditable="true"][aria-placeholder*="评论"]',
  ];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    throwIfStale(options);
    if (options.signal?.aborted) throw createAbortError();
    const roots: QueryRoot[] = root ? [root, document] : [document];
    for (const searchRoot of roots) {
      const richEditor = findBiliRichTextEditor(searchRoot);
      if (richEditor) return richEditor;
      for (const selector of selectors) {
        const editor = deepQuerySelectorAll(selector, searchRoot).find(isBiliCommentEditorCandidate);
        if (editor) return editor;
      }
    }
    await sleep(250, options.signal);
  }
  return null;
}

function findBiliCommentHost(editor: CommentEditor): HTMLElement | null {
  let node: Node | null = editor;
  const visited = new Set<Node>();
  while (node && !visited.has(node)) {
    visited.add(node);
    if (node instanceof HTMLElement && node.tagName.toLowerCase() === 'bili-comment-box') {
      return node;
    }
    const root = node.getRootNode();
    if (root instanceof ShadowRoot && root.host !== node) {
      if (root.host.tagName.toLowerCase() === 'bili-comment-box') return root.host as HTMLElement;
      node = root.host;
    } else {
      node = node.parentNode;
    }
    if (node === document) break;
  }
  return document.querySelector<HTMLElement>('bili-comment-box');
}

function notifyBiliCommentInput(editor: CommentEditor, text: string): void {
  const host = findBiliCommentHost(editor);
  const root = editor.getRootNode();
  const richHost = root instanceof ShadowRoot
    && root.host.tagName.toLowerCase() === 'bili-comment-rich-textarea'
    ? root.host
    : null;
  const events = [
    new InputEvent('beforeinput', {
      bubbles: true,
      composed: true,
      cancelable: true,
      inputType: 'insertText',
      data: text,
    }),
    new InputEvent('input', {
      bubbles: true,
      composed: true,
      cancelable: true,
      inputType: 'insertText',
      data: text,
    }),
    new Event('change', { bubbles: true, composed: true }),
  ];
  for (const event of events) {
    editor.dispatchEvent(event);
    richHost?.dispatchEvent(new Event(event.type, { bubbles: true, composed: true }));
    host?.dispatchEvent(new Event(event.type, { bubbles: true, composed: true }));
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function setBiliCommentText(editor: CommentEditor, text: string): void {
  if (!isBiliCommentEditorCandidate(editor)) {
    throw new Error('找到的不是评论输入框，已停止写入，避免破坏评论区');
  }
  editor.focus();
  if ('value' in editor && typeof editor.value === 'string') {
    editor.value = text;
    notifyBiliCommentInput(editor, text);
    return;
  }

  try {
    editor.click();
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand('insertText', false, text);
  } catch {
    // execCommand 失败时由下面的安全 HTML 回退补入文本。
  }
  if ((editor.textContent ?? '').trim() !== text) editor.innerHTML = escapeHtml(text);
  editor.setAttribute('data-inputed', 'true');
  notifyBiliCommentInput(editor, text);
}

function getEditorRoots(editor: CommentEditor): QueryRoot[] {
  const host = findBiliCommentHost(editor);
  return [host?.shadowRoot, getCommentAreaRoot(), document]
    .filter((root): root is QueryRoot => Boolean(root));
}

export function findBiliCommentImageButton(editor: CommentEditor): HTMLElement | null {
  const selectors = [
    'button[title*="图片"]',
    'button[aria-label*="图片"]',
    'button[class*="image"]',
    'button[class*="pic"]',
    'button[class*="picture"]',
    'button[class*="upload"]',
    '[role="button"][title*="图片"]',
    '[role="button"][aria-label*="图片"]',
    '[role="button"][class*="image"]',
    '[role="button"][class*="pic"]',
    '[role="button"][class*="upload"]',
  ];
  const roots = getEditorRoots(editor);
  for (const root of roots) {
    for (const selector of selectors) {
      const button = deepQuerySelectorAll(selector, root).find(isUsableBiliElement);
      if (button) return button;
    }
  }

  for (const root of roots) {
    const toolButtons = deepQuerySelectorAll(
      '#footer button.tool-btn, button.tool-btn, #footer [role="button"], [class*="tool-btn"]',
      root,
    ).filter(isUsableBiliElement);
    const imageButton = toolButtons.find((button) => {
      const meta = [
        button.textContent,
        button.getAttribute('title'),
        button.getAttribute('aria-label'),
        String(button.className),
      ].join(' ');
      return !/表情|emoji|emote|at|mention|话题|投票|vote/i.test(meta)
        && /图片|image|pic|picture|upload|photo|image-upload/i.test(meta);
    });
    if (imageButton) return imageButton;

    const fallback = toolButtons.filter((button) => {
      const meta = `${button.textContent ?? ''} ${button.getAttribute('title') ?? ''} ${String(button.className)}`;
      return !/表情|emoji|emote|at|mention|话题|投票|vote/i.test(meta);
    });
    if (fallback.length) return fallback[fallback.length - 1];
  }

  for (const root of roots) {
    const fileInput = deepQuerySelectorAll('input[type="file"]', root).find((item) => {
      if (!(item instanceof HTMLInputElement)) return false;
      return /image|\.(png|jpe?g|webp|gif)/i.test(item.accept ?? '');
    });
    if (fileInput) return fileInput;
  }
  return null;
}

export function clickBiliCommentImageButton(editor: CommentEditor): boolean {
  const button = findBiliCommentImageButton(editor);
  if (!button) return false;
  try {
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'pointerup']) {
      button.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        composed: true,
        cancelable: true,
      }));
    }
    button.click();
    return true;
  } catch {
    return false;
  }
}

export function clickBiliCommentSubmitButton(editor: CommentEditor): boolean {
  const selectors = [
    '.comment-send button.submit-btn',
    '.comment-send button[aria-label*="发布"]',
    '.comment-send button[aria-label*="发送"]',
    'button.submit-btn',
    'button[aria-label*="发布"]',
    'button[aria-label*="发送"]',
    '#comment button.submit-btn',
    '.reply-box button.submit-btn',
  ];
  for (const root of getEditorRoots(editor)) {
    for (const selector of selectors) {
      const button = deepQuerySelectorAll(selector, root).find((item) => {
        if (!isUsableBiliElement(item)) return false;
        return /发布|发送|提交|send|submit/i.test(item.textContent?.trim() ?? '')
          || item.classList.contains('submit-btn');
      });
      if (button) {
        button.click();
        return true;
      }
    }

    const fallback = deepQuerySelectorAll('button, [role="button"]', root).find((item) => {
      if (!isUsableBiliElement(item)) return false;
      const text = item.textContent?.trim() ?? '';
      return text === '发布' || text === '发送';
    });
    if (fallback) {
      fallback.click();
      return true;
    }
  }
  return false;
}

export function markdownToCommentText(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/^---$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildCommentSummaryText(
  summaryText: string,
  options: { suffix?: string; maxLength?: number } = {},
): string {
  const suffix = options.suffix ?? '\n\n#B站省流助手';
  const maxLength = options.maxLength ?? 1_990;
  const maxContentLength = Math.max(0, maxLength - suffix.length);
  let content = markdownToCommentText(summaryText);
  if (content.length > maxContentLength) {
    content = `${content.slice(0, Math.max(0, maxContentLength - 4)).trim()}\n...`;
  }
  return `${content}${suffix}`;
}

export async function insertSummaryIntoComment(
  summaryText: string,
  options: RouteFreshness & {
    signal?: AbortSignal;
    autoSubmit?: boolean;
    suffix?: string;
    maxLength?: number;
  } = {},
): Promise<{ editor: CommentEditor; submitted: boolean }> {
  const editor = await findBiliCommentEditor(options);
  if (!editor) throw new Error('没找到评论输入框，请先滚到评论区或点一下评论框');
  throwIfStale(options);
  setBiliCommentText(editor, buildCommentSummaryText(summaryText, options));
  if (!options.autoSubmit) return { editor, submitted: false };
  await sleep(300, options.signal);
  throwIfStale(options);
  return { editor, submitted: clickBiliCommentSubmitButton(editor) };
}

export async function insertPresetAndOpenImageUpload(
  presets: string[],
  options: RouteFreshness & { signal?: AbortSignal } = {},
): Promise<{ editor: CommentEditor; uploadOpened: boolean }> {
  const editor = await findBiliCommentEditor(options);
  if (!editor) throw new Error('没找到评论输入框，请先滚到评论区或点一下评论框');
  const normalized = presets.map((item) => item.trim()).filter(Boolean);
  const text = normalized[Math.floor(Math.random() * normalized.length)] ?? '省流';
  setBiliCommentText(editor, text);
  return { editor, uploadOpened: clickBiliCommentImageButton(editor) };
}
