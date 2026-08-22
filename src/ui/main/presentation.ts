import type { AppPhase } from '../../contracts/app-snapshot';

export interface PhasePresentation {
  label: string;
  description: string;
  icon: string;
  tone: 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger';
  busy: boolean;
}

export const PHASE_PRESENTATION: Record<AppPhase, PhasePresentation> = {
  idle: {
    label: '等待解析',
    description: '准备好后开始获取当前分集字幕。',
    icon: '▶',
    tone: 'neutral',
    busy: false,
  },
  detecting: {
    label: '识别视频中',
    description: '正在确认当前视频、分集和页面上下文。',
    icon: '◎',
    tone: 'progress',
    busy: true,
  },
  'fetching-subtitle': {
    label: '获取字幕中',
    description: '优先捕获播放器字幕，未命中时会回退接口。',
    icon: 'CC',
    tone: 'progress',
    busy: true,
  },
  summarizing: {
    label: 'AI 总结中',
    description: '正在根据当前分集字幕生成视频摘要。',
    icon: 'AI',
    tone: 'progress',
    busy: true,
  },
  ready: {
    label: '总结完成',
    description: '当前分集内容已经准备好，可以继续分析或提问。',
    icon: '✓',
    tone: 'success',
    busy: false,
  },
  'no-subtitle': {
    label: '没有可用字幕',
    description: '可以手动获取、上传字幕文件或直接粘贴文本。',
    icon: 'CC',
    tone: 'warning',
    busy: false,
  },
  interrupted: {
    label: '任务已停止',
    description: '自动处理已中止，可以改用手动字幕入口。',
    icon: '■',
    tone: 'warning',
    busy: false,
  },
  error: {
    label: '处理失败',
    description: '请求发生异常，请重试或使用手动字幕入口。',
    icon: '!',
    tone: 'danger',
    busy: false,
  },
};

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  if (hours > 0) {
    return [hours, minutes, remainingSeconds]
      .map((value) => String(value).padStart(2, '0'))
      .join(':');
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}
