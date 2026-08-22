import type { SummaryRequest, SummaryService } from '../contracts/runtime';
import type { ConfigController } from './config-controller';
import { DEFAULT_CONFIG } from '../config';
import { checkApiConfigured, requestSummary } from '../services';

const SUMMARY_LENGTH_ERROR_MESSAGE = 'AI 输出被截断：finish_reason=length。请在设置中调大摘要最大输出 tokens，或更换支持更大输出上限的模型/API。';

export class RuntimeSummaryService implements SummaryService {
  constructor(private readonly configController: ConfigController) {}

  async summarize(
    request: SummaryRequest,
    options: {
      signal: AbortSignal;
      onDelta?: (text: string) => void;
    },
  ): Promise<string> {
    const config = this.configController.getSnapshot().config;
    const connection = checkApiConfigured(config, {
      apiUrl: DEFAULT_CONFIG.apiUrl,
      apiKey: DEFAULT_CONFIG.apiKey,
    });
    if (!connection.configured) {
      throw new Error(`${connection.reason}。你仍可复制“提示词 + 当前分集字幕”到其他 AI 使用。`);
    }
    const result = await requestSummary({
      instruction: request.prompt,
      transcript: request.transcript,
      video: {
        title: request.context.title,
        collectionTitle: request.context.collectionTitle,
        partTitle: request.context.partTitle,
        page: request.context.page,
        upName: request.context.upName,
        desc: request.context.description,
      },
      pageUrl: request.context.pageUrl,
      hasTimeline: request.segments.length > 0,
      maxTranscriptChars: config.fullDataMaxChars,
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      model: request.model,
      signal: options.signal,
      maxTokens: config.summaryMaxTokens,
      enableThinking: config.enableThinking,
      lengthErrorMessage: SUMMARY_LENGTH_ERROR_MESSAGE,
      onDelta: (fullText) => options.onDelta?.(fullText),
    });
    return result.summary;
  }
}
