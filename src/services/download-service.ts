import { unsafeWindow } from '$';

export type DownloadResult =
  | 'downloaded'
  | 'started'
  | 'cancelled'
  | 'needs-directory'
  | 'needs-interaction'
  | 'failed';

export interface DownloadOptions {
  useDirectory?: boolean;
  directorySubdirectory?: string;
  allowDirectoryPicker?: boolean;
  allowFilePicker?: boolean;
}

export interface SubtitleSegmentInput {
  from?: number;
  to?: number;
  start_time?: number;
  end_time?: number;
  start?: number;
  end?: number;
  st?: number;
  d?: number;
  content?: string;
  text?: string;
  sentence?: string;
  t?: string;
  c?: string;
}

export interface NormalizedSubtitleSegment {
  from: number;
  to: number;
  text: string;
}

export interface DownloadVideoInfo {
  title?: string;
  upName?: string;
  bvid?: string;
}

interface FileHandleLike {
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
}

interface DirectoryHandleLike {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  getFileHandle(name: string, options: { create: boolean }): Promise<FileHandleLike>;
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<DirectoryHandleLike>;
}

type PickerWindow = Window &
  typeof globalThis & {
    showDirectoryPicker?: (options: { id: string; mode: 'readwrite' }) => Promise<DirectoryHandleLike>;
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<FileHandleLike>;
  };

const DOWNLOAD_DIRECTORY_DB = 'tabbit_subtitle_download_v1';
const DOWNLOAD_DIRECTORY_STORE = 'handles';
const DOWNLOAD_DIRECTORY_KEY = 'subtitle-directory';

const pageWindow = unsafeWindow as PickerWindow;

