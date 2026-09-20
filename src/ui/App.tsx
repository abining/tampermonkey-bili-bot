import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ResultActionButtonId } from '../config';
import type { AnalysisKind, AppPhase } from '../contracts/app-snapshot';
import type { AppController } from '../runtime/app-controller';
import { configController } from '../runtime/config-controller';
import { loadPositions, savePositions } from '../storage';
import {
  createDefaultPanelGeometry,
  VideoSummarySurface,
  type FloatingButtonPosition,
  type PanelGeometry,
} from './main';
import {
  ResultsPanel,
  type ResultsActionAvailabilityMap,
  type ResultsActionKey,
  type ResultsView,
  type SummaryResultStatus,
} from './results';
import { SettingsContainer } from './settings';
import { APP_ICONS, UiIcon } from './icons';

interface AppProps {
  controller: AppController;
}

const ACTION_KEY_MAP: Record<ResultActionButtonId, ResultsActionKey> = {
  copy_summary: 'copy',
  edit_summary: 'edit-summary',
  generate_image: 'generate-image',
  copy_image_prompt: 'copy-image-prompt',
  post_comment: 'insert-comment',
  post_note: 'insert-note',
  send_flomo: 'flomo',
  download_transcript: 'download-txt',
  download_srt: 'download-srt',
  save_image: 'save-image',
  fill_image_comment: 'fill-image-comment',
};

function summaryStatus(phase: AppPhase): SummaryResultStatus {
  if (phase === 'detecting' || phase === 'fetching-subtitle') return 'loading';
  if (phase === 'summarizing') return 'streaming';
  if (phase === 'ready') return 'ready';
  if (phase === 'no-subtitle') return 'empty';
  if (phase === 'interrupted') return 'interrupted';
  if (phase === 'error') return 'error';
  return 'idle';
}

function resultViewToKind(view: ResultsView): 'summary' | AnalysisKind {
  if (view === 'full-analysis') return 'full';
  return view;
}

function kindToResultView(kind: 'summary' | AnalysisKind): ResultsView {
  return kind === 'full' ? 'full-analysis' : kind;
}

function getInitialPanelGeometry(): PanelGeometry {
  const fallback = createDefaultPanelGeometry();
  const panel = loadPositions().panel;
  return {
    left: Number.isFinite(panel?.left) ? Number(panel?.left) : fallback.left,
    top: Number.isFinite(panel?.top) ? Number(panel?.top) : fallback.top,
    width: Number.isFinite(panel?.width) ? Number(panel?.width) : fallback.width,
    height: Number.isFinite(panel?.height) ? Number(panel?.height) : fallback.height,
  };
}

function getInitialFloatPosition(): FloatingButtonPosition {
  const positions = loadPositions();
  const stored = positions.floatBtn as (typeof positions.floatBtn & {
    left?: number;
    top?: number;
  });
  if (Number.isFinite(stored?.left) && Number.isFinite(stored?.top)) {
    return { left: Number(stored?.left), top: Number(stored?.top) };
  }
  const bottom = Number.isFinite(stored?.bottom) ? Number(stored?.bottom) : 92;
  const left = stored?.side === 'left' ? 24 : Math.max(10, window.innerWidth - 78);
  return { left, top: Math.max(10, window.innerHeight - bottom - 54) };
}

function savePanelGeometry(panel: PanelGeometry): void {
  savePositions({ ...loadPositions(), panel });
}

function saveFloatPosition(floatBtn: FloatingButtonPosition): void {
  savePositions({
    ...loadPositions(),
    floatBtn: {
      left: floatBtn.left,
      top: floatBtn.top,
      side: floatBtn.left < window.innerWidth / 2 ? 'left' : 'right',
      bottom: Math.max(0, window.innerHeight - floatBtn.top - 54),
    },
  });
}

