import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { APP_ICONS, UiIcon, type UiIconComponent } from '../icons';
import { ManualSubtitlePanel } from './ManualSubtitlePanel';
import { StatusCard } from './StatusCard';
import type {
  MainPanelProps,
  MainPanelTab,
  PanelGeometry,
} from './types';
import { VideoMeta } from './VideoMeta';

interface PanelInteraction {
  kind: 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  geometry: PanelGeometry;
}

const PANEL_MARGIN = 12;
const PANEL_MIN_WIDTH = 360;
const PANEL_MIN_HEIGHT = 360;
const PANEL_MAX_WIDTH = 520;

function getViewport(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 1366, height: 768 };
  return { width: window.innerWidth, height: window.innerHeight };
}

export function createDefaultPanelGeometry(): PanelGeometry {
  const viewport = getViewport();
  let width = viewport.width >= 1600 ? 480 : 448;
  let height = Math.min(700, Math.round(viewport.height * 0.82));
  if (viewport.width <= 900) width = Math.min(440, viewport.width - PANEL_MARGIN * 2);
  if (viewport.width <= 620) width = viewport.width - PANEL_MARGIN * 2;
  height = Math.min(height, viewport.height - PANEL_MARGIN * 2);
  return clampPanelGeometry({
    left: viewport.width - width - 20,
    top: Math.max(PANEL_MARGIN, Math.min(20, viewport.height - height - PANEL_MARGIN)),
    width,
    height,
  });
}

export function clampPanelGeometry(geometry: PanelGeometry): PanelGeometry {
  const viewport = getViewport();
  const maxWidth = Math.max(
    280,
    Math.min(PANEL_MAX_WIDTH, viewport.width - PANEL_MARGIN * 2),
  );
  const maxHeight = Math.max(320, viewport.height - PANEL_MARGIN * 2);
  const minWidth = Math.min(PANEL_MIN_WIDTH, maxWidth);
  const minHeight = Math.min(PANEL_MIN_HEIGHT, maxHeight);
  const width = Math.min(Math.max(geometry.width, minWidth), maxWidth);
  const height = Math.min(Math.max(geometry.height, minHeight), maxHeight);
  const left = Math.min(
    Math.max(geometry.left, PANEL_MARGIN),
    Math.max(PANEL_MARGIN, viewport.width - width - PANEL_MARGIN),
  );
  const top = Math.min(
    Math.max(geometry.top, PANEL_MARGIN),
    Math.max(PANEL_MARGIN, viewport.height - height - PANEL_MARGIN),
  );
  return { left, top, width, height };
}

