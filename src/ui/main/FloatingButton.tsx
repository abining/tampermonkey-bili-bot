import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { APP_ICONS, UiIcon } from '../icons';
import { PHASE_PRESENTATION } from './presentation';
import type {
  FloatingButtonPosition,
  FloatingButtonProps,
} from './types';

interface DragSession {
  pointerId: number;
  startX: number;
  startY: number;
  originLeft: number;
  originTop: number;
  moved: boolean;
}

const FLOAT_BUTTON_SIZE = 54;
const VIEWPORT_MARGIN = 10;

function clampPosition(position: FloatingButtonPosition): FloatingButtonPosition {
  if (typeof window === 'undefined') return position;
  return {
    left: Math.max(
      VIEWPORT_MARGIN,
      Math.min(position.left, window.innerWidth - FLOAT_BUTTON_SIZE - VIEWPORT_MARGIN),
    ),
    top: Math.max(
      VIEWPORT_MARGIN,
      Math.min(position.top, window.innerHeight - FLOAT_BUTTON_SIZE - VIEWPORT_MARGIN),
    ),
  };
}

export function FloatingButton({
  phase,
  title = 'B站视频总结测试',
  statusMessage,
  position,
  onOpen,
  onPositionChange,
  onPositionCommit,
}: FloatingButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const suppressClickRef = useRef(false);
  const [localPosition, setLocalPosition] = useState<FloatingButtonPosition | null>(
    position ? clampPosition(position) : null,
  );
  const [dragging, setDragging] = useState(false);
  const presentation = PHASE_PRESENTATION[phase];

  useEffect(() => {
    if (position) setLocalPosition(clampPosition(position));
  }, [position?.left, position?.top]);

  useEffect(() => {
    const handleResize = () => {
      setLocalPosition((current) => (current ? clampPosition(current) : current));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 4) drag.moved = true;
      const next = clampPosition({
        left: drag.originLeft + deltaX,
        top: drag.originTop + deltaY,
      });
      setLocalPosition(next);
      onPositionChange?.(next);
      event.preventDefault();
    };

    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      setDragging(false);
      suppressClickRef.current = drag.moved;
      setLocalPosition((current) => {
        if (current) onPositionCommit?.(current);
        return current;
      });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [onPositionChange, onPositionCommit]);

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const origin = localPosition || { left: rect.left, top: rect.top };
    setLocalPosition(origin);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: origin.left,
      originTop: origin.top,
      moved: false,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpen();
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`bvs-main-float is-${presentation.tone}${dragging ? ' is-dragging' : ''}`}
      style={localPosition ? {
        left: `${localPosition.left}px`,
        top: `${localPosition.top}px`,
        right: 'auto',
        bottom: 'auto',
      } : undefined}
      onPointerDown={beginDrag}
      onClick={handleClick}
      aria-label={`打开${title}，当前状态：${presentation.label}`}
      title={`${presentation.label}${statusMessage ? ` · ${statusMessage}` : ''}`}
    >
      <span className="bvs-main-float-ring" aria-hidden="true" />
      <span className="bvs-main-float-logo" aria-hidden="true">
        <UiIcon icon={APP_ICONS.logo} size={25} strokeWidth={2.25} />
      </span>
      <span className="bvs-main-float-status" aria-hidden="true" />
      {presentation.busy ? <span className="bvs-main-float-progress" aria-hidden="true" /> : null}
    </button>
  );
}
