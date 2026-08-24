import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  APP_ICONS,
  getPresetIcon,
  RESULT_ACTION_ICONS,
  RESULT_VIEW_ICONS,
  UiIcon,
  type UiIconComponent,
} from '../icons';
import { UiSelect } from '../components/UiSelect';
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
  icon: UiIconComponent;
  label: string;
  callback?: ResultAsyncCallback;
}

const VIEW_ITEMS: Array<{ id: ResultsView; label: string; icon: UiIconComponent }> = [
  { id: 'summary', label: '摘要', icon: RESULT_VIEW_ICONS.summary },
  { id: 'comments', label: '评论', icon: RESULT_VIEW_ICONS.comments },
  { id: 'danmaku', label: '弹幕', icon: RESULT_VIEW_ICONS.danmaku },
  { id: 'full-analysis', label: '全面分析', icon: RESULT_VIEW_ICONS['full-analysis'] },
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
      <UiIcon className="bvs-results-spinner" icon={APP_ICONS.loading} size={21} />
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
      <span aria-hidden="true"><UiIcon icon={APP_ICONS.empty} size={24} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="bvs-results-error" role="alert">
      <span aria-hidden="true"><UiIcon icon={APP_ICONS.warning} size={18} /></span>
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
              <button type="button" disabled={!onCopy} onClick={() => void onCopy?.()}>
                <UiIcon icon={RESULT_ACTION_ICONS.copy} size={15} />复制
              </button>
              <button type="button" disabled={!onSendFlomo} onClick={() => void onSendFlomo?.()}>
                <UiIcon icon={RESULT_ACTION_ICONS.flomo} size={15} />发送 Flomo
              </button>
              <button type="button" disabled={!onExport} onClick={() => void onExport?.()}>
                <UiIcon icon={RESULT_ACTION_ICONS['download-txt']} size={15} />导出原文
              </button>
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreMenuStyle, setMoreMenuStyle] = useState<CSSProperties>();
  const [conversationOpen, setConversationOpen] = useState(Boolean(props.conversation?.messages?.length));
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const conversationInputRef = useRef<HTMLTextAreaElement>(null);
  const currentView = props.activeView || uncontrolledView;
  const globallyDisabled = props.disabled === true;
  const summaryBusy = props.status === 'loading' || props.status === 'streaming';
  const imageSource = safeImageSource(props.imageUrl);

  const actions = useMemo<ActionDefinition[]>(
    () => {
      const definitions: ActionDefinition[] = [
      { key: 'copy', icon: RESULT_ACTION_ICONS.copy, label: '复制摘要', callback: props.actions?.onCopy },
      { key: 'edit-summary', icon: RESULT_ACTION_ICONS['edit-summary'], label: '编辑摘要', callback: props.actions?.onEditSummary },
      { key: 'regenerate', icon: RESULT_ACTION_ICONS.regenerate, label: '重新生成', callback: props.actions?.onRegenerate },
      { key: 'insert-comment', icon: RESULT_ACTION_ICONS['insert-comment'], label: '插入评论', callback: props.actions?.onInsertComment },
      { key: 'flomo', icon: RESULT_ACTION_ICONS.flomo, label: '发送 Flomo', callback: props.actions?.onSendFlomo },
      { key: 'download-txt', icon: RESULT_ACTION_ICONS['download-txt'], label: '下载字幕', callback: props.actions?.onDownloadTranscript },
      { key: 'download-srt', icon: RESULT_ACTION_ICONS['download-srt'], label: '下载 SRT', callback: props.actions?.onDownloadSrt },
      { key: 'generate-image', icon: RESULT_ACTION_ICONS['generate-image'], label: imageSource ? '重新生图' : '生成配图', callback: props.actions?.onGenerateImage },
      { key: 'copy-image-prompt', icon: RESULT_ACTION_ICONS['copy-image-prompt'], label: '复制生图词', callback: props.actions?.onCopyImagePrompt },
      { key: 'save-image', icon: RESULT_ACTION_ICONS['save-image'], label: '保存图片', callback: props.actions?.onSaveImage },
      { key: 'fill-image-comment', icon: RESULT_ACTION_ICONS['fill-image-comment'], label: '图片发评论', callback: props.actions?.onFillImageComment },
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
    setMoreOpen(false);
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
  const primaryActions = actions.filter((action) => (
    (action.key === 'copy' || action.key === 'regenerate')
    && !props.actionAvailability?.[action.key]?.hidden
  ));
  const secondaryActions = actions.filter((action) => (
    action.key !== 'copy'
    && action.key !== 'regenerate'
    && !props.actionAvailability?.[action.key]?.hidden
  ));

  useEffect(() => {
    if (!moreOpen) return undefined;
    const closeMenu = (event: MouseEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (props.conversation?.messages?.length) setConversationOpen(true);
  }, [props.conversation?.messages?.length]);

  const openConversation = () => {
    setConversationOpen(true);
    window.setTimeout(() => conversationInputRef.current?.focus(), 0);
  };

  const toggleMoreMenu = () => {
    if (moreOpen) {
      setMoreOpen(false);
      return;
    }
    const rect = moreMenuRef.current?.getBoundingClientRect();
    if (rect) {
      const menuWidth = 190;
      const menuHeight = Math.min(300, secondaryActions.length * 36 + 10);
      const canOpenAbove = rect.top >= menuHeight + 16;
      setMoreMenuStyle({
        left: `${Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12))}px`,
        top: `${canOpenAbove
          ? rect.top - menuHeight - 7
          : Math.min(rect.bottom + 7, window.innerHeight - menuHeight - 12)}px`,
        maxHeight: `${menuHeight}px`,
      });
    }
    setMoreOpen(true);
  };

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
        {props.model ? (
          <span className="bvs-results-model" title={props.model}>
            <UiIcon icon={APP_ICONS.model} size={13} />{props.model}
          </span>
        ) : null}
      </div>

      {props.presets?.length ? (
        <div className="bvs-preset-section">
          <span>摘要风格</span>
          <UiSelect
            className="bvs-results-preset-select"
            ariaLabel="摘要风格"
            value={props.activePresetId || props.presets[0]?.id || ''}
            disabled={globallyDisabled || summaryBusy || Boolean(presetBusy)}
            options={props.presets.map((preset) => ({
              value: preset.id,
              label: preset.name,
              description: preset.prompt ? preset.prompt.slice(0, 56) : undefined,
              icon: getPresetIcon(preset.id),
            }))}
            onChange={(presetId) => void switchPreset(presetId)}
          />
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
            <UiIcon icon={view.icon} size={15} />
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
                <UiIcon icon={APP_ICONS.portablePrompt} size={15} />
                复制提示词 + 当前分集字幕
              </button>
            ) : null}
            {summaryBusy && props.onAbortSummary ? (
              <button className="bvs-abort-button" type="button" onClick={() => void props.onAbortSummary?.()}>
                <UiIcon icon={APP_ICONS.stop} size={14} />
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

            <div className="bvs-result-toolbar" aria-label="摘要操作">
              {primaryActions.map((action) => {
                const state = props.actionAvailability?.[action.key];
                const pending = busyAction === action.key || state?.loading;
                return (
                  <button
                    key={action.key}
                    type="button"
                    className={action.key === 'copy' ? 'is-primary' : undefined}
                    disabled={globallyDisabled || summaryBusy || !action.callback || state?.disabled || pending || Boolean(busyAction)}
                    title={state?.title}
                    onClick={() => void runAction(action)}
                  >
                    <UiIcon
                      className={pending ? 'is-spinning' : undefined}
                      icon={pending ? APP_ICONS.loading : action.icon}
                      size={15}
                    />
                    {state?.label || action.label}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={globallyDisabled || !props.conversation?.onAsk}
                onClick={openConversation}
              >
                <UiIcon icon={APP_ICONS.chat} size={15} />继续追问
              </button>
              {secondaryActions.length ? (
                <div className="bvs-more-actions" ref={moreMenuRef}>
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                    onClick={toggleMoreMenu}
                  >
                    <UiIcon icon={APP_ICONS.more} size={17} />更多
                  </button>
                  {moreOpen ? (
                    <div className="bvs-more-menu" role="menu" style={moreMenuStyle}>
                      {secondaryActions.map((action) => {
                        const state = props.actionAvailability?.[action.key];
                        const pending = busyAction === action.key || state?.loading;
                        return (
                          <button
                            key={action.key}
                            type="button"
                            role="menuitem"
                            disabled={globallyDisabled || summaryBusy || !action.callback || state?.disabled || pending || Boolean(busyAction)}
                            title={state?.title}
                            onClick={() => void runAction(action)}
                          >
                            <UiIcon
                              className={pending ? 'is-spinning' : undefined}
                              icon={pending ? APP_ICONS.loading : action.icon}
                              size={15}
                            />
                            {state?.label || action.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
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

      <section className={`bvs-conversation${conversationOpen ? ' is-open' : ''}`} aria-label="连续追问">
        <button
          type="button"
          className="bvs-conversation-toggle"
          aria-expanded={conversationOpen}
          onClick={() => setConversationOpen((open) => !open)}
        >
          <div>
            <UiIcon icon={APP_ICONS.chat} size={17} />
            <span>
            <strong>继续追问</strong>
              <small>答案基于当前分集内容</small>
            </span>
          </div>
          <UiIcon icon={APP_ICONS.expand} size={16} />
        </button>
        {conversationOpen ? <div className="bvs-conversation-body">
        {conversationBusy && props.conversation?.onAbort ? (
          <button className="bvs-conversation-stop" type="button" onClick={() => void props.conversation?.onAbort?.()}>
            <UiIcon icon={APP_ICONS.stop} size={13} />停止回答
          </button>
        ) : null}
        {props.conversation?.messages?.length ? (
          <div className="bvs-conversation-messages" aria-live="polite">
            {props.conversation.messages.map((message) => (
              <article key={message.id} className={`is-${message.role}${message.error ? ' is-error' : ''}`}>
                <span>
                  <UiIcon
                    icon={message.role === 'user'
                      ? APP_ICONS.user
                      : message.role === 'assistant'
                        ? APP_ICONS.assistant
                        : APP_ICONS.info}
                    size={14}
                  />
                </span>
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
            ref={conversationInputRef}
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
            <UiIcon
              className={conversationBusy ? 'is-spinning' : undefined}
              icon={conversationBusy ? APP_ICONS.loading : APP_ICONS.send}
              size={15}
            />
            {conversationBusy ? '回答中' : '发送'}
          </button>
        </form>
        </div> : null}
      </section>

      {notice ? <p className="bvs-results-notice" role="status">{notice}</p> : null}
    </section>
  );
}
