import type { AppPhase } from '../contracts/app-snapshot';
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bot,
  Captions,
  CaptionsOff,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  CirclePlay,
  ClipboardPaste,
  Clock3,
  Copy,
  CopyPlus,
  Cpu,
  Database,
  Download,
  FileDown,
  FileQuestion,
  FileText,
  Film,
  Gauge,
  Image,
  ImagePlus,
  ImageUp,
  Info,
  ListChecks,
  LoaderCircle,
  MessageCircleMore,
  MessageSquareShare,
  MessageSquareText,
  Minus,
  MoreHorizontal,
  NotebookPen,
  NotebookTabs,
  Palette,
  PanelTopClose,
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  SearchCheck,
  Send,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Square,
  StickyNote,
  Upload,
  UserRound,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';

export type UiIconComponent = LucideIcon;

export function UiIcon({
  icon: Icon,
  size = 18,
  strokeWidth = 2,
  ...props
}: LucideProps & { icon: LucideIcon }) {
  return (
    <Icon
      aria-hidden="true"
      focusable="false"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export const APP_ICONS = {
  logo: Captions,
  settings: Settings,
  collapse: PanelTopClose,
  minimize: Minus,
  expand: ChevronDown,
  summary: NotebookTabs,
  analysis: ChartNoAxesCombined,
  chat: MessageCircleMore,
  manualSubtitle: Captions,
  retry: RotateCcw,
  upload: Upload,
  paste: ClipboardPaste,
  close: X,
  add: Plus,
  moveUp: ArrowUp,
  moveDown: ArrowDown,
  user: UserRound,
  assistant: Bot,
  info: Info,
  loading: LoaderCircle,
  warning: AlertCircle,
  empty: FileQuestion,
  send: Send,
  stop: Square,
  model: Cpu,
  palette: Palette,
  more: MoreHorizontal,
  portablePrompt: CopyPlus,
} satisfies Record<string, LucideIcon>;

export const PHASE_ICONS: Record<AppPhase, LucideIcon> = {
  idle: CirclePlay,
  detecting: ScanSearch,
  'fetching-subtitle': Captions,
  summarizing: Sparkles,
  ready: CheckCircle2,
  'no-subtitle': CaptionsOff,
  interrupted: Square,
  error: AlertCircle,
};

export const RESULT_VIEW_ICONS = {
  summary: NotebookTabs,
  comments: MessageSquareText,
  danmaku: Radio,
  'full-analysis': ScanSearch,
} satisfies Record<string, LucideIcon>;

export const RESULT_ACTION_ICONS = {
  copy: Copy,
  'edit-summary': Pencil,
  regenerate: RefreshCw,
  'insert-comment': MessageSquareShare,
  flomo: StickyNote,
  'download-txt': FileDown,
  'download-srt': FileText,
  'generate-image': ImagePlus,
  'copy-image-prompt': CopyPlus,
  'save-image': Download,
  'fill-image-comment': ImageUp,
} satisfies Record<string, LucideIcon>;

export const SETTINGS_SECTION_ICONS = {
  general: SlidersHorizontal,
  ai: Cpu,
  summary: NotebookTabs,
  analysis: ChartNoAxesCombined,
  image: Image,
  services: Share2,
  data: Database,
} satisfies Record<string, LucideIcon>;

const PRESET_ICONS: Record<string, LucideIcon> = {
  preset_default: Gauge,
  preset_detailed: NotebookPen,
  preset_critical: SearchCheck,
  preset_action: ListChecks,
  preset_timeline: Clock3,
  fullpreset_video_review: Film,
  fullpreset_quick_review: Zap,
  fullpreset_deep_critique: ScanSearch,
};

export function getPresetIcon(presetId: string): LucideIcon {
  return PRESET_ICONS[presetId] || FileText;
}

export const ACTION_ICONS = {
  play: Play,
  retry: RefreshCw,
  magic: WandSparkles,
} satisfies Record<string, LucideIcon>;