export function sanitizeFilename(value: unknown): string {
  return String(value ?? '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSubtitleSegments(source: unknown): NormalizedSubtitleSegment[] {
  const sourceRecord = source && typeof source === 'object' ? (source as Record<string, unknown>) : undefined;
  const list = Array.isArray(source)
    ? source
    : sourceRecord && Array.isArray(sourceRecord.body)
      ? sourceRecord.body
      : [];
  const segments: NormalizedSubtitleSegment[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const segment = item as SubtitleSegmentInput;
    let from = Number(segment.from ?? segment.start_time ?? segment.start ?? segment.st);
    if (!Number.isFinite(from)) from = 0;
    let to = Number(segment.to ?? segment.end_time ?? segment.end);
    if (!Number.isFinite(to)) {
      const duration = Number(segment.d);
      to = from + (Number.isFinite(duration) && duration > 0 ? duration : 2);
    }
    if (to < from) to = from;
    const text = String(
      segment.content ?? segment.text ?? segment.sentence ?? segment.t ?? segment.c ?? '',
    )
      .replace(/\s+/g, ' ')
      .trim();
    if (text) segments.push({ from, to, text });
  }
  return segments.sort((left, right) => left.from - right.from || left.to - right.to);
}

function openDownloadDirectoryDb(): Promise<IDBDatabase | null> {
  if (!pageWindow.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = pageWindow.indexedDB.open(DOWNLOAD_DIRECTORY_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DOWNLOAD_DIRECTORY_STORE)) {
        request.result.createObjectStore(DOWNLOAD_DIRECTORY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadDownloadDirectoryHandle(): Promise<DirectoryHandleLike | null> {
  try {
    const db = await openDownloadDirectoryDb();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction(DOWNLOAD_DIRECTORY_STORE, 'readonly')
        .objectStore(DOWNLOAD_DIRECTORY_STORE)
        .get(DOWNLOAD_DIRECTORY_KEY);
      request.onsuccess = () => resolve((request.result as DirectoryHandleLike | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('[省流助手] 读取字幕保存目录失败:', error);
    return null;
  }
}

export async function saveDownloadDirectoryHandle(handle: DirectoryHandleLike): Promise<boolean> {
  try {
    const db = await openDownloadDirectoryDb();
    if (!db) return false;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(DOWNLOAD_DIRECTORY_STORE, 'readwrite');
      transaction.objectStore(DOWNLOAD_DIRECTORY_STORE).put(handle, DOWNLOAD_DIRECTORY_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    return true;
  } catch (error) {
    console.warn('[省流助手] 记住字幕保存目录失败:', error);
    return false;
  }
}

export async function clearDownloadDirectoryHandle(): Promise<boolean> {
  try {
    const db = await openDownloadDirectoryDb();
    if (!db) return false;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(DOWNLOAD_DIRECTORY_STORE, 'readwrite');
      transaction.objectStore(DOWNLOAD_DIRECTORY_STORE).delete(DOWNLOAD_DIRECTORY_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    return true;
  } catch (error) {
    console.warn('[省流助手] 清除失效字幕目录失败:', error);
    return false;
  }
}

async function getAvailableFilename(
  directoryHandle: DirectoryHandleLike,
  desiredName: string,
): Promise<string> {
  const match = String(desiredName || 'download').match(/^(.*?)(\.[^.]+)?$/);
  const base = match?.[1] || desiredName;
  const extension = match?.[2] || '';
  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? desiredName : `${base} (${index})${extension}`;
    try {
      await directoryHandle.getFileHandle(candidate, { create: false });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return candidate;
      throw error;
    }
  }
  return `${base} (${Date.now()})${extension}`;
}

async function writeToDirectory(
  directoryHandle: DirectoryHandleLike,
  blob: Blob,
  filename: string,
  subdirectory?: string,
): Promise<void> {
  const targetDirectory = subdirectory
    ? await directoryHandle.getDirectoryHandle(subdirectory, { create: true })
    : directoryHandle;
  const availableFilename = await getAvailableFilename(targetDirectory, filename);
  const fileHandle = await targetDirectory.getFileHandle(availableFilename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function triggerDownload(
  content: BlobPart,
  filename: string,
  mimeType: string,
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  const BlobConstructor = pageWindow.Blob || Blob;
  const blob = new BlobConstructor([content], { type: mimeType });

  if (options.useDirectory && pageWindow.showDirectoryPicker) {
    let directoryHandle = await loadDownloadDirectoryHandle();
    if (directoryHandle) {
      try {
        let permission = await directoryHandle.queryPermission({ mode: 'readwrite' });
        if (permission === 'prompt') permission = await directoryHandle.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') throw new DOMException('目录授权已失效', 'NotAllowedError');
        await writeToDirectory(directoryHandle, blob, filename, options.directorySubdirectory);
        return 'downloaded';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
        console.warn('[省流助手] 原字幕目录已失效，需要重新选择:', error);
        await clearDownloadDirectoryHandle();
        directoryHandle = null;
      }
    }
    if (options.allowDirectoryPicker === false && !directoryHandle) return 'needs-directory';
    try {
      directoryHandle = await pageWindow.showDirectoryPicker({
        id: 'tabbit-subtitle-downloads',
        mode: 'readwrite',
      });
      await saveDownloadDirectoryHandle(directoryHandle);
      await writeToDirectory(directoryHandle, blob, filename, options.directorySubdirectory);
      return 'downloaded';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      console.warn('[省流助手] 保存到已授权目录失败，改用单文件另存为:', error);
    }
  }

  if (options.allowFilePicker !== false && pageWindow.showSaveFilePicker) {
    try {
      const extension = String(filename || '').match(/(\.[^.]+)$/)?.[1] || '.txt';
      const plainMime = String(mimeType || 'application/octet-stream').split(';')[0];
      const handle = await pageWindow.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: `${extension.toUpperCase().slice(1)} 文件`,
            accept: { [plainMime]: [extension] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'downloaded';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      console.warn('[省流助手] 原生另存为失败，改用浏览器下载:', error);
    }
  }

  try {
    const url = pageWindow.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => pageWindow.URL.revokeObjectURL(url), 60_000);
    return 'started';
  } catch (error) {
    console.error('[省流助手] 下载失败:', error);
    return 'failed';
  }
}

function buildVideoFilename(video: DownloadVideoInfo, extension: string): string {
  const safeTitle = sanitizeFilename(video.title) || '未知标题';
  const safeUpName = sanitizeFilename(video.upName) || '未知UP主';
  return `${safeUpName}__${safeTitle}__${video.bvid || '未知BV号'}.${extension}`;
}

export async function downloadTranscript(
  text: string,
  video: DownloadVideoInfo,
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  return triggerDownload(text, buildVideoFilename(video, 'txt'), 'text/plain;charset=utf-8', {
    useDirectory: false,
    allowDirectoryPicker: false,
    allowFilePicker: false,
    ...options,
  });
}

export function toSrtTimestamp(secondsValue: unknown): string {
  const totalMs = Math.floor(Math.max(0, Number(secondsValue) || 0) * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

export function buildSrtContent(subtitles: unknown): string {
  return normalizeSubtitleSegments(subtitles)
    .map(
      (segment, index) =>
        `${index + 1}\n${toSrtTimestamp(segment.from)} --> ${toSrtTimestamp(segment.to)}\n${segment.text}`,
    )
    .join('\n\n');
}

export function hasStructuredSubtitleData(subtitles: unknown): boolean {
  return normalizeSubtitleSegments(subtitles).length > 0;
}

export async function downloadSubtitleSrt(
  subtitles: unknown,
  video: DownloadVideoInfo,
  options: DownloadOptions = {},
): Promise<DownloadResult | false> {
  const srt = buildSrtContent(subtitles);
  if (!srt) return false;
  return triggerDownload(srt, buildVideoFilename(video, 'srt'), 'text/plain;charset=utf-8', {
    useDirectory: false,
    allowDirectoryPicker: false,
    allowFilePicker: false,
    ...options,
  });
}

export async function downloadGeneratedImage(
  imageDataUrl: string,
  video: DownloadVideoInfo,
  suffix = '_总结',
  options: DownloadOptions = {},
): Promise<DownloadResult | false> {
  if (!imageDataUrl || imageDataUrl === 'ERROR') return false;
  const title = sanitizeFilename(video.title || '视频总结') || '视频总结';
  const match = String(imageDataUrl).match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match) return 'failed';
  const binary = match[2] ? pageWindow.atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return triggerDownload(bytes, `${title}${suffix}.png`, match[1] || 'image/png', {
    useDirectory: false,
    allowDirectoryPicker: false,
    allowFilePicker: false,
    ...options,
  });
}
