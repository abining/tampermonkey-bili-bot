export interface VideoContext {
  bvid: string;
  cid: string;
  aid: string;
  page: number;
  title: string;
  collectionTitle: string;
  partTitle: string;
  upName: string;
  description: string;
  duration: number;
  pageUrl: string;
}

export interface SubtitleSegment {
  from: number;
  to: number;
  content: string;
}

export function createVideoContextKey(context: Pick<VideoContext, 'bvid' | 'cid' | 'page'>): string {
  return [context.bvid, context.cid, context.page].join('::');
}
