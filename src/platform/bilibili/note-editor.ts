import {
  createAbortError,
  throwIfStale,
} from './shared';
import { deepQuerySelectorAll } from './comment-editor';
import type { RouteFreshness } from './types';

type NoteEditor = HTMLElement;

type QuillLike = {
  getLength?(): number;
  getSelection?(): { index: number; length: number } | null;
  setSelection?(index: number, length?: number, source?: string): void;
  focus?(): void;
  clipboard?: {
    dangerouslyPasteHTML(index: number, html: string, source?: string): void;
  };
};

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

function isVisible(element: HTMLElement): boolean {
  if (element.closest('#tabbit-ai-summary-panel, #tabbit-settings-overlay')) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

function clickElement(element: HTMLElement): void {
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'pointerup']) {
    element.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      composed: true,
      cancelable: true,
    }));
  }
  element.click();
}

function findVisible(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const element = deepQuerySelectorAll(selector).find(isVisible);
    if (element) return element;
  }
  return null;
}

function findNoteEditor(): NoteEditor | null {
  return findVisible([
    '.note-pc .note-editor .ql-editor[contenteditable="true"]',
    '.note-pc .ql-editor[contenteditable="true"]',
    '.note-editor .ql-editor[contenteditable="true"]',
    '.note-pc [contenteditable="true"][data-placeholder]',
    '.note-pc [contenteditable="true"]',
  ]);
}

async function openNoteEditor(options: RouteFreshness & { signal?: AbortSignal }): Promise<NoteEditor> {
  const existing = findNoteEditor();
  if (existing) return existing;

  const toolbarButton = findVisible([
    '.video-note-inner',
    '.toolbar-right-note',
    '[class*="video-note"][class*="toolbar"]',
  ]);
  if (!toolbarButton) throw new Error('没找到 B站“笔记”入口，请确认当前是支持笔记的视频页');
  clickElement(toolbarButton);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    throwIfStale(options);
    if (options.signal?.aborted) throw createAbortError();
    const editor = findNoteEditor();
    if (editor) return editor;
    const createButton = findVisible([
      '.note-pc .list-note-operation',
      '.note-container .list-note-operation',
      '.note-pc [class*="note-operation"]',
    ]);
    if (createButton) {
      clickElement(createButton);
      break;
    }
    await sleep(250, options.signal);
  }

  for (let attempt = 0; attempt < 24; attempt += 1) {
    throwIfStale(options);
    if (options.signal?.aborted) throw createAbortError();
    const editor = findNoteEditor();
    if (editor) return editor;
    await sleep(250, options.signal);
  }

  throw new Error('笔记面板已打开，但没找到可编辑正文；请先登录并确认浏览器支持 B站笔记');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g, '$1（$2）');
}

export function markdownToBilibiliNoteHtml(markdown: string): string {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];
  let codeLines: string[] | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${paragraph.map(renderInlineMarkdown).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listType || !listItems.length) return;
    blocks.push(`<${listType}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${listType}>`);
    listType = null;
    listItems = [];
  };
  const flushCode = () => {
    if (!codeLines) return;
    blocks.push(`<blockquote><code>${escapeHtml(codeLines.join('\n')).replace(/\n/g, '<br>')}</code></blockquote>`);
    codeLines = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^```/.test(line.trim())) {
      flushParagraph();
      flushList();
      if (codeLines) flushCode();
      else codeLines = [];
      continue;
    }
    if (codeLines) {
      codeLines.push(rawLine);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(3, heading[1].length);
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = unordered ? 'ul' : 'ol';
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((unordered || ordered)?.[1] || '');
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push('<p>————————</p>');
      continue;
    }

    if (listType) flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  flushCode();
  return blocks.join('') || '<p><br></p>';
}

function findQuill(editor: NoteEditor): QuillLike | null {
  let current: HTMLElement | null = editor;
  while (current) {
    const quill = (current as HTMLElement & { __quill?: QuillLike }).__quill;
    if (quill) return quill;
    if (current.classList.contains('note-editor')) break;
    current = current.parentElement;
  }
  return null;
}

function insertHtml(editor: NoteEditor, html: string): void {
  const quill = findQuill(editor);
  if (quill?.clipboard?.dangerouslyPasteHTML) {
    const length = Math.max(1, quill.getLength?.() || 1);
    const insertAt = Math.max(0, length - 1);
    const separator = insertAt > 0 ? '<p><br></p>' : '';
    quill.clipboard.dangerouslyPasteHTML(insertAt, `${separator}${html}`, 'user');
    quill.setSelection?.(Math.max(0, (quill.getLength?.() || length) - 1), 0, 'silent');
    quill.focus?.();
    return;
  }

  editor.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
  const separator = editor.textContent?.trim() ? '<p><br></p>' : '';
  if (!document.execCommand('insertHTML', false, `${separator}${html}`)) {
    editor.innerHTML += `${separator}${html}`;
  }
  editor.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    composed: true,
    inputType: 'insertFromPaste',
    data: null,
  }));
  editor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

export async function insertSummaryIntoNote(
  summaryText: string,
  options: RouteFreshness & { signal?: AbortSignal } = {},
): Promise<{ editor: NoteEditor }> {
  if (!summaryText.trim()) throw new Error('没有可插入笔记的摘要');
  const editor = await openNoteEditor(options);
  throwIfStale(options);
  insertHtml(editor, markdownToBilibiliNoteHtml(summaryText));
  editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return { editor };
}
