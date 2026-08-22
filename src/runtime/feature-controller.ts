import {
  createEmptyAnalysisResult,
  type AnalysisKind,
  type AnalysisResultSnapshot,
  type ConversationTurn,
} from '../contracts/app-snapshot';
import {
  buildImagePrompt,
  buildPortableSummaryPrompt,
  dispatchImageGeneration,
  downloadGeneratedImage,
  downloadSubtitleSrt,
  downloadTranscript,
  isAbortError,
  sanitizeFilename,
  sendToFlomo,
  triggerDownload,
  callAiStream,
  type ChatMessage,
  type DownloadResult,
} from '../services';
import {
  buildSubtitleLocatorContext,
  fetchAllComments,
  fetchAllDanmaku,
  formatCommentsText,
  formatDanmakuText,
  insertPresetAndOpenImageUpload,
  insertSummaryIntoComment,
} from '../platform/bilibili';
import type { ConfigController } from './config-controller';
import type { AppController } from './app-controller';
import { buildFullAnalysisData } from './full-analysis';

function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

function markdownToPlainText(text: string): string {
  return String(text || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/^---$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function copyText(text: string): Promise<void> {
  if (!text.trim()) throw new Error('没有可复制的内容');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('浏览器拒绝复制，请手动复制');
}

function createTurn(role: 'user' | 'assistant', content: string, pending = false): ConversationTurn {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    ...(pending ? { pending: true } : {}),
  };
}

export class FeatureController {
  private conversationHistory: ChatMessage[] = [];

  constructor(
    private readonly app: AppController,
    private readonly config: ConfigController,
    private readonly isContextCurrent?: (contextKey: string) => boolean,
  ) {}

  resetForRouteChange(): void {
    this.conversationHistory = [];
  }

  async runAnalysis(kind: AnalysisKind): Promise<void> {
    const snapshot = this.app.getSnapshot();
    const video = snapshot.video;
    if (!video) throw new Error('请先解析当前视频');
    const generation = snapshot.routeGeneration;
    const contextKey = snapshot.contextKey;
    const controller = this.app.createTaskController();
    this.updateAnalysis(kind, {
      ...createEmptyAnalysisResult(),
      status: 'loading',
      statusMessage: kind === 'comments' ? '正在获取评论…' : kind === 'danmaku' ? '正在获取弹幕…' : '正在准备全面分析数据…',
    });
    this.app.update({ activeResult: kind, panelOpen: true });

    try {
      const config = this.config.getSnapshot().config;
      const isCurrent = () => this.isCurrent(generation, contextKey);
      if (kind === 'comments') {
        const comments = await fetchAllComments(video.aid, controller.signal, {
          maxPages: config.commentMaxPages,
          commentLimit: config.commentLimit,
          minDelayMs: config.commentMinDelay,
          maxDelayMs: config.commentMaxDelay,
          isCurrent,
          onStatus: (statusMessage) => this.patchAnalysis(kind, { statusMessage }),
        });
        if (!comments.length) throw new Error('该视频没有可分析的评论');
        const rawText = formatCommentsText(comments);
        await this.streamAnalysis(
          kind,
          `${config.commentPromptText}\n\n评论内容如下：\n`,
          rawText,
          comments.length,
          generation,
          contextKey,
          controller.signal,
        );
        return;
      }

      if (kind === 'danmaku') {
        const danmaku = await fetchAllDanmaku(video.cid, controller.signal, {
          isCurrent,
          onStatus: (statusMessage) => this.patchAnalysis(kind, { statusMessage }),
        });
        if (!danmaku.length) throw new Error('该视频没有可分析的弹幕');
        const rawText = formatDanmakuText(danmaku);
        await this.streamAnalysis(
          kind,
          `${config.danmakuPromptText}\n\n弹幕内容如下：\n`,
          rawText,
          danmaku.length,
          generation,
          contextKey,
          controller.signal,
        );
        return;
      }

      const [danmaku, comments] = await Promise.all([
        video.cid
          ? fetchAllDanmaku(video.cid, controller.signal, {
              isCurrent,
              onStatus: (message) => this.patchAnalysis(kind, { statusMessage: message }),
            }).catch((error) => {
              if (isAbortError(error)) throw error;
              return [];
            })
          : Promise.resolve([]),
        video.aid
          ? fetchAllComments(video.aid, controller.signal, {
              maxPages: config.commentMaxPages,
              commentLimit: config.commentLimit,
              minDelayMs: config.commentMinDelay,
              maxDelayMs: config.commentMaxDelay,
              isCurrent,
              onStatus: (message) => this.patchAnalysis(kind, { statusMessage: message }),
            }).catch((error) => {
              if (isAbortError(error)) throw error;
              return [];
            })
          : Promise.resolve([]),
      ]);
      if (!danmaku.length && !comments.length && !snapshot.subtitleSegments.length && !snapshot.transcript) {
        throw new Error('未获取到字幕、弹幕或评论数据');
      }
      const fullData = buildFullAnalysisData(
        video,
        snapshot.subtitleSegments,
        danmaku,
        comments,
        snapshot.transcript,
      );
      await this.streamAnalysis(
        kind,
        `${config.fullAnalysisPromptText}\n\n以下是完整数据：\n`,
        fullData.text,
        fullData.subtitleCount + fullData.danmakuCount + fullData.commentCount,
        generation,
        contextKey,
        controller.signal,
      );
    } catch (error) {
      if (this.isCurrent(generation, contextKey)) {
        this.finishAnalysisWithError(kind, error);
      }
    }
  }

  async ask(question: string): Promise<void> {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) return;
    const snapshot = this.app.getSnapshot();
    if (!snapshot.summary && !Object.values(snapshot.analyses).some((item) => item.text)) {
      throw new Error('请先完成摘要或内容分析');
    }

    const generation = snapshot.routeGeneration;
    const contextKey = snapshot.contextKey;
    const controller = this.app.createTaskController();
    if (!this.conversationHistory.length) this.conversationHistory = this.buildInitialConversation(snapshot);
    const locator = buildSubtitleLocatorContext(cleanQuestion, snapshot.subtitleSegments);
    const userContent = locator ? `${cleanQuestion}\n\n${locator}` : cleanQuestion;
    this.conversationHistory.push({ role: 'user', content: userContent });
    this.trimConversationHistory();

    const userTurn = createTurn('user', cleanQuestion);
    const assistantTurn = createTurn('assistant', '', true);
    this.app.update({ conversation: [...snapshot.conversation, userTurn, assistantTurn] });

    try {
      const config = this.config.getSnapshot().config;
      const reply = await callAiStream(
        this.conversationHistory,
        (fullText) => {
          if (!this.isCurrent(generation, contextKey)) return;
          this.replaceConversationTurn(assistantTurn.id, { content: fullText, pending: true });
        },
        {
          apiUrl: config.apiUrl,
          apiKey: config.apiKey,
          model: config.model,
          signal: controller.signal,
          maxTokens: config.summaryMaxTokens,
          enableThinking: config.enableThinking,
        },
      );
      if (!this.isCurrent(generation, contextKey)) return;
      this.conversationHistory.push({ role: 'assistant', content: reply });
      this.trimConversationHistory();
      this.replaceConversationTurn(assistantTurn.id, { content: reply, pending: false });
    } catch (error) {
      if (!this.isCurrent(generation, contextKey)) return;
      const interrupted = isAbortError(error);
      this.replaceConversationTurn(assistantTurn.id, {
        content: interrupted ? '已被用户打断' : error instanceof Error ? error.message : String(error),
        pending: false,
      });
    }
  }

  async copySummary(): Promise<void> {
    await copyText(markdownToPlainText(this.requireSummary()));
    this.feedback('success', '摘要已复制');
  }

  async copyPortablePrompt(): Promise<void> {
    const snapshot = this.app.getSnapshot();
    if (!snapshot.video || !snapshot.transcript.trim()) throw new Error('没有可复制的字幕内容');
    const config = this.config.getSnapshot().config;
    const preset = config.promptPresets.find((item) => item.id === config.activePresetId);
    const prompt = buildPortableSummaryPrompt({
      instruction: preset?.prompt || config.promptText,
      transcript: snapshot.transcript,
      video: {
        title: snapshot.video.title,
        collectionTitle: snapshot.video.collectionTitle,
        partTitle: snapshot.video.partTitle,
        page: snapshot.video.page,
        upName: snapshot.video.upName,
        desc: snapshot.video.description,
      },
      pageUrl: snapshot.video.pageUrl,
      hasTimeline: snapshot.subtitleSegments.length > 0,
    });
    await copyText(prompt);
    this.feedback('success', '提示词和当前分集字幕已复制');
  }

  async copyTextContent(text: string): Promise<void> {
    await copyText(markdownToPlainText(text));
    this.feedback('success', '内容已复制');
  }

  async copyImagePrompt(): Promise<void> {
    const config = this.config.getSnapshot().config;
    const prompt = buildImagePrompt(this.requireSummary(), config.imageGenPromptText);
    await copyText(prompt);
    this.app.update({
      generatedImage: { ...this.app.getSnapshot().generatedImage, prompt },
    });
    this.feedback('success', '生图提示词已复制');
  }

  async sendSummaryToFlomo(): Promise<void> {
    await this.sendTextToFlomo(this.requireSummary());
  }

  async sendTextToFlomo(text: string): Promise<void> {
    const snapshot = this.app.getSnapshot();
    const config = this.config.getSnapshot().config;
    const task = this.app.createTaskController();
    await sendToFlomo({
      webhookUrl: config.flomoApiUrl,
      summary: text.trim() || this.requireSummary(),
      video: snapshot.video || undefined,
      pageUrl: snapshot.video?.pageUrl,
      conversation: this.conversationHistory,
      model: config.model,
      tags: config.flomoTags,
      signal: task.signal,
    });
    this.feedback('success', '已发送到 Flomo');
  }

  async downloadAnalysisRaw(kind: AnalysisKind): Promise<void> {
    const snapshot = this.app.getSnapshot();
    const analysis = snapshot.analyses[kind];
    if (!analysis.rawText) throw new Error('没有可导出的分析原文');
    const labels: Record<AnalysisKind, string> = {
      comments: '评论原文',
      danmaku: '弹幕原文',
      full: '全面分析原文',
    };
    const title = sanitizeFilename(snapshot.video?.title || labels[kind]) || labels[kind];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const result = await triggerDownload(
      analysis.rawText,
      `${title}__${labels[kind]}__${timestamp}.txt`,
      'text/plain;charset=utf-8',
    );
    this.feedbackDownloadResult(result, '分析原文');
  }

  async downloadTranscript(): Promise<void> {
    const snapshot = this.app.getSnapshot();
    if (!snapshot.video || !snapshot.transcript) throw new Error('没有可下载的字幕');
    const result = await downloadTranscript(snapshot.transcript, snapshot.video);
    this.feedbackDownloadResult(result, '字幕');
  }

  async downloadSubtitleSrt(): Promise<void> {
    const snapshot = this.app.getSnapshot();
    if (!snapshot.video || !snapshot.subtitleSegments.length) throw new Error('当前字幕没有结构化时间轴');
    const result = await downloadSubtitleSrt(snapshot.subtitleSegments, snapshot.video);
    this.feedbackDownloadResult(result, 'SRT 字幕');
  }

  async generateImage(): Promise<void> {
    const snapshot = this.app.getSnapshot();
    const generation = snapshot.routeGeneration;
    const contextKey = snapshot.contextKey;
    const config = this.config.getSnapshot().config;
    const summary = this.requireSummary();
    const task = this.app.createTaskController();
    this.app.update({
      generatedImage: {
        status: 'loading',
        imageUrl: '',
        prompt: '',
        statusMessage: config.imageGenMode === 'flow' ? '正在发送到 Flow…' : '正在生成配图…',
        errorMessage: '',
        mode: config.imageGenMode,
      },
    });
    try {
      const result = await dispatchImageGeneration(summary, {
        mode: config.imageGenMode,
        apiUrl: config.imageGenApiUrl,
        apiKey: config.imageGenApiKey,
        fallbackApiUrl: config.apiUrl,
        fallbackApiKey: config.apiKey,
        model: config.imageGenModel,
        size: config.imageGenSize,
        signal: task.signal,
        promptTemplate: config.imageGenPromptText,
        flowUrl: config.flowProjectUrl,
        videoTitle: snapshot.video?.title,
        pageUrl: snapshot.video?.pageUrl,
        openFlowWhenOffline: config.enableFlowBackgroundOpen,
      });
      if (!this.isCurrent(generation, contextKey)) return;
      if (result.mode === 'flow') {
        this.app.update({
          generatedImage: {
            status: 'ready',
            imageUrl: '',
            prompt: result.prompt,
            statusMessage: result.dispatch.receiverAlive ? '已发送到在线 Flow 接收端' : '已创建 Flow 生图任务',
            errorMessage: '',
            mode: 'flow',
          },
        });
        return;
      }
      this.app.update({
        generatedImage: {
          status: 'ready',
          imageUrl: result.imageDataUrl,
          prompt: result.prompt,
          statusMessage: '配图生成完成',
          errorMessage: '',
          mode: 'api',
        },
      });
      if (config.enableImageAutoDownload && snapshot.video && result.imageDataUrl.startsWith('data:')) {
        await downloadGeneratedImage(result.imageDataUrl, snapshot.video, '_总结', {
          useDirectory: true,
          allowDirectoryPicker: false,
          allowFilePicker: false,
          directorySubdirectory: '图片',
        });
      }
    } catch (error) {
      if (!this.isCurrent(generation, contextKey)) return;
      this.app.update({
        generatedImage: {
          ...this.app.getSnapshot().generatedImage,
          status: isAbortError(error) ? 'interrupted' : 'error',
          statusMessage: '',
          errorMessage: isAbortError(error) ? '生图已被打断' : error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  async saveGeneratedImage(): Promise<void> {
    const snapshot = this.app.getSnapshot();
    if (!snapshot.video || !snapshot.generatedImage.imageUrl) throw new Error('没有可保存的图片');
    const result = await downloadGeneratedImage(snapshot.generatedImage.imageUrl, snapshot.video);
    if (result === 'failed' && /^https?:\/\//.test(snapshot.generatedImage.imageUrl)) {
      window.open(snapshot.generatedImage.imageUrl, '_blank', 'noopener,noreferrer');
      this.feedback('info', '远程图片已在新窗口打开，请手动保存');
      return;
    }
    this.feedbackDownloadResult(result, '图片');
  }

  async insertSummaryIntoComment(): Promise<void> {
    const snapshot = this.app.getSnapshot();
    const config = this.config.getSnapshot().config;
    const task = this.app.createTaskController();
    await insertSummaryIntoComment(this.requireSummary(), {
      signal: task.signal,
      expectedContextKey: snapshot.contextKey,
      isCurrent: () => this.isCurrent(snapshot.routeGeneration, snapshot.contextKey),
      autoSubmit: config.autoSubmitCommentSummary,
    });
    this.feedback('success', config.autoSubmitCommentSummary ? '摘要已提交到评论区' : '摘要已填入评论框');
  }

  async fillGeneratedImageComment(): Promise<void> {
    const snapshot = this.app.getSnapshot();
    if (!snapshot.generatedImage.imageUrl) throw new Error('请先生成配图');
    const config = this.config.getSnapshot().config;
    const task = this.app.createTaskController();
    const result = await insertPresetAndOpenImageUpload(config.commentTextPresets, {
      signal: task.signal,
      expectedContextKey: snapshot.contextKey,
      isCurrent: () => this.isCurrent(snapshot.routeGeneration, snapshot.contextKey),
    });
    this.feedback(
      result.uploadOpened ? 'success' : 'info',
      result.uploadOpened ? '已填入评论并打开图片上传，请选择刚生成的图片' : '已填入评论，但未找到图片上传按钮',
    );
  }

  private async streamAnalysis(
    kind: AnalysisKind,
    promptPrefix: string,
    rawText: string,
    itemCount: number,
    generation: number,
    contextKey: string,
    signal: AbortSignal,
  ): Promise<void> {
    const config = this.config.getSnapshot().config;
    const limited = truncateText(rawText, config.fullDataMaxChars);
    this.patchAnalysis(kind, {
      status: 'streaming',
      rawText,
      itemCount,
      truncated: limited.truncated,
      statusMessage: `已准备 ${itemCount} 条数据，AI 正在分析…`,
    });
    const reply = await callAiStream(
      [{ role: 'user', content: `${promptPrefix}${limited.text}` }],
      (fullText) => {
        if (this.isCurrent(generation, contextKey)) {
          this.patchAnalysis(kind, { text: fullText });
        }
      },
      {
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
        model: config.model,
        signal,
        maxTokens: config.summaryMaxTokens,
        enableThinking: config.enableThinking,
      },
    );
    if (!this.isCurrent(generation, contextKey)) return;
    this.patchAnalysis(kind, {
      status: 'ready',
      text: reply,
      statusMessage: '',
      errorMessage: '',
    });
  }

  private finishAnalysisWithError(kind: AnalysisKind, error: unknown): void {
    const interrupted = isAbortError(error);
    this.patchAnalysis(kind, {
      status: interrupted ? 'interrupted' : 'error',
      statusMessage: '',
      errorMessage: interrupted ? '已被用户打断' : error instanceof Error ? error.message : String(error),
    });
  }

  private isCurrent(generation: number, contextKey: string): boolean {
    return this.app.isGenerationCurrent(generation, contextKey)
      && (!this.isContextCurrent || this.isContextCurrent(contextKey));
  }

  private buildInitialConversation(snapshot: ReturnType<AppController['getSnapshot']>): ChatMessage[] {
    const parts = [
      '你是一个 B站视频分析助手。请只基于下面提供的当前分集内容回答，不能把课程其他分集混入答案。',
    ];
    if (snapshot.video) {
      parts.push(
        `当前视频: ${snapshot.video.bvid}`,
        `当前分集: P${snapshot.video.page} ${snapshot.video.partTitle || snapshot.video.title}`,
        `当前 CID: ${snapshot.video.cid}`,
      );
    }
    if (snapshot.summary) parts.push('', '【当前分集摘要】', snapshot.summary);
    if (snapshot.transcript) {
      const maxChars = this.config.getSnapshot().config.fullDataMaxChars;
      parts.push('', '【当前分集字幕】', snapshot.transcript.slice(0, maxChars));
    }
    for (const [kind, result] of Object.entries(snapshot.analyses)) {
      if (result.text) parts.push('', `【${kind}分析】`, result.text);
      if (result.rawText) {
        const maxRawChars = Math.min(
          24_000,
          this.config.getSnapshot().config.fullDataMaxChars,
        );
        parts.push('', `【${kind}原始数据】`, result.rawText.slice(0, maxRawChars));
      }
    }
    return [
      { role: 'user', content: parts.join('\n') },
      { role: 'assistant', content: '已加载当前分集内容，可以继续提问。' },
    ];
  }

  private trimConversationHistory(maxMessages = 21): void {
    if (this.conversationHistory.length <= maxMessages) return;
    const initialContext = this.conversationHistory.slice(0, 2);
    const recent = this.conversationHistory.slice(-(maxMessages - initialContext.length));
    this.conversationHistory = [...initialContext, ...recent];
  }

  private requireSummary(): string {
    const summary = this.app.getSnapshot().summary.trim();
    if (!summary) throw new Error('请先生成视频摘要');
    return summary;
  }

  private feedbackDownloadResult(result: DownloadResult | false, label: string): void {
    if (result === 'downloaded') {
      this.feedback('success', `${label}已保存`);
      return;
    }
    if (result === 'started') {
      this.feedback('success', `${label}下载已启动`);
      return;
    }
    if (result === 'cancelled') {
      this.feedback('info', `已取消${label}保存`);
      return;
    }
    if (result === 'needs-directory') {
      this.feedback('info', `${label}自动保存需要先授权下载目录`);
      return;
    }
    if (result === 'needs-interaction') {
      this.feedback('info', `${label}需要点击下载按钮后保存`);
      return;
    }
    this.feedback('error', `${label}保存失败`);
  }

  private updateAnalysis(kind: AnalysisKind, value: AnalysisResultSnapshot): void {
    const snapshot = this.app.getSnapshot();
    this.app.update({ analyses: { ...snapshot.analyses, [kind]: value } });
  }

  private patchAnalysis(kind: AnalysisKind, patch: Partial<AnalysisResultSnapshot>): void {
    const snapshot = this.app.getSnapshot();
    this.app.update({
      analyses: {
        ...snapshot.analyses,
        [kind]: { ...snapshot.analyses[kind], ...patch },
      },
    });
  }

  private replaceConversationTurn(id: string, patch: Partial<ConversationTurn>): void {
    this.app.update({
      conversation: this.app.getSnapshot().conversation.map((turn) =>
        turn.id === id ? { ...turn, ...patch } : turn,
      ),
    });
  }

  private feedback(type: 'info' | 'success' | 'error', message: string): void {
    this.app.update({ actionFeedback: { type, message, createdAt: Date.now() } });
  }
}
