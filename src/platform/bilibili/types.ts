import type { SubtitleSegment } from '../../contracts/video-context';

export interface BiliVideoPage {
  page?: number;
  cid?: string | number;
  part?: string;
  duration?: number;
}

export interface BiliInitialState {
  aid?: string | number;
  videoData?: {
    aid?: string | number;
    bvid?: string;
    cid?: string | number;
    title?: string;
    desc?: string;
    desc_v2?: Array<{ raw_text?: string }>;
    duration?: number;
    pages?: BiliVideoPage[];
    owner?: { name?: string };
  };
}

export interface SubtitleDescriptor {
  lan?: string;
  lan_doc?: string;
  subtitle_url?: string;
}

export type SubtitleApiStatus = 'available' | 'empty' | 'error';

export interface SubtitleDescriptorResult {
  subtitles: SubtitleDescriptor[];
  status: SubtitleApiStatus;
  reason: string;
}

export interface CapturedSubtitleEntry {
  url: string;
  routeKey: string;
  requestStartedAt: number;
  segments: SubtitleSegment[];
  transcript: string;
  createdAt: number;
}

export interface SubtitleBlock extends SubtitleSegment {}

export interface SubtitleTimelineMeta {
  start: number;
  end: number;
  segmentCount: number;
  blockCount: number;
}

export interface SubtitleCaptureSession {
  generation: number;
  routeKey: string;
  toggle: HTMLElement;
  originalState: SubtitleToggleStateName;
  toggledByScript: boolean;
}

export type SubtitleToggleStateName = 'on' | 'off' | 'unknown';

export interface SubtitleToggleState {
  state: SubtitleToggleStateName;
  toggle: HTMLElement | null;
  source?: string;
}

export interface RouteFreshness {
  expectedRouteKey?: string;
  expectedContextKey?: string;
  isCurrent?: () => boolean;
}

export interface CommentItem {
  name: string;
  text: string;
  like: number;
  isReply?: boolean;
}

export interface CommentFetchOptions extends RouteFreshness {
  maxPages?: number;
  commentLimit?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  includeReplies?: boolean;
  onStatus?: (message: string) => void;
}

export interface DanmakuItem {
  time: number;
  text: string;
}

export interface DanmakuFetchOptions extends RouteFreshness {
  maxDanmaku?: number;
  onStatus?: (message: string) => void;
}

export type CommentEditor = HTMLElement | HTMLTextAreaElement;
