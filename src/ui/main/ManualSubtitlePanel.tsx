export interface ManualSubtitlePanelProps {
  onManualFetchSubtitle(): void | Promise<void>;
  onUploadSubtitle(): void | Promise<void>;
  onPasteSubtitle(): void | Promise<void>;
}

export function ManualSubtitlePanel({
  onManualFetchSubtitle,
  onUploadSubtitle,
  onPasteSubtitle,
}: ManualSubtitlePanelProps) {
  return (
    <section className="bvs-main-manual-subtitle">
      <div>
        <span aria-hidden="true">CC</span>
        <div>
          <strong>手动提供字幕</strong>
          <p>自动获取不可用时，可选择下面任一方式继续总结当前分集。</p>
        </div>
      </div>
      <div className="bvs-main-manual-actions">
        <button type="button" onClick={() => void onManualFetchSubtitle()}>
          <span aria-hidden="true">↻</span>
          手动获取
        </button>
        <button type="button" onClick={() => void onUploadSubtitle()}>
          <span aria-hidden="true">⇧</span>
          上传 SRT/TXT
        </button>
        <button type="button" onClick={() => void onPasteSubtitle()}>
          <span aria-hidden="true">▤</span>
          粘贴字幕
        </button>
      </div>
    </section>
  );
}
