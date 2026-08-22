import type { SubtitleSegment, VideoContext } from '../contracts/video-context';
import {
  alignTimeline,
  type CommentItem,
  type DanmakuItem,
} from '../platform/bilibili';

export interface FullAnalysisData {
  text: string;
  subtitleCount: number;
  danmakuCount: number;
  commentCount: number;
}

export function buildFullAnalysisData(
  video: VideoContext,
  subtitles: SubtitleSegment[],
  danmaku: DanmakuItem[],
  comments: CommentItem[],
  fallbackTranscript: string,
): FullAnalysisData {
  const lines = [
    '【视频信息】',
    `标题: ${video.title || ''}`,
  ];
  if (video.collectionTitle && video.collectionTitle !== video.title) {
    lines.push(`所属课程/合集: ${video.collectionTitle}`);
    lines.push(`当前分集: P${video.page || 1} ${video.partTitle || video.title || ''}`);
  }
  lines.push(`UP主: ${video.upName || ''}`);
  if (video.description) lines.push(`简介: ${video.description}`);
  lines.push(`链接: ${video.pageUrl || `https://www.bilibili.com/video/${video.bvid}`}`, '');

  if (subtitles.length) {
    const aligned = alignTimeline(subtitles, danmaku);
    lines.push(
      '【字幕 + 弹幕时间轴对齐】',
      `（字幕${subtitles.length}句，整理为${aligned.length}个时间块，弹幕${danmaku.length}条）`,
      '',
    );
    for (const segment of aligned) {
      lines.push(`[${segment.label}] ${segment.subtitle}`);
      for (const item of segment.danmaku) lines.push(`  💬 ${item}`);
    }
  } else if (fallbackTranscript.trim()) {
    lines.push('【字幕文本】', '（该字幕不含结构化时间轴，以下为纯文本）', '', fallbackTranscript.trim());
  } else if (danmaku.length) {
    lines.push('【字幕】', '（该视频无字幕）');
  }

  const uniqueDanmaku = [...new Set(
    danmaku
      .map((item) => item.text.trim())
      .filter((text) => text.length >= 4),
  )].sort((left, right) => right.length - left.length);
  if (uniqueDanmaku.length) {
    lines.push(
      '',
      `【弹幕精选 TOP50（按内容含量排序，共${danmaku.length}条弹幕，去重后${uniqueDanmaku.length}条）】`,
      ...uniqueDanmaku.slice(0, 50),
    );
  }

  if (comments.length) {
    lines.push('', `【评论区（${comments.length}条，按热度排序）】`);
    comments.forEach((comment, index) => {
      const prefix = comment.isReply ? '  └' : '';
      lines.push(`${prefix}[${index + 1}] ${comment.name} (👍${comment.like}): ${comment.text}`);
    });
  }

  return {
    text: lines.join('\n'),
    subtitleCount: subtitles.length,
    danmakuCount: danmaku.length,
    commentCount: comments.length,
  };
}
