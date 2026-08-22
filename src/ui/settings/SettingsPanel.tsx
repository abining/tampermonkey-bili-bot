import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  createApiProfileId,
  type ApiProfile,
  type AppConfig,
  type PromptPreset,
  type ResultActionButtonId,
} from '../../config';
import { cloneJson } from '../../utils';
import type { SettingsPanelProps } from './types';

type SettingsSectionId =
  | 'general'
  | 'ai'
  | 'summary'
  | 'analysis'
  | 'image'
  | 'services'
  | 'data';

interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  icon: string;
  description: string;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'general', label: '通用', icon: '⚙', description: '自动解析与基础行为' },
  { id: 'ai', label: 'AI 与模型', icon: '✦', description: '接口、密钥与模型配置' },
  { id: 'summary', label: '摘要模板', icon: '▤', description: '摘要风格与提示词' },
  { id: 'analysis', label: '内容分析', icon: '◎', description: '评论、弹幕与全面分析' },
  { id: 'image', label: '配图', icon: '▧', description: 'API 生图与 Google Flow' },
  { id: 'services', label: '第三方服务', icon: '↗', description: 'Flomo 与评论发送' },
  { id: 'data', label: '数据与界面', icon: '◫', description: '按钮、缓存与配置文件' },
];

const RESULT_ACTION_LABELS: Record<ResultActionButtonId, string> = {
  copy_summary: '复制摘要',
  edit_summary: '编辑摘要',
  generate_image: '生成配图',
  copy_image_prompt: '复制生图提示词',
  post_comment: '摘要发评论',
  send_flomo: '发送到 Flomo',
  download_transcript: '下载字幕 TXT',
  download_srt: '下载字幕 SRT',
  save_image: '保存图片',
  fill_image_comment: '填字并打开图片上传',
};

function cloneConfig(config: AppConfig): AppConfig {
  return cloneJson(config);
}

