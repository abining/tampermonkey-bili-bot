import type { ReactNode } from 'react';
import type { AppPhase, AppSnapshot } from '../../contracts/app-snapshot';

export interface PanelGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FloatingButtonPosition {
  left: number;
  top: number;
}

export type MainPanelTab = 'summary' | 'analysis' | 'chat';

export interface MainPanelCallbacks {
  onOpen(): void;
  onClose(): void;
  onOpenSettings(): void;
  onStartParsing(): void | Promise<void>;
  onAbort(): void;
  onRetrySubtitle(): void | Promise<void>;
  onManualFetchSubtitle(): void | Promise<void>;
  onUploadSubtitle(): void | Promise<void>;
  onPasteSubtitle(): void | Promise<void>;
}

export interface MainPanelProps extends Omit<MainPanelCallbacks, 'onOpen'> {
  snapshot: AppSnapshot;
  geometry?: PanelGeometry;
  activeTab?: MainPanelTab;
  modelLabel?: string;
  presetLabel?: string;
  workspaceContent?: ReactNode;
  summaryContent?: ReactNode;
  analysisContent?: ReactNode;
  chatContent?: ReactNode;
  resultActions?: ReactNode;
  composer?: ReactNode;
  onTabChange?(tab: MainPanelTab): void;
  onGeometryChange?(geometry: PanelGeometry): void;
  onGeometryCommit?(geometry: PanelGeometry): void;
}

export interface FloatingButtonProps {
  phase: AppPhase;
  title?: string;
  statusMessage?: string;
  position?: FloatingButtonPosition;
  onOpen(): void;
  onPositionChange?(position: FloatingButtonPosition): void;
  onPositionCommit?(position: FloatingButtonPosition): void;
}

export interface VideoSummarySurfaceProps extends MainPanelCallbacks {
  snapshot: AppSnapshot;
  geometry?: PanelGeometry;
  floatingButtonPosition?: FloatingButtonPosition;
  activeTab?: MainPanelTab;
  modelLabel?: string;
  presetLabel?: string;
  workspaceContent?: ReactNode;
  summaryContent?: ReactNode;
  analysisContent?: ReactNode;
  chatContent?: ReactNode;
  resultActions?: ReactNode;
  composer?: ReactNode;
  onTabChange?(tab: MainPanelTab): void;
  onGeometryChange?(geometry: PanelGeometry): void;
  onGeometryCommit?(geometry: PanelGeometry): void;
  onFloatingButtonPositionChange?(position: FloatingButtonPosition): void;
  onFloatingButtonPositionCommit?(position: FloatingButtonPosition): void;
}