function EmptyTab({
  icon,
  title,
  description,
}: {
  icon: UiIconComponent;
  title: string;
  description: string;
}) {
  return (
    <div className="bvs-main-tab-empty">
      <span aria-hidden="true"><UiIcon icon={icon} size={24} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function MainPanel({
  snapshot,
  geometry: geometryProp,
  activeTab: activeTabProp,
  workspaceContent,
  summaryContent,
  analysisContent,
  chatContent,
  resultActions,
  composer,
  onClose,
  onOpenSettings,
  onStartParsing,
  onAbort,
  onRetrySubtitle,
  onManualFetchSubtitle,
  onUploadSubtitle,
  onPasteSubtitle,
  onTabChange,
  onGeometryChange,
  onGeometryCommit,
}: MainPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const interactionRef = useRef<PanelInteraction | null>(null);
  const [geometry, setGeometry] = useState<PanelGeometry>(() => (
    clampPanelGeometry(geometryProp || createDefaultPanelGeometry())
  ));
  const [internalTab, setInternalTab] = useState<MainPanelTab>('summary');
  const [interactionKind, setInteractionKind] = useState<'move' | 'resize' | null>(null);
  const activeTab = activeTabProp || internalTab;
  const isManualState = snapshot.phase === 'no-subtitle'
    || snapshot.phase === 'interrupted'
    || snapshot.phase === 'error';
  const hasContent = Boolean(
    summaryContent
    || workspaceContent
    || analysisContent
    || chatContent
    || snapshot.summary
    || snapshot.phase === 'ready'
    || snapshot.phase === 'summarizing',
  );

  useEffect(() => {
    if (geometryProp) setGeometry(clampPanelGeometry(geometryProp));
  }, [
    geometryProp?.left,
    geometryProp?.top,
    geometryProp?.width,
    geometryProp?.height,
  ]);

  useEffect(() => {
    const handleResize = () => {
      setGeometry((current) => {
        const next = clampPanelGeometry(current);
        onGeometryChange?.(next);
        return next;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [onGeometryChange]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction || event.pointerId !== interaction.pointerId) return;
      const deltaX = event.clientX - interaction.startX;
      const deltaY = event.clientY - interaction.startY;
      const origin = interaction.geometry;
      const next = interaction.kind === 'move'
        ? clampPanelGeometry({
          ...origin,
          left: origin.left + deltaX,
          top: origin.top + deltaY,
        })
        : clampPanelGeometry({
          ...origin,
          width: origin.width + deltaX,
          height: origin.height + deltaY,
        });
      setGeometry(next);
      onGeometryChange?.(next);
      event.preventDefault();
    };

    const finishInteraction = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction || event.pointerId !== interaction.pointerId) return;
      interactionRef.current = null;
      setInteractionKind(null);
      setGeometry((current) => {
        onGeometryCommit?.(current);
        return current;
      });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', finishInteraction);
    window.addEventListener('pointercancel', finishInteraction);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishInteraction);
      window.removeEventListener('pointercancel', finishInteraction);
    };
  }, [onGeometryChange, onGeometryCommit]);

  const beginInteraction = (
    kind: 'move' | 'resize',
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (event.button !== 0) return;
    interactionRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      geometry,
    };
    setInteractionKind(kind);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const selectTab = (tab: MainPanelTab) => {
    if (activeTabProp === undefined) setInternalTab(tab);
    onTabChange?.(tab);
  };

  const style: CSSProperties = {
    left: `${geometry.left}px`,
    top: `${geometry.top}px`,
    width: `${geometry.width}px`,
    height: `${geometry.height}px`,
  };

  const renderTabContent = () => {
    if (activeTab === 'analysis') {
      return analysisContent || (
        <EmptyTab
          icon={APP_ICONS.analysis}
          title="还没有深度分析"
          description="摘要完成后，可在这里接入弹幕、评论和全面分析结果。"
        />
      );
    }
    if (activeTab === 'chat') {
      return chatContent || (
        <EmptyTab
          icon={APP_ICONS.chat}
          title="继续追问视频"
          description="对话服务接入后，可以基于当前分集字幕和分析结果继续提问。"
        />
      );
    }
    if (summaryContent) return summaryContent;
    if (snapshot.summary) {
      return <div className="bvs-main-summary-text">{snapshot.summary}</div>;
    }
    return (
      <EmptyTab
        icon={APP_ICONS.summary}
        title={snapshot.phase === 'summarizing' ? '摘要正在生成' : '还没有视频摘要'}
        description={snapshot.phase === 'summarizing'
          ? 'AI 返回内容后会在这里逐步显示。'
          : '点击开始解析，获取当前分集字幕并生成摘要。'}
      />
    );
  };

  return (
    <section
      ref={panelRef}
      className={`bvs-main-panel${interactionKind ? ` is-${interactionKind}` : ''}`}
      style={style}
      aria-label="bilibili 视频总结"
    >
      <header className="bvs-main-header">
        <div
          className="bvs-main-drag-region"
          onPointerDown={(event) => beginInteraction('move', event)}
          title="拖动面板"
        >
          <span className="bvs-main-brand"><UiIcon icon={APP_ICONS.logo} size={20} /></span>
          <span className="bvs-main-product-name">
            <strong>B站视频总结</strong>
            <small>
              {snapshot.video?.page ? `当前 P${snapshot.video.page}` : '当前视频'}
              {' · '}{snapshot.statusMessage || '等待处理'}
            </small>
          </span>
        </div>
        <div className="bvs-main-header-actions" onPointerDown={(event) => event.stopPropagation()}>
          <span className={`bvs-main-phase-dot is-${snapshot.phase}`} title={snapshot.statusMessage} />
          <button type="button" onClick={onOpenSettings} aria-label="打开设置" title="设置">
            <UiIcon icon={APP_ICONS.settings} size={17} />
          </button>
          <button type="button" onClick={onClose} aria-label="收起面板" title="收起">
            <UiIcon icon={APP_ICONS.collapse} size={17} />
          </button>
        </div>
      </header>

      <div className="bvs-main-body">
        <VideoMeta video={snapshot.video} />
        <StatusCard
          snapshot={snapshot}
          onStartParsing={onStartParsing}
          onAbort={onAbort}
          onRetrySubtitle={onRetrySubtitle}
        />

        {isManualState ? (
          <ManualSubtitlePanel
            onManualFetchSubtitle={onManualFetchSubtitle}
            onUploadSubtitle={onUploadSubtitle}
            onPasteSubtitle={onPasteSubtitle}
          />
        ) : null}

        {hasContent ? (
          <section className="bvs-main-workspace">
            {workspaceContent ? null : <nav className="bvs-main-tabs" aria-label="内容视图">
              <button
                type="button"
                className={activeTab === 'summary' ? 'is-active' : ''}
                onClick={() => selectTab('summary')}
              >
                摘要
                {snapshot.summary ? <i aria-hidden="true" /> : null}
              </button>
              <button
                type="button"
                className={activeTab === 'analysis' ? 'is-active' : ''}
                onClick={() => selectTab('analysis')}
              >
                深度分析
              </button>
              <button
                type="button"
                className={activeTab === 'chat' ? 'is-active' : ''}
                onClick={() => selectTab('chat')}
              >
                对话
              </button>
            </nav>}
            <div className="bvs-main-tab-content">
              {workspaceContent || renderTabContent()}
            </div>
          </section>
        ) : null}
      </div>

      {resultActions ? <div className="bvs-main-result-actions">{resultActions}</div> : null}

      {composer ? <footer className="bvs-main-footer">{composer}</footer> : null}

      <div
        className="bvs-main-resize-handle"
        onPointerDown={(event) => beginInteraction('resize', event)}
        role="separator"
        aria-label="调整面板大小"
        aria-orientation="horizontal"
      />
    </section>
  );
}