function createPreset(prefix: string, index: number): PromptPreset {
  return {
    id: `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: `新模板 ${index}`,
    icon: '📄',
    prompt: '',
  };
}

function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`bvs-settings-field${wide ? ' is-wide' : ''}`}>
      <span className="bvs-settings-field-label">{label}</span>
      {children}
      {hint ? <span className="bvs-settings-field-hint">{hint}</span> : null}
    </label>
  );
}

function SwitchField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="bvs-settings-switch-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}

function SectionHeader({ section }: { section: SettingsSection }) {
  return (
    <header className="bvs-settings-section-header">
      <span className="bvs-settings-section-icon" aria-hidden="true">{section.icon}</span>
      <div>
        <h3>{section.label}</h3>
        <p>{section.description}</p>
      </div>
    </header>
  );
}

interface PresetEditorProps {
  title: string;
  presets: PromptPreset[];
  activeId: string;
  idPrefix: string;
  onChange(presets: PromptPreset[], activeId: string): void;
}

function PresetEditor({
  title,
  presets,
  activeId,
  idPrefix,
  onChange,
}: PresetEditorProps) {
  const activePreset = presets.find((preset) => preset.id === activeId) || presets[0];

  const updatePreset = (patch: Partial<PromptPreset>) => {
    if (!activePreset) return;
    onChange(
      presets.map((preset) => (
        preset.id === activePreset.id ? { ...preset, ...patch } : preset
      )),
      activePreset.id,
    );
  };

  const addPreset = () => {
    const preset = createPreset(idPrefix, presets.length + 1);
    onChange([...presets, preset], preset.id);
  };

  const removePreset = () => {
    if (!activePreset || presets.length <= 1) return;
    const next = presets.filter((preset) => preset.id !== activePreset.id);
    onChange(next, next[0].id);
  };

  const movePreset = (offset: -1 | 1) => {
    if (!activePreset) return;
    const index = presets.findIndex((preset) => preset.id === activePreset.id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= presets.length) return;
    const next = presets.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next, activePreset.id);
  };

  return (
    <div className="bvs-settings-preset-editor">
      <div className="bvs-settings-subheading">
        <div>
          <strong>{title}</strong>
          <small>选择模板后可编辑名称、图标和完整提示词。</small>
        </div>
        <button type="button" className="bvs-settings-text-button" onClick={addPreset}>
          ＋ 新建
        </button>
      </div>
      <div className="bvs-settings-preset-layout">
        <div className="bvs-settings-preset-list" role="listbox" aria-label={title}>
          {presets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              className={preset.id === activePreset?.id ? 'is-active' : ''}
              onClick={() => onChange(presets, preset.id)}
              role="option"
              aria-selected={preset.id === activePreset?.id}
            >
              <span>{preset.icon || '📄'}</span>
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
        {activePreset ? (
          <div className="bvs-settings-preset-form">
            <div className="bvs-settings-inline-fields">
              <Field label="图标">
                <input
                  value={activePreset.icon}
                  maxLength={8}
                  onChange={(event) => updatePreset({ icon: event.currentTarget.value })}
                />
              </Field>
              <Field label="模板名称" wide>
                <input
                  value={activePreset.name}
                  onChange={(event) => updatePreset({ name: event.currentTarget.value })}
                />
              </Field>
            </div>
            <Field label="提示词" wide>
              <textarea
                rows={10}
                value={activePreset.prompt}
                onChange={(event) => updatePreset({ prompt: event.currentTarget.value })}
              />
            </Field>
            <div className="bvs-settings-preset-actions">
              <button type="button" onClick={() => movePreset(-1)}>上移</button>
              <button type="button" onClick={() => movePreset(1)}>下移</button>
              <button
                type="button"
                className="is-danger"
                disabled={presets.length <= 1}
                onClick={removePreset}
              >
                删除模板
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsPanel({
  config,
  cacheStats,
  busy = false,
  onSave,
  onCancel,
  onImport,
  onExport,
  onReset,
  onFetchModels,
  onClearSummaryCache,
}: SettingsPanelProps) {
  const [draft, setDraft] = useState<AppConfig>(() => cloneConfig(config));
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showImageApiKey, setShowImageApiKey] = useState(false);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const modelListId = useId();

  useEffect(() => {
    setDraft(cloneConfig(config));
    setErrorMessage('');
  }, [config]);

  const activeProfile = useMemo(
    () => draft.apiProfiles.find(
      (profile) => profile.id === draft.activeApiProfileId,
    ) || draft.apiProfiles[0],
    [draft.apiProfiles, draft.activeApiProfileId],
  );

  const currentSection = SETTINGS_SECTIONS.find(
    (section) => section.id === activeSection,
  ) || SETTINGS_SECTIONS[0];
  const isBusy = busy || submitting;

  const updateConfig = <Key extends keyof AppConfig>(
    key: Key,
    value: AppConfig[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateProfile = (patch: Partial<ApiProfile>) => {
    if (!activeProfile) return;
    setDraft((current) => ({
      ...current,
      apiProfiles: current.apiProfiles.map((profile) => (
        profile.id === activeProfile.id ? { ...profile, ...patch } : profile
      )),
    }));
  };

  const selectProfile = (profileId: string) => {
    setDraft((current) => ({ ...current, activeApiProfileId: profileId }));
    setShowApiKey(false);
  };

  const addProfile = () => {
    const profile: ApiProfile = {
      id: createApiProfileId(),
      name: `配置 ${draft.apiProfiles.length + 1}`,
      apiUrl: '',
      apiKey: '',
      model: '',
      modelList: [],
    };
    setDraft((current) => ({
      ...current,
      activeApiProfileId: profile.id,
      apiProfiles: [...current.apiProfiles, profile],
    }));
    setShowApiKey(false);
  };

  const duplicateProfile = () => {
    if (!activeProfile) return;
    const profile = {
      ...cloneJson(activeProfile),
      id: createApiProfileId(),
      name: `${activeProfile.name} 副本`,
    };
    setDraft((current) => ({
      ...current,
      activeApiProfileId: profile.id,
      apiProfiles: [...current.apiProfiles, profile],
    }));
  };

  const removeProfile = () => {
    if (!activeProfile || draft.apiProfiles.length <= 1) return;
    setDraft((current) => {
      const apiProfiles = current.apiProfiles.filter(
        (profile) => profile.id !== activeProfile.id,
      );
      return {
        ...current,
        apiProfiles,
        activeApiProfileId: apiProfiles[0].id,
      };
    });
    setShowApiKey(false);
  };

  const createConfigForSave = (): AppConfig => {
    const next = cloneConfig(draft);
    const profile = next.apiProfiles.find(
      (item) => item.id === next.activeApiProfileId,
    ) || next.apiProfiles[0];
    if (profile) {
      next.activeApiProfileId = profile.id;
      next.apiUrl = profile.apiUrl;
      next.apiKey = profile.apiKey;
      next.model = profile.model;
      next.modelList = profile.modelList.slice();
    }
    const summaryPreset = next.promptPresets.find(
      (preset) => preset.id === next.activePresetId,
    );
    if (summaryPreset) next.promptText = summaryPreset.prompt;
    const fullPreset = next.fullAnalysisPresets.find(
      (preset) => preset.id === next.activeFullAnalysisPresetId,
    );
    if (fullPreset) next.fullAnalysisPromptText = fullPreset.prompt;
    return next;
  };

  const runAction = async (action: () => void | Promise<void>) => {
    if (isBusy) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      await action();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '操作失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const importDraft = () => runAction(async () => {
    const imported = await onImport();
    if (imported) setDraft(cloneConfig(imported));
  });

  const resetDraft = () => runAction(async () => {
    const reset = await onReset();
    if (reset) {
      setDraft(cloneConfig(reset));
      setShowApiKey(false);
      setShowImageApiKey(false);
    }
  });

  const fetchActiveProfileModels = () => runAction(async () => {
    if (!activeProfile || !onFetchModels) return;
    const models = await onFetchModels(activeProfile);
    if (!models.length) throw new Error('接口没有返回可用模型');
    setDraft((current) => ({
      ...current,
      apiProfiles: current.apiProfiles.map((profile) => (
        profile.id === activeProfile.id
          ? {
              ...profile,
              model: profile.model || models[0],
              modelList: models,
            }
          : profile
      )),
    }));
  });

  const renderGeneral = () => (
    <div className="bvs-settings-card-stack">
      <div className="bvs-settings-card">
        <SwitchField
          label="自动解析"
          description="进入视频页后自动获取字幕并开始生成摘要。"
          checked={draft.autoParse}
          onChange={(checked) => updateConfig('autoParse', checked)}
        />
        <SwitchField
          label="处理时自动展开"
          description="自动任务开始后立即展开主面板，否则只显示悬浮按钮。"
          checked={draft.autoOpenPanelWhileProcessing}
          onChange={(checked) => updateConfig('autoOpenPanelWhileProcessing', checked)}
        />
        <SwitchField
          label="深度思考"
          description="关闭后会向兼容 API 发送禁用 thinking 的参数。"
          checked={draft.enableThinking}
          onChange={(checked) => updateConfig('enableThinking', checked)}
        />
        <SwitchField
          label="自动下载字幕"
          description="字幕获取成功后尝试保存到已授权目录。"
          checked={draft.enableAutoDownloadSubtitle}
          onChange={(checked) => updateConfig('enableAutoDownloadSubtitle', checked)}
        />
      </div>
      <div className="bvs-settings-card bvs-settings-grid">
        <Field label="跳过短视频（秒）" hint="短于该时长的视频不自动生成摘要。">
          <input
            type="number"
            min={0}
            value={draft.skipDuration}
            onChange={(event) => updateConfig('skipDuration', Number(event.currentTarget.value))}
          />
        </Field>
        <Field label="摘要最大输出 tokens" hint="旧脚本允许范围为 500–30000。">
          <input
            type="number"
            min={500}
            max={30000}
            value={draft.summaryMaxTokens}
            onChange={(event) => updateConfig('summaryMaxTokens', Number(event.currentTarget.value))}
          />
        </Field>
      </div>
    </div>
  );

  const renderAi = () => (
    <div className="bvs-settings-profile-layout">
      <aside className="bvs-settings-profile-list">
        <div className="bvs-settings-profile-list-header">
          <strong>API 配置</strong>
          <button type="button" onClick={addProfile} title="新增 API 配置">＋</button>
        </div>
        {draft.apiProfiles.map((profile) => (
          <button
            type="button"
            key={profile.id}
            className={profile.id === activeProfile?.id ? 'is-active' : ''}
            onClick={() => selectProfile(profile.id)}
          >
            <span>{profile.name || '未命名配置'}</span>
            <small>{profile.model || '未选择模型'}</small>
          </button>
        ))}
      </aside>
      {activeProfile ? (
        <div className="bvs-settings-card-stack bvs-settings-profile-form">
          <div className="bvs-settings-card bvs-settings-grid">
            <Field label="配置名称">
              <input
                value={activeProfile.name}
                onChange={(event) => updateProfile({ name: event.currentTarget.value })}
              />
            </Field>
            <Field label="默认模型">
              <input
                list={modelListId}
                value={activeProfile.model}
                onChange={(event) => updateProfile({ model: event.currentTarget.value })}
              />
              <datalist id={modelListId}>
                {activeProfile.modelList.map((model) => <option key={model} value={model} />)}
              </datalist>
            </Field>
            <Field
              label="API 地址"
              hint="可填写 https://example.com/v1 或完整的 /chat/completions 地址。"
              wide
            >
              <input
                value={activeProfile.apiUrl}
                placeholder="https://example.com/v1"
                onChange={(event) => updateProfile({ apiUrl: event.currentTarget.value })}
              />
            </Field>
            <Field label="API Key" hint="密钥只交给上层保存回调，不会由组件自行持久化。" wide>
              <div className="bvs-settings-password-input">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={activeProfile.apiKey}
                  autoComplete="off"
                  placeholder="请输入 API Key"
                  onChange={(event) => updateProfile({ apiKey: event.currentTarget.value })}
                />
                <button type="button" onClick={() => setShowApiKey((visible) => !visible)}>
                  {showApiKey ? '隐藏' : '显示'}
                </button>
              </div>
            </Field>
            <Field label="模型列表" hint="每行一个模型，供主界面的模型选择器使用。" wide>
              {onFetchModels ? (
                <div className="bvs-settings-model-actions">
                  <button
                    type="button"
                    disabled={isBusy || !activeProfile.apiUrl || !activeProfile.apiKey}
                    onClick={() => void fetchActiveProfileModels()}
                  >
                    从 API 获取模型
                  </button>
                  <span>请求只使用当前草稿中的地址和密钥，不会输出密钥。</span>
                </div>
              ) : null}
              <textarea
                rows={8}
                value={activeProfile.modelList.join('\n')}
                onChange={(event) => updateProfile({
                  modelList: event.currentTarget.value
                    .split('\n')
                    .map((model) => model.trim())
                    .filter(Boolean),
                })}
              />
            </Field>
          </div>
          <div className="bvs-settings-profile-actions">
            <button type="button" onClick={duplicateProfile}>复制配置</button>
            <button
              type="button"
              className="is-danger"
              disabled={draft.apiProfiles.length <= 1}
              onClick={removeProfile}
            >
              删除配置
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  const renderSummary = () => (
    <PresetEditor
      title="摘要模板"
      presets={draft.promptPresets}
      activeId={draft.activePresetId}
      idPrefix="preset_custom"
      onChange={(promptPresets, activePresetId) => setDraft((current) => ({
        ...current,
        promptPresets,
        activePresetId,
      }))}
    />
  );

  const renderAnalysis = () => (
    <div className="bvs-settings-card-stack">
      <div className="bvs-settings-card bvs-settings-grid">
        <Field label="评论最多页数">
          <input
            type="number"
            min={1}
            max={20}
            value={draft.commentMaxPages}
            onChange={(event) => updateConfig('commentMaxPages', Number(event.currentTarget.value))}
          />
        </Field>
        <Field label="评论最多条数">
          <input
            type="number"
            min={10}
            max={500}
            value={draft.commentLimit}
            onChange={(event) => updateConfig('commentLimit', Number(event.currentTarget.value))}
          />
        </Field>
        <Field label="请求最短间隔（毫秒）">
          <input
            type="number"
            min={500}
            value={draft.commentMinDelay}
            onChange={(event) => updateConfig('commentMinDelay', Number(event.currentTarget.value))}
          />
        </Field>
        <Field label="请求最长间隔（毫秒）">
          <input
            type="number"
            min={1000}
            value={draft.commentMaxDelay}
            onChange={(event) => updateConfig('commentMaxDelay', Number(event.currentTarget.value))}
          />
        </Field>
        <Field label="全面分析最大字符数" wide>
          <input
            type="number"
            min={8000}
            value={draft.fullDataMaxChars}
            onChange={(event) => updateConfig('fullDataMaxChars', Number(event.currentTarget.value))}
          />
        </Field>
        <Field label="评论区总结提示词" wide>
          <textarea
            rows={6}
            value={draft.commentPromptText}
            onChange={(event) => updateConfig('commentPromptText', event.currentTarget.value)}
          />
        </Field>
        <Field label="评论填字预设" hint="每行一条，旧脚本会随机选择。" wide>
          <textarea
            rows={4}
            value={draft.commentTextPresets.join('\n')}
            onChange={(event) => updateConfig(
              'commentTextPresets',
              event.currentTarget.value.split('\n').map((item) => item.trim()).filter(Boolean),
            )}
          />
        </Field>
        <Field label="弹幕分析提示词" wide>
          <textarea
            rows={7}
            value={draft.danmakuPromptText}
            onChange={(event) => updateConfig('danmakuPromptText', event.currentTarget.value)}
          />
        </Field>
      </div>
      <PresetEditor
        title="全面分析模板"
        presets={draft.fullAnalysisPresets}
        activeId={draft.activeFullAnalysisPresetId}
        idPrefix="fullpreset_custom"
        onChange={(fullAnalysisPresets, activeFullAnalysisPresetId) => setDraft((current) => ({
          ...current,
          fullAnalysisPresets,
          activeFullAnalysisPresetId,
        }))}
      />
    </div>
  );

  const renderImage = () => (
    <div className="bvs-settings-card-stack">
      <div className="bvs-settings-card">
        <SwitchField
          label="启用总结配图"
          description="摘要完成后显示配图操作；自动生成策略由主运行时决定。"
          checked={draft.enableImageGen}
          onChange={(checked) => updateConfig('enableImageGen', checked)}
        />
        <SwitchField
          label="自动下载生成图片"
          description="成功生成图片后尝试保存到已授权目录的图片子目录。"
          checked={draft.enableImageAutoDownload}
          onChange={(checked) => updateConfig('enableImageAutoDownload', checked)}
        />
      </div>
      <div className="bvs-settings-card bvs-settings-grid">
        <Field label="生图方式">
          <select
            value={draft.imageGenMode}
            onChange={(event) => updateConfig(
              'imageGenMode',
              event.currentTarget.value === 'flow' ? 'flow' : 'api',
            )}
          >
            <option value="api">API 生图</option>
            <option value="flow">Google Flow</option>
          </select>
        </Field>
        <Field label="图片尺寸">
          <input
            value={draft.imageGenSize}
            placeholder="1024x1024"
            onChange={(event) => updateConfig('imageGenSize', event.currentTarget.value)}
          />
        </Field>
        {draft.imageGenMode === 'api' ? (
          <>
            <Field label="生图 API 地址" hint="留空时复用当前摘要 API。" wide>
              <input
                value={draft.imageGenApiUrl}
                onChange={(event) => updateConfig('imageGenApiUrl', event.currentTarget.value)}
              />
            </Field>
            <Field label="生图 API Key" hint="留空时复用当前摘要 API Key。" wide>
              <div className="bvs-settings-password-input">
                <input
                  type={showImageApiKey ? 'text' : 'password'}
                  value={draft.imageGenApiKey}
                  autoComplete="off"
                  onChange={(event) => updateConfig('imageGenApiKey', event.currentTarget.value)}
                />
                <button type="button" onClick={() => setShowImageApiKey((visible) => !visible)}>
                  {showImageApiKey ? '隐藏' : '显示'}
                </button>
              </div>
            </Field>
            <Field label="生图模型" wide>
              <input
                value={draft.imageGenModel}
                onChange={(event) => updateConfig('imageGenModel', event.currentTarget.value)}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Flow 项目地址" wide>
              <input
                value={draft.flowProjectUrl}
                onChange={(event) => updateConfig('flowProjectUrl', event.currentTarget.value)}
              />
            </Field>
            <div className="bvs-settings-field is-wide">
              <SwitchField
                label="未检测到接收页时后台打开 Flow"
                description="组件只保存该偏好，真实打开行为由 Flow 运行时处理。"
                checked={draft.enableFlowBackgroundOpen}
                onChange={(checked) => updateConfig('enableFlowBackgroundOpen', checked)}
              />
            </div>
          </>
        )}
        <Field label="生图提示词" hint="使用 {summary} 作为摘要内容占位符。" wide>
          <textarea
            rows={8}
            value={draft.imageGenPromptText}
            onChange={(event) => updateConfig('imageGenPromptText', event.currentTarget.value)}
          />
        </Field>
      </div>
    </div>
  );

  const renderServices = () => (
    <div className="bvs-settings-card-stack">
      <div className="bvs-settings-card bvs-settings-grid">
        <Field label="Flomo API 地址" hint="来自 Flomo 设置中的 API Webhook。" wide>
          <input
            value={draft.flomoApiUrl}
            placeholder="https://flomoapp.com/iwh/..."
            onChange={(event) => updateConfig('flomoApiUrl', event.currentTarget.value)}
          />
        </Field>
        <Field label="Flomo 标签" hint="多个标签使用空格分隔。" wide>
          <input
            value={draft.flomoTags}
            onChange={(event) => updateConfig('flomoTags', event.currentTarget.value)}
          />
        </Field>
      </div>
      <div className="bvs-settings-card">
        <SwitchField
          label="摘要填入评论后自动发布"
          description="这是会对外发布内容的敏感操作，建议保持关闭并人工确认。"
          checked={draft.autoSubmitCommentSummary}
          onChange={(checked) => updateConfig('autoSubmitCommentSummary', checked)}
        />
      </div>
    </div>
  );

  const moveResultAction = (id: ResultActionButtonId, offset: -1 | 1) => {
    setDraft((current) => {
      const index = current.resultActionButtons.findIndex((item) => item.id === id);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= current.resultActionButtons.length) return current;
      const resultActionButtons = current.resultActionButtons.slice();
      [resultActionButtons[index], resultActionButtons[target]] = [
        resultActionButtons[target],
        resultActionButtons[index],
      ];
      return { ...current, resultActionButtons };
    });
  };

  const renderData = () => (
    <div className="bvs-settings-card-stack">
      <div className="bvs-settings-card">
        <div className="bvs-settings-subheading">
          <div>
            <strong>结果操作按钮</strong>
            <small>控制摘要结果区显示的操作及顺序。</small>
          </div>
        </div>
        <div className="bvs-settings-action-list">
          {draft.resultActionButtons.map((item, index) => (
            <div key={item.id}>
              <label>
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    resultActionButtons: current.resultActionButtons.map((button) => (
                      button.id === item.id
                        ? { ...button, enabled: event.currentTarget.checked }
                        : button
                    )),
                  }))}
                />
                <span>{RESULT_ACTION_LABELS[item.id]}</span>
              </label>
              <span>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveResultAction(item.id, -1)}
                  aria-label={`上移${RESULT_ACTION_LABELS[item.id]}`}
                >↑</button>
                <button
                  type="button"
                  disabled={index === draft.resultActionButtons.length - 1}
                  onClick={() => moveResultAction(item.id, 1)}
                  aria-label={`下移${RESULT_ACTION_LABELS[item.id]}`}
                >↓</button>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="bvs-settings-card bvs-settings-data-card">
        <div>
          <strong>摘要缓存</strong>
          <span>{cacheStats ? `${cacheStats.count} 条 · ${cacheStats.chars.toLocaleString()} 字符` : '等待统计'}</span>
        </div>
        {onClearSummaryCache ? (
          <button type="button" onClick={() => void runAction(onClearSummaryCache)}>
            清空新版缓存
          </button>
        ) : null}
      </div>
      <div className="bvs-settings-card bvs-settings-transfer-card">
        <div>
          <strong>配置文件</strong>
          <span>导入兼容旧版 JSON。默认导出不会包含 API Key。</span>
        </div>
        <label className="bvs-settings-secret-export">
          <input
            type="checkbox"
            checked={includeSecrets}
            onChange={(event) => setIncludeSecrets(event.currentTarget.checked)}
          />
          导出时包含 API Key
        </label>
        <div>
          <button type="button" onClick={() => void importDraft()}>导入配置</button>
          <button
            type="button"
            onClick={() => void runAction(() => onExport(
              createConfigForSave(),
              { includeSecrets },
            ))}
          >
            导出配置
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={() => void resetDraft()}
          >
            恢复默认
          </button>
        </div>
      </div>
    </div>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'ai': return renderAi();
      case 'summary': return renderSummary();
      case 'analysis': return renderAnalysis();
      case 'image': return renderImage();
      case 'services': return renderServices();
      case 'data': return renderData();
      default: return renderGeneral();
    }
  };

  return (
    <div className="bvs-settings-overlay" role="presentation">
      <section
        className="bvs-settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bvs-settings-title"
      >
        <header className="bvs-settings-header">
          <div>
            <span className="bvs-settings-brand-mark">b</span>
            <div>
              <h2 id="bvs-settings-title">视频总结设置</h2>
              <p>迁移 Beta · 设置只在保存后生效</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} aria-label="关闭设置">×</button>
        </header>

        <div className="bvs-settings-layout">
          <nav className="bvs-settings-nav" aria-label="设置分类">
            {SETTINGS_SECTIONS.map((section) => (
              <button
                type="button"
                key={section.id}
                className={section.id === activeSection ? 'is-active' : ''}
                onClick={() => setActiveSection(section.id)}
              >
                <span aria-hidden="true">{section.icon}</span>
                <span>
                  <strong>{section.label}</strong>
                  <small>{section.description}</small>
                </span>
              </button>
            ))}
          </nav>

          <main className="bvs-settings-content">
            <SectionHeader section={currentSection} />
            {renderActiveSection()}
          </main>
        </div>

        <footer className="bvs-settings-footer">
          <span className={errorMessage ? 'is-visible' : ''} role="alert">
            {errorMessage}
          </span>
          <div>
            <button type="button" disabled={isBusy} onClick={onCancel}>取消</button>
            <button
              type="button"
              className="is-primary"
              disabled={isBusy}
              onClick={() => void runAction(() => onSave(createConfigForSave()))}
            >
              {isBusy ? '保存中…' : '保存设置'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
