import { FloatingButton } from './FloatingButton';
import { MainPanel } from './MainPanel';
import type { VideoSummarySurfaceProps } from './types';

export function VideoSummarySurface(props: VideoSummarySurfaceProps) {
  if (!props.snapshot.panelOpen) {
    return (
      <FloatingButton
        phase={props.snapshot.phase}
        title="bilibili 视频总结"
        statusMessage={props.snapshot.statusMessage || props.snapshot.errorMessage}
        position={props.floatingButtonPosition}
        onOpen={props.onOpen}
        onPositionChange={props.onFloatingButtonPositionChange}
        onPositionCommit={props.onFloatingButtonPositionCommit}
      />
    );
  }

  return (
    <MainPanel
      snapshot={props.snapshot}
      geometry={props.geometry}
      activeTab={props.activeTab}
      modelLabel={props.modelLabel}
      presetLabel={props.presetLabel}
      workspaceContent={props.workspaceContent}
      summaryContent={props.summaryContent}
      analysisContent={props.analysisContent}
      chatContent={props.chatContent}
      resultActions={props.resultActions}
      composer={props.composer}
      onClose={props.onClose}
      onOpenSettings={props.onOpenSettings}
      onStartParsing={props.onStartParsing}
      onAbort={props.onAbort}
      onRetrySubtitle={props.onRetrySubtitle}
      onManualFetchSubtitle={props.onManualFetchSubtitle}
      onUploadSubtitle={props.onUploadSubtitle}
      onPasteSubtitle={props.onPasteSubtitle}
      onTabChange={props.onTabChange}
      onGeometryChange={props.onGeometryChange}
      onGeometryCommit={props.onGeometryCommit}
    />
  );
}
