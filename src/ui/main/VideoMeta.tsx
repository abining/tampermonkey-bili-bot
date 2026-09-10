import { useEffect, useRef } from 'react';
import type { VideoContext } from '../../contracts/video-context';
import { APP_ICONS, UiIcon } from '../icons';
import { formatDuration } from './presentation';

export interface VideoMetaProps {
  video: VideoContext | null;
}

export function VideoMeta({ video }: VideoMetaProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return undefined;

    const isolateDetailsScroll = (event: globalThis.WheelEvent) => {
      if (!details.open) return;
      const detailsContent = details.querySelector<HTMLElement>('.bvs-main-video-details');
      if (!detailsContent) return;

      const canScroll = detailsContent.scrollHeight > detailsContent.clientHeight;
      const atTop = detailsContent.scrollTop <= 0;
      const atBottom = detailsContent.scrollTop + detailsContent.clientHeight >= detailsContent.scrollHeight - 1;
      const scrollingPastBoundary = (event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom);
      if (!canScroll || scrollingPastBoundary) event.preventDefault();
      event.stopPropagation();
    };

    details.addEventListener('wheel', isolateDetailsScroll, { capture: true, passive: false });
    return () => details.removeEventListener('wheel', isolateDetailsScroll, true);
  }, [video]);

  if (!video) {
    return (
      <section className="bvs-main-video-meta is-empty">
        <span className="bvs-main-video-cover-placeholder"><UiIcon icon={APP_ICONS.logo} size={18} /></span>
        <div>
          <strong>等待识别当前视频</strong>
          <small>解析开始后会显示分集、UP主和视频信息。</small>
        </div>
      </section>
    );
  }

  const duration = formatDuration(video.duration);
  const collection = video.collectionTitle && video.collectionTitle !== video.title
    ? video.collectionTitle
    : '';

  return (
    <details ref={detailsRef} className="bvs-main-video-meta">
      <summary>
        <span className="bvs-main-video-cover-placeholder">P{video.page || 1}</span>
        <span className="bvs-main-video-title">
          <strong>{video.title || video.partTitle || '未知标题'}</strong>
          <small>
            {video.upName || '未知 UP主'}
            {duration ? ` · ${duration}` : ''}
            {video.bvid ? ` · ${video.bvid}` : ''}
          </small>
        </span>
        <span className="bvs-main-video-expand" aria-hidden="true">
          <UiIcon icon={APP_ICONS.expand} size={16} />
        </span>
      </summary>
      <div className="bvs-main-video-details">
        {collection ? (
          <div><span>课程/合集</span><strong>{collection}</strong></div>
        ) : null}
        {video.partTitle ? (
          <div><span>当前分集</span><strong>P{video.page || 1} · {video.partTitle}</strong></div>
        ) : null}
        {video.cid ? <div><span>CID</span><strong>{video.cid}</strong></div> : null}
        {video.description ? <p>{video.description}</p> : null}
        {video.pageUrl ? <code>{video.pageUrl}</code> : null}
      </div>
    </details>
  );
}
