import {
  createVideoContextKey,
  type VideoContext,
} from '../../contracts/video-context';
import type { BiliInitialState } from './types';

type PageWindow = Window & typeof globalThis & {
  __INITIAL_STATE__?: BiliInitialState;
};

declare const unsafeWindow: PageWindow | undefined;

function getPageWindow(): PageWindow {
  return typeof unsafeWindow !== 'undefined'
    ? unsafeWindow
    : window as PageWindow;
}

export function cleanVideoDescription(text: unknown): string {
  return String(text ?? '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function getRequestedVideoPage(url = window.location.href): number {
  const page = Number.parseInt(new URL(url).searchParams.get('p') ?? '', 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function getVideoContextKey(
  context: Pick<VideoContext, 'bvid' | 'cid' | 'page'>,
): string {
  return createVideoContextKey(context);
}

export function getBilibiliRouteKey(url = window.location.href): string {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/\/video\/(BV\w+)/);
  if (match) return `${match[1]}::p=${getRequestedVideoPage(url)}`;
  return `${parsed.pathname}${parsed.search}`;
}

function pickDescriptionFromDom(): string {
  const selectors = [
    '.desc-info-text',
    '.basic-desc-info',
    '.video-desc-container .desc-info-text',
    '.video-desc .desc-info-text',
    '.video-desc .desc',
    '#v_desc .info',
  ];
  for (const selector of selectors) {
    const description = cleanVideoDescription(document.querySelector(selector)?.textContent);
    if (description) return description;
  }
  return '';
}

export function getCurrentVideoContext(): VideoContext | null {
  const page = getRequestedVideoPage();
  const url = new URL(window.location.href);
  const urlBvid = url.pathname.match(/\/video\/(BV\w+)/)?.[1] ?? '';
  let bvid = urlBvid;
  let cid = '';
  let aid = '';
  let title = '';
  let collectionTitle = '';
  let partTitle = '';
  let upName = '';
  let description = '';
  let duration = 0;
  let stateContextStale = false;

  try {
    const state = getPageWindow().__INITIAL_STATE__
      ?? (window as PageWindow).__INITIAL_STATE__;
    const videoData = state?.videoData;
    const stateBvid = String(videoData?.bvid ?? '');
    const stateMatchesUrl = !urlBvid || !stateBvid || stateBvid === urlBvid;
    stateContextStale = Boolean(urlBvid && stateBvid && !stateMatchesUrl);
    if (videoData && stateMatchesUrl) {
      bvid = urlBvid || stateBvid;
      aid = String(state?.aid ?? videoData.aid ?? '');
      collectionTitle = String(videoData.title ?? '');
      const pages = Array.isArray(videoData.pages) ? videoData.pages : [];
      const currentPage = pages.find((item) => Number(item?.page) === page)
        ?? (page === 1 && pages.length === 1 ? pages[0] : undefined);
      if (page > 1 && !currentPage) stateContextStale = true;

      const exactCid = currentPage?.cid ?? url.searchParams.get('cid');
      const singlePageFallbackCid = page === 1 && pages.length <= 1
        ? videoData.cid ?? pages[0]?.cid
        : undefined;
      cid = String(exactCid ?? singlePageFallbackCid ?? '');
      partTitle = String(currentPage?.part ?? '');
      title = pages.length > 1 && partTitle ? partTitle : collectionTitle;
      upName = String(videoData.owner?.name ?? '');
      description = cleanVideoDescription(videoData.desc);
      if (!description && Array.isArray(videoData.desc_v2)) {
        description = cleanVideoDescription(
          videoData.desc_v2
            .map((item) => item?.raw_text ?? '')
            .filter(Boolean)
            .join('\n'),
        );
      }
      duration = Number(currentPage?.duration ?? videoData.duration ?? 0) || 0;
    }
  } catch (error) {
    console.warn('[bilibili-bot] 无法从 __INITIAL_STATE__ 获取视频信息', error);
  }

  if (!aid) aid = url.searchParams.get('aid') ?? '';
  if (!cid) {
    const player = document.querySelector<HTMLIFrameElement>('iframe[src*="cid="]');
    const playerBvid = player?.src.match(/[?&]bvid=(BV\w+)/i)?.[1] ?? '';
    const playerMatchesUrl = !urlBvid || !playerBvid || playerBvid === urlBvid;
    const playerExplicitlyMatchesUrl = Boolean(urlBvid && playerBvid === urlBvid);
    cid = url.searchParams.get('cid')
      ?? (playerMatchesUrl && (!stateContextStale || playerExplicitlyMatchesUrl)
        ? player?.src.match(/[?&]cid=(\d+)/)?.[1]
        : '')
      ?? '';
  }
  if (!title) {
    title = document
      .querySelector<HTMLElement>('h1.video-title, h1.title, .video-title, [data-title]')
      ?.textContent
      ?.trim() ?? '';
  }
  if (!upName) {
    const upElement = document.querySelector<HTMLElement>(
      '.up-name, .username, a[href*="space.bilibili.com"]',
    );
    upName = upElement?.getAttribute('title') ?? upElement?.textContent?.trim() ?? '';
  }
  if (!description) description = pickDescriptionFromDom();
  if (!bvid || !cid) return null;

  return {
    bvid,
    cid,
    aid,
    page,
    title,
    collectionTitle,
    partTitle,
    upName,
    description,
    duration,
    pageUrl: window.location.href,
  };
}

export function isVideoContextCurrent(
  expected: Pick<VideoContext, 'bvid' | 'cid' | 'page'>,
): boolean {
  const current = getCurrentVideoContext();
  return current !== null && getVideoContextKey(current) === getVideoContextKey(expected);
}

export function createVideoContextFreshnessGuard(
  expected: Pick<VideoContext, 'bvid' | 'cid' | 'page'>,
): () => boolean {
  const expectedKey = getVideoContextKey(expected);
  return () => {
    const current = getCurrentVideoContext();
    return current !== null && getVideoContextKey(current) === expectedKey;
  };
}
