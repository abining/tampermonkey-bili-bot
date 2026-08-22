import { useMemo, useState, type FormEvent } from 'react';
import resultsStyles from './results.css?inline';
import { SafeMarkdown } from './SafeMarkdown';
import type {
  AnalysisResultState,
  ResultAsyncCallback,
  ResultsActionKey,
  ResultsPanelProps,
  ResultsView,
  SummaryResultStatus,
} from './types';

interface ActionDefinition {
  key: ResultsActionKey;
  icon: string;
  label: string;
  callback?: ResultAsyncCallback;
  primary?: boolean;
}

const VIEW_ITEMS: Array<{ id: ResultsView; label: string; icon: string }> = [
  { id: 'summary', label: '摘要', icon: '✨' },
  { id: 'comments', label: '评论', icon: '💬' },
  { id: 'danmaku', label: '弹幕', icon: '📡' },
  { id: 'full-analysis', label: '全面分析', icon: '🔍' },
];

const STATUS_LABEL: Record<SummaryResultStatus, string> = {
  idle: '等待处理',
  loading: '正在准备',
  streaming: 'AI 正在输出',
  ready: '已完成',
  empty: '暂无内容',
  interrupted: '已中断',
  error: '处理失败',
};

function safeImageSource(rawUrl?: string): string | undefined {
  const url = String(rawUrl || '').trim();
  if (!url) return undefined;
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(url)) return url;
  if (/^blob:/i.test(url)) return url;
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function LoadingState({ message }: { message?: string }) {
  return (
    <div className="bvs-results-loading" role="status" aria-live="polite">
      <span className="bvs-results-spinner" aria-hidden="true" />
      <div>
        <strong>{message || '正在整理视频内容…'}</strong>
        <span>字幕较长时需要一点时间，可以随时中断。</span>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="bvs-results-empty">
      <span aria-hidden="true">◌</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="bvs-results-error" role="alert">
      <span aria-hidden="true">!</span>
      <div>
        <strong>处理没有完成</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

function AnalysisView({
  title,
  description,
  state,
  runLabel,
  disabled,
  onRun,
  onCopy,
  onSendFlomo,
  onExport,
}: {
  title: string;
  description: string;
  state?: AnalysisResultState;
  runLabel: string;
  disabled: boolean;
  onRun?: ResultAsyncCallback;
  onCopy?: ResultAsyncCallback;
  onSendFlomo?: ResultAsyncCallback;
  onExport?: ResultAsyncCallback;
}) {
  const status = state?.status || 'idle';
  const busy = status === 'loading' || status === 'streaming';
  return (
    <section className="bvs-analysis-view" aria-label={title}>
      <header>
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        <button type="button" disabled={disabled || busy || !onRun} onClick={() => void onRun?.()}>
          {busy ? '分析中…' : runLabel}
        </button>
      </header>
      {busy && !state?.content ? <LoadingState message={state?.statusMessage || `${title}处理中…`} /> : null}
      {state?.error || status === 'error' || status === 'interrupted' ? (
        <ErrorState message={state?.error || (status === 'interrupted' ? `${title}已被中断。` : `${title}失败，请稍后重试。`)} />
      ) : null}
      {state?.content ? (
        <>
          <div className={busy ? 'bvs-analysis-content is-streaming' : 'bvs-analysis-content'}>
            <SafeMarkdown content={state.content} />
            {busy ? <span className="bvs-stream-cursor" aria-label="正在输出" /> : null}
          </div>
          {!busy ? (
            <div className="bvs-result-actions" aria-label={`${title}操作`}>
              <button type="button" disabled={!onCopy} onClick={() => void onCopy?.()}>⧉ 复制</button>
              <button type="button" disabled={!onSendFlomo} onClick={() => void onSendFlomo?.()}>F 发送 Flomo</button>
              <button type="button" disabled={!onExport} onClick={() => void onExport?.()}>TXT 导出原文</button>
            </div>
          ) : null}
        </>
      ) : null}
      {!busy && !state?.content && status !== 'error' && status !== 'interrupted' ? (
        <EmptyState title={`还没有${title}`} description="点击上方按钮后，结果会保留在这个标签页中。" />
      ) : null}
    </section>
  );
}

export function ResultsPanel(props: ResultsPanelProps) {
  const [uncontrolledView, setUncontrolledView] = useState<ResultsView>(props.defaultView || 'summary');
  const [busyAction, setBusyAction] = useState<ResultsActionKey>();
  const [notice, setNotice] = useState('');
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [presetBusy, setPresetBusy] = useState('');
  const currentView = props.activeView || uncontrolledView;
  const globallyDisabled = props.disabled === true;
  const summaryBusy = props.status === 'loading' || props.status === 'streaming';
  const imageSource = safeImageSource(props.imageUrl);

  const actions = useMemo<ActionDefinition[]>(
    () => {
      const definitions: ActionDefinition[] = [
      { key: 'copy', icon: '⧉', label: '复制摘要', callback: props.actions?.onCopy, primary: true },
      { key: 'edit-summary', icon: '✎', label: '编辑摘要', callback: props.actions?.onEditSummary },
      { key: 'regenerate', icon: '↻', label: '重新生成', callback: props.actions?.onRegenerate, primary: true },
      { key: 'insert-comment', icon: '↗', label: '插入评论', callback: props.actions?.onInsertComment },
      { key: 'flomo', icon: 'F', label: '发送 Flomo', callback: props.actions?.onSendFlomo },
      { key: 'download-txt', icon: 'TXT', label: '下载字幕', callback: props.actions?.onDownloadTranscript },
      { key: 'download-srt', icon: 'SRT', label: '下载 SRT', callback: props.actions?.onDownloadSrt },
      { key: 'generate-image', icon: '▧', label: imageSource ? '重新生图' : '生成配图', callback: props.actions?.onGenerateImage },
      { key: 'copy-image-prompt', icon: 'P', label: '复制生图词', callback: props.actions?.onCopyImagePrompt },
      { key: 'save-image', icon: '↓', label: '保存图片', callback: props.actions?.onSaveImage },
      { key: 'fill-image-comment', icon: '↗', label: '图片发评论', callback: props.actions?.onFillImageComment },
      ];
      if (!props.actionOrder?.length) return definitions;
      const order = new Map(props.actionOrder.map((key, index) => [key, index]));
      return definitions.sort((left, right) =>
        (order.get(left.key) ?? Number.MAX_SAFE_INTEGER)
        - (order.get(right.key) ?? Number.MAX_SAFE_INTEGER),
      );
    },
    [props.actions, props.actionOrder, imageSource],
  );

  const changeView = (view: ResultsView) => {
    if (!props.activeView) setUncontrolledView(view);
    props.onViewChange?.(view);
  };

  const runAction = async (action: ActionDefinition) => {
    const state = props.actionAvailability?.[action.key];
    if (!action.callback || globallyDisabled || state?.disabled || state?.loading || busyAction) return;
    setBusyAction(action.key);
    setNotice('');
    try {
      await action.callback();
      setNotice(action.key === 'copy' ? '摘要已复制' : '操作已完成');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '操作失败，请稍后重试');
    } finally {
      setBusyAction(undefined);
    }
  };

  const switchPreset = async (presetId: string) => {
    if (!props.onPresetChange || globallyDisabled || summaryBusy || presetId === props.activePresetId) return;
    setPresetBusy(presetId);
    setNotice('');
    try {
      await props.onPresetChange(presetId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '切换摘要风格失败');
    } finally {
      setPresetBusy('');
    }
  };

  const submitQuestion = async (event: FormEvent) => {
    event.preventDefault();
    const value = question.trim();
    if (!value || !props.conversation?.onAsk || globallyDisabled || props.conversation.disabled) return;
    setAsking(true);
    setNotice('');
    try {
      await props.conversation.onAsk(value);
      setQuestion('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '提问失败，请稍后重试');
    } finally {
      setAsking(false);
    }
  };

  const conversationBusy = asking || props.conversation?.pending;

  return (
    <section className="bvs-results-panel" aria-label="视频总结结果">
      <style>{resultsStyles}</style>

      <div className="bvs-results-heading">
        <div>
          <strong>视频总结</strong>
          <span className={`bvs-results-status is-${props.status}`}>
            <i aria-hidden="true" />
            {STATUS_LABEL[props.status]}
          </span>
        </div>
        {props.model ? <span className="bvs-results-model" title={props.model}>AI · {props.model}</span> : null}
      </div>

      {props.presets?.length ? (
        <div className="bvs-preset-section">
          <span>摘要风格</span>
          <div className="bvs-preset-list" role="radiogroup" aria-label="摘要风格">
            {props.presets.map((preset) => {
              const active = preset.id === props.activePresetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={active ? 'is-active' : undefined}
                  disabled={globallyDisabled || summaryBusy || Boolean(presetBusy)}
                  title={preset.prompt}
                  onClick={() => void switchPreset(preset.id)}
                >
                  <span aria-hidden="true">{presetBusy === preset.id ? '…' : preset.icon || '•'}</span>
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="bvs-results-tabs" role="tablist" aria-label="结果分类">
        {VIEW_ITEMS.map((view) => (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={currentView === view.id}
            className={currentView === view.id ? 'is-active' : undefined}
            onClick={() => changeView(view.id)}
          >
            <span aria-hidden="true">{view.icon}</span>
            {view.label}
          </button>
        ))}
      </div>

      <div className="bvs-results-view" role="tabpanel">
        {currentView === 'summary' ? (
          <>
            {props.statusMessage ? <p className="bvs-results-message">{props.statusMessage}</p> : null}
            {summaryBusy && !props.summary ? <LoadingState message={props.statusMessage} /> : null}
            {props.status === 'error' ? <ErrorState message={props.error || '摘要生成失败，请稍后重试。'} /> : null}
            {props.status === 'interrupted' ? <ErrorState message={props.error || '任务已被中断，可以重新生成。'} /> : null}
            {props.summary ? (
              <article className={summaryBusy ? 'bvs-summary-card is-streaming' : 'bvs-summary-card'}>
                <SafeMarkdown content={props.summary} />
                {summaryBusy ? <span className="bvs-stream-cursor" aria-label="正在输出" /> : null}
              </article>
            ) : null}
            {!props.summary && !summaryBusy && props.status !== 'error' && props.status !== 'interrupted' ? (
              <EmptyState
                title={props.emptyTitle || '还没有视频摘要'}
                description={props.emptyDescription || '获取字幕并生成摘要后，结果会显示在这里。'}
              />
            ) : null}
            {!props.summary && props.onCopyPortablePrompt ? (
              <button className="bvs-abort-button" type="button" onClick={() => void props.onCopyPortablePrompt?.()}>
                复制提示词 + 当前分集字幕
              </button>
            ) : null}
            {summaryBusy && props.onAbortSummary ? (
              <button className="bvs-abort-button" type="button" onClick={() => void props.onAbortSummary?.()}>
                停止生成
              </button>
            ) : null}

            {imageSource ? (
              <figure className="bvs-result-image">
                <img src={imageSource} alt={props.imageAlt || '视频总结配图'} />
                <figcaption>AI 总结配图</figcaption>
              </figure>
            ) : null}

            {props.imageStatusMessage ? <p className="bvs-results-message">{props.imageStatusMessage}</p> : null}
            {props.imageError ? <ErrorState message={props.imageError} /> : null}

            <div className="bvs-result-actions" aria-label="摘要操作">
              {actions.map((action) => {
                const state = props.actionAvailability?.[action.key];
                if (state?.hidden) return null;
                const pending = busyAction === action.key || state?.loading;
                return (
                  <button
                    key={action.key}
                    type="button"
                    className={action.primary ? 'is-primary' : undefined}
                    disabled={globallyDisabled || summaryBusy || !action.callback || state?.disabled || pending || Boolean(busyAction)}
                    title={state?.title}
                    onClick={() => void runAction(action)}
                  >
                    <span aria-hidden="true">{pending ? '…' : action.icon}</span>
                    {state?.label || action.label}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {currentView === 'comments' ? (
          <AnalysisView
            title="评论区总结"
            description="提取观众主要观点、情绪倾向和高赞讨论。"
            state={props.analyses?.comments}
            runLabel="分析评论"
            disabled={globallyDisabled}
            onRun={props.analysisCallbacks?.onRunComments}
            onCopy={props.analysisCallbacks?.onCopyComments}
            onSendFlomo={props.analysisCallbacks?.onSendCommentsFlomo}
            onExport={props.analysisCallbacks?.onExportComments}
          />
        ) : null}
        {currentView === 'danmaku' ? (
          <AnalysisView
            title="弹幕分析"
            description="查看高频关键词、热点片段和观众即时反馈。"
            state={props.analyses?.danmaku}
            runLabel="分析弹幕"
            disabled={globallyDisabled}
            onRun={props.analysisCallbacks?.onRunDanmaku}
            onCopy={props.analysisCallbacks?.onCopyDanmaku}
            onSendFlomo={props.analysisCallbacks?.onSendDanmakuFlomo}
            onExport={props.analysisCallbacks?.onExportDanmaku}
          />
        ) : null}
        {currentView === 'full-analysis' ? (
          <AnalysisView
            title="全面分析"
            description="结合字幕、评论和弹幕，生成完整的内容判断。"
            state={props.analyses?.fullAnalysis}
            runLabel="开始分析"
            disabled={globallyDisabled}
            onRun={props.analysisCallbacks?.onRunFullAnalysis}
            onCopy={props.analysisCallbacks?.onCopyFullAnalysis}
            onSendFlomo={props.analysisCallbacks?.onSendFullAnalysisFlomo}
            onExport={props.analysisCallbacks?.onExportFullAnalysis}
          />
        ) : null}
      </div>

      <section className="bvs-conversation" aria-label="连续追问">
        <header>
          <div>
            <strong>继续追问</strong>
            <span>答案会基于当前视频内容</span>
          </div>
          {conversationBusy && props.conversation?.onAbort ? (
            <button type="button" onClick={() => void props.conversation?.onAbort?.()}>停止</button>
          ) : null}
        </header>
        {props.conversation?.messages?.length ? (
          <div className="bvs-conversation-messages" aria-live="polite">
            {props.conversation.messages.map((message) => (
              <article key={message.id} className={`is-${message.role}${message.error ? ' is-error' : ''}`}>
                <span>{message.role === 'user' ? '我' : message.role === 'assistant' ? 'AI' : '系统'}</span>
                <div>
                  {message.role === 'user' ? <p>{message.content}</p> : <SafeMarkdown content={message.content} />}
                  {message.streaming ? <i className="bvs-stream-cursor" aria-label="正在输出" /> : null}
                  {message.model ? <small>{message.model}</small> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="bvs-conversation-hint">例如：这个结论在视频哪个时间段？有哪些可执行步骤？</p>
        )}
        <form onSubmit={(event) => void submitQuestion(event)}>
          <textarea
            value={question}
            rows={2}
            maxLength={4000}
            disabled={globallyDisabled || props.conversation?.disabled || conversationBusy}
            placeholder={props.conversation?.placeholder || '基于视频内容继续提问…'}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            type="submit"
            disabled={
              globallyDisabled ||
              props.conversation?.disabled ||
              conversationBusy ||
              !props.conversation?.onAsk ||
              !question.trim()
            }
          >
            {conversationBusy ? '回答中…' : '发送'}
          </button>
        </form>
      </section>

      {notice ? <p className="bvs-results-notice" role="status">{notice}</p> : null}
    </section>
  );
}
