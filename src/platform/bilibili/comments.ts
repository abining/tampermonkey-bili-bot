import type { VideoContext } from '../../contracts/video-context';
import {
  BiliRiskControlError,
  createSafeBiliFetcher,
  isAbortError,
  randomDelay,
  retryWithBackoff,
  throwIfAborted,
  throwIfStale,
} from './shared';
import type {
  CommentFetchOptions,
  CommentItem,
} from './types';

const COMMENT_PAGE_SIZE = 20;
const COMMENT_SORT_TYPE = 2;
const COMMENT_MAX_RETRIES = 1;
const COMMENT_RETRY_BASE_DELAY_MS = 8_000;

interface BiliReply {
  member?: { uname?: string };
  content?: { message?: string };
  like?: number;
  replies?: BiliReply[];
}

interface CommentApiResponse {
  code?: number;
  message?: string;
  data?: { replies?: BiliReply[] };
}

export function getAid(context?: Pick<VideoContext, 'aid'> | null): string {
  if (context?.aid) return String(context.aid);
  try {
    for (const script of document.querySelectorAll('script')) {
      const aid = script.textContent?.match(/"aid"\s*:\s*(\d+)/)?.[1];
      if (aid) return aid;
    }
  } catch {
    return '';
  }
  return '';
}

async function fetchCommentPage(
  safeFetch: ReturnType<typeof createSafeBiliFetcher>,
  aid: string,
  page: number,
): Promise<{ replies?: BiliReply[] }> {
  const url = [
    'https://api.bilibili.com/x/v2/reply?type=1',
    `oid=${encodeURIComponent(aid)}`,
    `pn=${page}`,
    `ps=${COMMENT_PAGE_SIZE}`,
    `sort=${COMMENT_SORT_TYPE}`,
  ].join('&');
  const response = await safeFetch(url);
  if (!response.ok) throw new Error(`评论API请求失败: HTTP ${response.status}`);
  const data = await response.json() as CommentApiResponse;
  if (data.code === -352) throw new BiliRiskControlError('触发B站风控(-352)，请稍后重试');
  if (data.code === -401) throw new BiliRiskControlError('需要登录才能查看评论');
  if (data.code !== 0) {
    throw new Error(`评论API返回错误: code=${data.code}, message=${data.message ?? ''}`);
  }
  return data.data ?? {};
}

function appendReply(
  target: CommentItem[],
  reply: BiliReply,
  isReply: boolean,
): void {
  target.push({
    name: reply.member?.uname ?? '匿名',
    text: reply.content?.message ?? '',
    like: reply.like ?? 0,
    ...(isReply ? { isReply: true } : {}),
  });
}

export async function fetchAllComments(
  aid: string,
  signal: AbortSignal,
  options: CommentFetchOptions = {},
): Promise<CommentItem[]> {
  if (!aid) return [];
  const comments: CommentItem[] = [];
  const safeFetch = createSafeBiliFetcher(signal);
  const maxPages = options.maxPages ?? 8;
  const commentLimit = options.commentLimit ?? 188;
  const minDelayMs = options.minDelayMs ?? 1_800;
  const maxDelayMs = options.maxDelayMs ?? 3_800;
  const includeReplies = options.includeReplies ?? true;

  for (let page = 1; page <= maxPages; page += 1) {
    try {
      throwIfAborted(signal);
      throwIfStale(options);
      if (page > 1) await randomDelay(minDelayMs, maxDelayMs, signal);

      const result = await retryWithBackoff(
        () => fetchCommentPage(safeFetch, aid, page),
        COMMENT_MAX_RETRIES,
        COMMENT_RETRY_BASE_DELAY_MS,
        signal,
      );
      throwIfStale(options);
      const replies = result.replies ?? [];
      if (!replies.length) break;

      for (const reply of replies) {
        if (comments.length >= commentLimit) break;
        appendReply(comments, reply, false);
        if (!includeReplies) continue;
        for (const child of reply.replies ?? []) {
          if (comments.length >= commentLimit) break;
          appendReply(comments, child, true);
        }
      }

      options.onStatus?.(`已获取 ${comments.length} 条评论 (第${page}页)...`);
      if (replies.length < COMMENT_PAGE_SIZE || comments.length >= commentLimit) break;
    } catch (error) {
      if (isAbortError(error)) throw error;
      throwIfStale(options);
      console.warn(`[bilibili-bot] 获取第${page}页评论失败`, error);
      break;
    }
  }
  return comments;
}

export function formatCommentsText(comments: CommentItem[]): string {
  return comments.map((comment, index) => {
    const prefix = comment.isReply ? '  └' : '';
    return `${prefix}[${index + 1}] ${comment.name} (👍${comment.like}): ${comment.text}`;
  }).join('\n');
}

