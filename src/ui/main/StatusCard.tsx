import type { AppSnapshot } from '../../contracts/app-snapshot';
import { PHASE_PRESENTATION } from './presentation';

export interface StatusCardProps {
  snapshot: AppSnapshot;
  onStartParsing(): void | Promise<void>;
  onAbort(): void;
  onRetrySubtitle(): void | Promise<void>;
}

export function StatusCard({
  snapshot,
  onStartParsing,
  onAbort,
  onRetrySubtitle,
}: StatusCardProps) {
  const presentation = PHASE_PRESENTATION[snapshot.phase];
  const message = snapshot.errorMessage
    || snapshot.statusMessage
    || presentation.description;

  return (
    <section className={`bvs-main-status is-${presentation.tone}`} aria-live="polite">
      <div className="bvs-main-status-icon" aria-hidden="true">
        {presentation.busy ? <span className="bvs-main-spinner" /> : presentation.icon}
      </div>
      <div className="bvs-main-status-copy">
        <div>
          <strong>{presentation.label}</strong>
          {snapshot.video?.page ? <span>P{snapshot.video.page}</span> : null}
        </div>
        <p>{message}</p>
      </div>
      <div className="bvs-main-status-actions">
        {presentation.busy ? (
          <button type="button" onClick={onAbort}>停止</button>
        ) : null}
        {snapshot.phase === 'idle' ? (
          <button type="button" className="is-primary" onClick={() => void onStartParsing()}>
            开始解析
          </button>
        ) : null}
        {snapshot.phase === 'error' ? (
          <button type="button" className="is-primary" onClick={() => void onRetrySubtitle()}>
            重新尝试
          </button>
        ) : null}
      </div>
    </section>
  );
}