function chooseSubtitleFile(): Promise<{ text: string; filename: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.srt,.txt,text/plain,application/x-subrip';
    input.hidden = true;
    let settled = false;
    const finish = (value: { text: string; filename: string } | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      input.remove();
      if (error) reject(error);
      else resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      file.text()
        .then((text) => finish({ text, filename: file.name }))
        .catch((error) => finish(null, error));
    }, { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export function App({ controller }: AppProps) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const configSnapshot = useSyncExternalStore(
    configController.subscribe,
    configController.getSnapshot,
    configController.getSnapshot,
  );
  const config = configSnapshot.config;
  const [panelGeometry, setPanelGeometry] = useState(getInitialPanelGeometry);
  const [floatPosition, setFloatPosition] = useState(getInitialFloatPosition);
  const [manualText, setManualText] = useState('');
  const [manualError, setManualError] = useState('');
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');

  useEffect(() => {
    if (!snapshot.actionFeedback) return undefined;
    const createdAt = snapshot.actionFeedback.createdAt;
    const timer = window.setTimeout(() => {
      if (controller.getSnapshot().actionFeedback?.createdAt === createdAt) {
        controller.update({ actionFeedback: null });
      }
    }, 3_200);
    return () => window.clearTimeout(timer);
  }, [controller, snapshot.actionFeedback]);

  const activePreset = config.promptPresets.find((preset) => preset.id === config.activePresetId);
  const enabledActions = useMemo(() => new Map(
    config.resultActionButtons.map((item) => [ACTION_KEY_MAP[item.id], item.enabled]),
  ), [config.resultActionButtons]);
  const actionOrder = useMemo(() => {
    const ordered = config.resultActionButtons.map((item) => ACTION_KEY_MAP[item.id]);
    const editIndex = ordered.indexOf('edit-summary');
    ordered.splice(editIndex >= 0 ? editIndex + 1 : 1, 0, 'regenerate');
    return ordered;
  }, [config.resultActionButtons]);

  const actionAvailability = useMemo<ResultsActionAvailabilityMap>(() => {
    const noSummary = !snapshot.summary.trim();
    const availability: ResultsActionAvailabilityMap = {};
    for (const key of Object.values(ACTION_KEY_MAP)) {
      availability[key] = { hidden: enabledActions.get(key) !== true };
    }
    for (const key of [
      'copy',
      'edit-summary',
      'insert-comment',
      'insert-note',
      'flomo',
      'generate-image',
      'copy-image-prompt',
    ] as ResultsActionKey[]) {
      availability[key] = { ...availability[key], disabled: noSummary };
    }
    availability['download-txt'] = {
      ...availability['download-txt'],
      disabled: !snapshot.transcript,
    };
    availability['download-srt'] = {
      ...availability['download-srt'],
      disabled: !snapshot.subtitleSegments.length,
    };
    availability['generate-image'] = {
      ...availability['generate-image'],
      loading: snapshot.generatedImage.status === 'loading',
    };
    availability['save-image'] = {
      ...availability['save-image'],
      disabled: !snapshot.generatedImage.imageUrl,
    };
    availability['fill-image-comment'] = {
      ...availability['fill-image-comment'],
      disabled: !snapshot.generatedImage.imageUrl,
    };
    return availability;
  }, [enabledActions, snapshot.generatedImage, snapshot.subtitleSegments.length, snapshot.summary, snapshot.transcript]);

  const openEditor = () => {
    setSummaryDraft(snapshot.summary);
    setEditingSummary(true);
  };

  const uploadSubtitle = async () => {
    try {
      const selected = await chooseSubtitleFile();
      if (selected) await controller.parseManualSubtitle(selected.text, selected.filename);
    } catch (error) {
      controller.update({
        actionFeedback: {
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
          createdAt: Date.now(),
        },
      });
    }
  };

  const submitManualSubtitle = async () => {
    setManualError('');
    if (!manualText.trim()) {
      setManualError('请粘贴字幕或视频文稿');
      return;
    }
    try {
      await controller.parseManualSubtitle(manualText, 'manual.txt');
      setManualText('');
      controller.setManualSubtitleOpen(false);
    } catch (error) {
      setManualError(error instanceof Error ? error.message : String(error));
    }
  };

  const results = (
    <ResultsPanel
      summary={snapshot.summary}
      status={summaryStatus(snapshot.phase)}
      statusMessage={snapshot.statusMessage}
      error={snapshot.errorMessage}
      model={config.model}
      presets={config.promptPresets}
      activePresetId={config.activePresetId}
      actionOrder={actionOrder}
      actionAvailability={actionAvailability}
      actions={{
        onCopy: () => controller.copySummary(),
        onEditSummary: openEditor,
        onRegenerate: () => controller.regenerateSummary(),
        onInsertComment: () => controller.insertSummaryIntoComment(),
        onInsertNote: () => controller.insertSummaryIntoNote(),
        onSendFlomo: () => controller.sendSummaryToFlomo(),
        onDownloadTranscript: () => controller.downloadTranscript(),
        onDownloadSrt: () => controller.downloadSubtitleSrt(),
        onGenerateImage: () => controller.generateImage(),
        onCopyImagePrompt: () => controller.copyImagePrompt(),
        onSaveImage: () => controller.saveGeneratedImage(),
        onFillImageComment: () => controller.fillGeneratedImageComment(),
      }}
      analyses={{
        comments: {
          status: snapshot.analyses.comments.status,
          content: snapshot.analyses.comments.text,
          error: snapshot.analyses.comments.errorMessage,
          statusMessage: snapshot.analyses.comments.statusMessage,
        },
        danmaku: {
          status: snapshot.analyses.danmaku.status,
          content: snapshot.analyses.danmaku.text,
          error: snapshot.analyses.danmaku.errorMessage,
          statusMessage: snapshot.analyses.danmaku.statusMessage,
        },
        fullAnalysis: {
          status: snapshot.analyses.full.status,
          content: snapshot.analyses.full.text,
          error: snapshot.analyses.full.errorMessage,
          statusMessage: snapshot.analyses.full.statusMessage,
        },
      }}
      analysisCallbacks={{
        onRunComments: () => controller.runAnalysis('comments'),
        onRunDanmaku: () => controller.runAnalysis('danmaku'),
        onRunFullAnalysis: () => controller.runAnalysis('full'),
        onCopyComments: () => controller.copyText(snapshot.analyses.comments.text),
        onCopyDanmaku: () => controller.copyText(snapshot.analyses.danmaku.text),
        onCopyFullAnalysis: () => controller.copyText(snapshot.analyses.full.text),
        onSendCommentsFlomo: () => controller.sendTextToFlomo(snapshot.analyses.comments.text),
        onSendDanmakuFlomo: () => controller.sendTextToFlomo(snapshot.analyses.danmaku.text),
        onSendFullAnalysisFlomo: () => controller.sendTextToFlomo(snapshot.analyses.full.text),
        onExportComments: () => controller.downloadAnalysisRaw('comments'),
        onExportDanmaku: () => controller.downloadAnalysisRaw('danmaku'),
        onExportFullAnalysis: () => controller.downloadAnalysisRaw('full'),
      }}
      conversation={{
        messages: snapshot.conversation.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          model: message.role === 'assistant' ? config.model : undefined,
          streaming: message.pending,
        })),
        pending: snapshot.conversation.some((message) => message.pending),
        disabled: !snapshot.summary && !Object.values(snapshot.analyses).some((item) => item.text),
        onAsk: (question) => controller.ask(question),
        onAbort: () => controller.abortCurrentTask(),
      }}
      imageUrl={snapshot.generatedImage.imageUrl}
      imageAlt={`${snapshot.video?.title || '视频'}总结配图`}
      imageStatusMessage={snapshot.generatedImage.statusMessage}
      imageError={snapshot.generatedImage.errorMessage}
      activeView={kindToResultView(snapshot.activeResult)}
      onViewChange={(view) => controller.setActiveResult(resultViewToKind(view))}
      onPresetChange={(presetId) => controller.regenerateSummary(presetId)}
      onAbortSummary={() => controller.abortCurrentTask()}
      onCopyPortablePrompt={snapshot.transcript ? () => controller.copyPortablePrompt() : undefined}
    />
  );

  return (
    <>
      <VideoSummarySurface
        snapshot={snapshot}
        geometry={panelGeometry}
        floatingButtonPosition={floatPosition}
        modelLabel={config.model}
        presetLabel={activePreset?.name || '默认摘要模板'}
        workspaceContent={results}
        onOpen={() => controller.setPanelOpen(true)}
        onClose={() => controller.setPanelOpen(false)}
        onOpenSettings={() => controller.setSettingsOpen(true)}
        onStartParsing={() => controller.startParsing({ autoTriggered: false })}
        onAbort={() => controller.abortCurrentTask()}
        onRetrySubtitle={() => controller.retrySubtitle()}
        onManualFetchSubtitle={() => controller.retrySubtitle()}
        onUploadSubtitle={uploadSubtitle}
        onPasteSubtitle={() => controller.setManualSubtitleOpen(true)}
        onGeometryChange={setPanelGeometry}
        onGeometryCommit={(geometry) => {
          setPanelGeometry(geometry);
          savePanelGeometry(geometry);
        }}
        onFloatingButtonPositionChange={setFloatPosition}
        onFloatingButtonPositionCommit={(position) => {
          setFloatPosition(position);
          saveFloatPosition(position);
        }}
      />

      {snapshot.settingsOpen ? (
        <SettingsContainer onClose={() => controller.setSettingsOpen(false)} />
      ) : null}

      {snapshot.manualSubtitleOpen ? (
        <div className="bvs-modal-backdrop" role="presentation" onMouseDown={() => controller.setManualSubtitleOpen(false)}>
          <section className="bvs-modal" role="dialog" aria-modal="true" aria-label="粘贴字幕" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <strong>粘贴当前分集字幕</strong>
                <span>支持纯文本或 SRT 内容</span>
              </div>
              <button type="button" aria-label="关闭粘贴字幕" onClick={() => controller.setManualSubtitleOpen(false)}>
                <UiIcon icon={APP_ICONS.close} size={18} />
              </button>
            </header>
            <textarea
              value={manualText}
              rows={14}
              placeholder="请粘贴当前 P 的字幕或视频文稿…"
              onChange={(event) => setManualText(event.currentTarget.value)}
            />
            {manualError ? <p className="bvs-modal-error">{manualError}</p> : null}
            <footer>
              <button type="button" className="is-secondary" onClick={() => controller.setManualSubtitleOpen(false)}>取消</button>
              <button type="button" onClick={() => void submitManualSubtitle()}>使用这份字幕生成摘要</button>
            </footer>
          </section>
        </div>
      ) : null}

      {editingSummary ? (
        <div className="bvs-modal-backdrop" role="presentation" onMouseDown={() => setEditingSummary(false)}>
          <section className="bvs-modal" role="dialog" aria-modal="true" aria-label="编辑摘要" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <strong>编辑视频摘要</strong>
                <span>修改后可复制、发评论或重新生成配图</span>
              </div>
              <button type="button" aria-label="关闭摘要编辑" onClick={() => setEditingSummary(false)}>
                <UiIcon icon={APP_ICONS.close} size={18} />
              </button>
            </header>
            <textarea
              value={summaryDraft}
              rows={16}
              onChange={(event) => setSummaryDraft(event.currentTarget.value)}
            />
            <footer>
              <button type="button" className="is-secondary" onClick={() => setEditingSummary(false)}>取消</button>
              <button type="button" onClick={() => {
                controller.updateSummary(summaryDraft);
                setEditingSummary(false);
              }}>保存修改</button>
            </footer>
          </section>
        </div>
      ) : null}

      {snapshot.actionFeedback ? (
        <div className={`bvs-toast is-${snapshot.actionFeedback.type}`} role="status">
          {snapshot.actionFeedback.message}
        </div>
      ) : null}
    </>
  );
}
