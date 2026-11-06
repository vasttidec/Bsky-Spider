import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Switch,
} from 'antd';
import {
  CheckCircleFilled,
  ClearOutlined,
  CloudDownloadOutlined,
  CloudServerOutlined,
  CodeOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SettingOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type {
  AppSettings,
  LanguageSetting,
  ThemeName,
} from '../../shared/types';
import { THEME_OPTIONS } from '../theme';
import { translateError, useI18n } from '../i18n';
import {
  DEFAULT_FILE_TEMPLATE,
  DEFAULT_FOLDER_TEMPLATE,
  previewTemplate,
} from '../../shared/templates';
import { PageHeader } from '../components/PageHeader';
import {
  SettingsSection,
  SettingRow,
} from '../components/settings/SettingsSection';
import { TemplateInput } from '../components/settings/TemplateInput';
import { FolderPickerModal } from '../components/settings/FolderPickerModal';
import { useSettingsStore } from '../stores/settings';
import { useHomeStore } from '../stores/home';
import { useAuthStore } from '../stores/auth';
import { api } from '../api';
import { useDebouncedCallback } from '../hooks/useUiHooks';

/** Save locations expressed as WebDAV / network URLs. */
const isRemoteSaveDir = (value?: string): boolean =>
  /^(davs?|https?):\/\//i.test(value || '');

export const SettingsPage: React.FC = () => {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const settings = useSettingsStore((state) => state.settings);
  const system = useSettingsStore((state) => state.system);
  const isWindowsPlatform = (system?.platform ?? 'win32').startsWith('win32');
  const saving = useSettingsStore((state) => state.saving);
  const savedAt = useSettingsStore((state) => state.savedAt);
  const saveError = useSettingsStore((state) => state.saveError);
  const load = useSettingsStore((state) => state.load);
  const loadSystem = useSettingsStore((state) => state.loadSystem);
  const save = useSettingsStore((state) => state.save);
  const reset = useSettingsStore((state) => state.reset);
  const user = useAuthStore((state) => state.user);

  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const draftRef = useRef<AppSettings | null>(settings);
  const dirtyRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [saveDirInput, setSaveDirInput] = useState<string | null>(null);

  const checkUpdates = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const result = await api.checkForUpdates();
      setLatestVersion(result.latest);
      if (result.updateAvailable && result.latest) {
        modal.info({
          title: t('发现新版本 v{{version}}', { version: result.latest }),
          content: (
            <div className="space-y-2 pt-1 text-[12px] leading-relaxed text-slate-500">
              <p>{t('可在 GitHub Releases 页面下载新版本。')}</p>
              {result.url && (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-brand-600 underline"
                >
                  {result.url}
                </a>
              )}
            </div>
          ),
          okText: t('前往下载'),
          onOk: () => {
            if (result.url) window.open(result.url, '_blank', 'noopener');
          },
          cancelText: t('关闭'),
        });
      } else {
        message.success(t('当前已经是最新版本'));
      }
    } catch (checkError) {
      message.error(
        t('检查更新失败：{{error}}', {
          error:
            translateError(
              checkError instanceof Error ? checkError.message : '未知错误',
            ) || t('未知错误'),
        }),
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    if (!settings) {
      void load().catch((loadError) => {
        message.error(
          loadError instanceof Error
            ? translateError(loadError.message)
            : t('读取设置失败'),
        );
      });
    }
    if (!system) void loadSystem();
  }, [settings, system, load, loadSystem, message]);

  useEffect(() => {
    if (settings && (!draftRef.current || !dirtyRef.current)) {
      draftRef.current = settings;
      setDraft(settings);
    }
  }, [settings]);

  const commitSave = useDebouncedCallback(async (next: AppSettings) => {
    try {
      await save(next);
      if (draftRef.current === next) {
        dirtyRef.current = false;
        const normalized = useSettingsStore.getState().settings;
        if (normalized) {
          draftRef.current = normalized;
          setDraft(normalized);
        }
      }
    } catch (saveFailure) {
      message.error(
        saveFailure instanceof Error
          ? saveFailure.message
          : t('设置保存失败，请检查填写内容'),
      );
    }
  }, 800);

  const update = (patch: Partial<AppSettings>) => {
    const base = draftRef.current;
    if (!base) return;
    const next = { ...base, ...patch };
    draftRef.current = next;
    setDraft(next);
    dirtyRef.current = true;
    commitSave(next);
  };

  const setField = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => update({ [key]: value } as Pick<AppSettings, K>);

  const preview = draft
    ? previewTemplate(draft.fileNameTemplate, draft.folderTemplate)
    : null;
  const separator = isRemoteSaveDir(draft?.saveDir)
    ? '/'
    : system?.platform.startsWith('win32')
      ? '\\'
      : '/';
  const previewPath = draft
    ? `${draft.saveDir}${separator}${
        preview?.folder === t('（保存路径根目录）')
          ? ''
          : `${preview?.folder}${separator}`
      }${preview?.file || ''}`
    : '';

  const openSaveDir = async () => {
    if (!draft?.saveDir) return;
    if (isWindowsPlatform && isRemoteSaveDir(draft.saveDir)) {
      window.open(draft.saveDir, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      await api.openFolder(draft.saveDir);
    } catch (openError) {
      message.error(
        openError instanceof Error
          ? translateError(openError.message)
          : t('无法打开文件夹'),
      );
    }
  };

  const restoreDefaults = async () => {
    try {
      await reset();
      const restored = useSettingsStore.getState().settings;
      if (restored) {
        draftRef.current = restored;
        dirtyRef.current = false;
        setDraft(restored);
      }
      void loadSystem();
      message.success(t('已恢复默认设置'));
    } catch (resetError) {
      message.error(
        resetError instanceof Error
          ? translateError(resetError.message)
          : t('恢复默认设置失败'),
      );
    }
  };

  const retrySave = async () => {
    if (!draftRef.current) return;
    try {
      await save(draftRef.current);
      dirtyRef.current = false;
      const normalized = useSettingsStore.getState().settings;
      if (normalized) {
        draftRef.current = normalized;
        setDraft(normalized);
      }
      message.success(t('设置已保存'));
    } catch (saveFailure) {
      message.error(
        saveFailure instanceof Error
          ? translateError(saveFailure.message)
          : t('保存失败'),
      );
    }
  };

  const openDataDir = async () => {
    try {
      await api.openDataDir();
    } catch (openError) {
      message.error(
        openError instanceof Error
          ? translateError(openError.message)
          : t('无法打开数据目录'),
      );
    }
  };

  if (!draft) {
    return (
      <div className="page-shell">
        <PageHeader
          title={t('设置')}
          icon={<SettingOutlined />}
          tone="settings"
        />
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500 shadow-card">
          <LoadingOutlined className="text-brand-500" />
          {t('正在读取设置…')}
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        title={t('设置')}
        icon={<SettingOutlined />}
        tone="settings"
        extra={
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            {saving ? (
              <span className="inline-flex items-center gap-1.5">
                <SyncOutlined spin className="text-brand-500" />
                {t('正在自动保存…')}
              </span>
            ) : savedAt ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-500">
                <CheckCircleFilled />
                {t('已保存')} {dayjs(savedAt).format('HH:mm:ss')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <InfoCircleOutlined />
                {t('修改后自动保存')}
              </span>
            )}
          </div>
        }
      />

      {saveError && (
        <Alert
          type="error"
          showIcon
          message={t('设置未能保存')}
          description={saveError}
          action={
            <Button size="small" onClick={() => void retrySave()}>
              {t('重试')}
            </Button>
          }
          className="!mb-4 !rounded-xl"
        />
      )}

      <div className="space-y-4">
        <SettingsSection title={t('外观')}>
          <SettingRow label={t('主题')}>
            <Select<ThemeName>
              value={draft.theme}
              onChange={(value) => setField('theme', value)}
              options={THEME_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.label),
              }))}
              aria-label={t('主题')}
              className="!w-full sm:!w-56"
              popupMatchSelectWidth={false}
            />
          </SettingRow>
          <SettingRow label={t('语言')}>
            <Select<LanguageSetting>
              value={draft.language}
              onChange={(value) => setField('language', value)}
              options={[
                { value: 'system', label: t('系统语言') },
                {
                  value: 'zh-CN',
                  label: `${t('简体中文')} (zh-CN)`,
                },
                {
                  value: 'zh-TW',
                  label: `${t('繁体中文')} (zh-TW)`,
                },
                { value: 'en', label: `${t('英语')} (en-US)` },
                { value: 'ru', label: `${t('俄语')} (ru-RU)` },
              ]}
              aria-label={t('语言')}
              className="!w-full sm:!w-56"
              popupMatchSelectWidth={false}
            />
          </SettingRow>
        </SettingsSection>

        <SettingsSection title={t('下载设置')}>
          <SettingRow label={t('保存路径')}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                readOnly={!isWindowsPlatform}
                value={
                  isWindowsPlatform
                    ? saveDirInput ?? draft.saveDir
                    : draft.saveDir
                }
                onChange={
                  isWindowsPlatform
                    ? (event) => setSaveDirInput(event.target.value)
                    : undefined
                }
                onBlur={
                  isWindowsPlatform
                    ? () => {
                        const next = (saveDirInput ?? draft.saveDir).trim();
                        setSaveDirInput(null);
                        if (next && next !== draft.saveDir) {
                          setField('saveDir', next);
                        }
                      }
                    : undefined
                }
                onPressEnter={
                  isWindowsPlatform
                    ? (event) => (event.target as HTMLInputElement).blur()
                    : undefined
                }
                className="!rounded-xl !font-mono !text-xs"
                spellCheck={false}
                aria-label={t('保存路径')}
              />
              <div className="flex shrink-0 gap-2">
                <Button
                  icon={<FolderOpenOutlined />}
                  onClick={openSaveDir}
                  className="!rounded-xl"
                >
                  {t('打开')}
                </Button>
                <Button
                  type="primary"
                  icon={<FolderOpenOutlined />}
                  onClick={() => {
                    setSaveDirInput(null);
                    setPickerOpen(true);
                  }}
                  className="!rounded-xl"
                >
                  {t('选择路径')}
                </Button>
              </div>
            </div>
            {isWindowsPlatform && isRemoteSaveDir(draft.saveDir) && (
              <p className="mt-1.5 text-[10px] text-slate-400">
                {t(
                  '已设置网络位置：下载完成后会自动上传，文件不会保留在本地。',
                )}
              </p>
            )}
            {draft.saveDir !== system?.defaultSaveDir && system?.defaultSaveDir && (
              <button
                type="button"
                onClick={() => setField('saveDir', system.defaultSaveDir)}
                className="mt-1.5 text-[10px] text-brand-500 hover:text-brand-700"
              >
                {t('恢复默认路径')}
              </button>
            )}
          </SettingRow>

          <SettingRow
            label={t('文件夹模板')}
            description={t('支持多级文件夹，用 / 分隔；留空则直接保存到保存路径。')}
            tooltip={t('可使用变量生成按用户或日期归档的文件夹。')}
          >
            <TemplateInput
              ariaLabel={t('文件夹模板')}
              value={draft.folderTemplate}
              onChange={(value) => setField('folderTemplate', value)}
              placeholder="%USER_HANDLE%"
            />
          </SettingRow>

          <SettingRow
            label={t('文件名模板')}
            description={t('建议保留 %EXT% 变量，Bsky-Spider 会自动补全扩展名。')}
            tooltip={t('文件名中的非法字符会被自动替换，不会覆盖已有文件（除非重新下载）。')}
            footer={
              <div className="template-preview">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <CodeOutlined />
                  {t('路径预览')}
                </div>
                <code className="break-all text-[11px] text-brand-700">
                  {previewPath || '—'}
                </code>
                <p className="mt-1 text-[10px] text-slate-400">
                  {t('示例基于用户 example.bsky.social 的一条图片帖子。')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setField('folderTemplate', DEFAULT_FOLDER_TEMPLATE);
                    setField('fileNameTemplate', DEFAULT_FILE_TEMPLATE);
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-brand-600"
                >
                  <ReloadOutlined />
                  {t('恢复推荐模板')}
                </button>
              </div>
            }
          >
            <TemplateInput
              ariaLabel={t('文件名模板')}
              value={draft.fileNameTemplate}
              onChange={(value) => setField('fileNameTemplate', value)}
              placeholder={DEFAULT_FILE_TEMPLATE}
            />
          </SettingRow>

          <SettingRow label={t('跳过相同文件')}>
            <Switch
              checked={draft.skipExisting}
              onChange={(checked) => setField('skipExisting', checked)}
            />
          </SettingRow>

          <SettingRow
            label={t('并发下载数')}
            description={t(
              '同时下载的任务数量。网络不稳定时建议调低。',
            )}
          >
            <div className="flex items-center gap-3">
              <InputNumber
                min={1}
                max={6}
                value={draft.concurrency}
                onChange={(value) =>
                  typeof value === 'number' && setField('concurrency', value)
                }
                className="!w-24"
              />
              <span className="text-[11px] text-slate-400">
                {t('1 – 6 个任务')}
              </span>
            </div>
          </SettingRow>
        </SettingsSection>

        <SettingsSection title={t('网络')}>
          <SettingRow
            label={t('启用代理')}
            description={t('代理会用于 Bluesky API 请求和媒体下载。')}
          >
            <div>
              <Switch
                aria-label={t('启用代理')}
                checked={draft.proxyEnabled}
                onChange={(checked) => {
                  if (checked) {
                    if (draft.proxyUseSystem) {
                      if (!system?.systemProxyUrl) {
                        message.warning(
                          translateError(system?.systemProxyNote) ||
                            t(
                              '未检测到可用的系统代理，请关闭“使用系统代理”并填写代理地址',
                            ),
                        );
                        return;
                      }
                    } else if (!draft.proxyUrl.trim()) {
                      message.warning(t('请先在下方填写代理地址'));
                      return;
                    }
                  }
                  setField('proxyEnabled', checked);
                }}
              />
              {draft.proxyEnabled && !draft.proxyUseSystem && (
                <p className="mt-2 text-[10px] text-slate-400">
                  {t('当前使用手动代理：')}
                  <span className="ml-1 font-mono text-slate-500">
                    {draft.proxyUrl || t('未填写')}
                  </span>
                </p>
              )}
            </div>
          </SettingRow>

          <SettingRow
            label={t('使用系统代理')}
            description={t('自动读取当前系统代理。')}
          >
            <div>
              <Switch
                aria-label={t('使用系统代理')}
                checked={draft.proxyUseSystem}
                onChange={(checked) => {
                  setField('proxyUseSystem', checked);
                  if (
                    checked &&
                    draft.proxyEnabled &&
                    !system?.systemProxyUrl
                  ) {
                    message.warning(
                      translateError(system?.systemProxyNote) ||
                        t('暂未检测到系统代理，下载时可能无法连接'),
                    );
                  }
                  if (
                    !checked &&
                    draft.proxyEnabled &&
                    !draft.proxyUrl.trim()
                  ) {
                    message.info(
                      t('请填写手动代理地址，否则代理请求会失败'),
                    );
                  }
                }}
              />
              <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                {system?.systemProxyUrl ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckCircleFilled className="text-emerald-500" />
                    <span>{t('已检测到系统代理')}</span>
                    <code className="break-all text-brand-700">
                      {system.systemProxyUrl}
                    </code>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[9px] text-slate-400">
                      {system.systemProxySource === 'environment'
                        ? t('环境变量')
                        : system.systemProxySource === 'linux'
                          ? t('Linux 系统代理')
                          : 'Windows'}
                    </span>
                  </div>
                ) : (
                  <span>
                    {translateError(system?.systemProxyNote) ||
                      t('正在检测系统代理…')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void loadSystem()}
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-brand-500 hover:text-brand-700"
                >
                  <ReloadOutlined />
                  {t('重新检测系统代理')}
                </button>
              </div>
            </div>
          </SettingRow>

          <SettingRow
            label={t('代理地址')}
            description={
              draft.proxyUseSystem
                ? t('当前使用系统代理。关闭“使用系统代理”后即可手动填写。')
                : t('支持 HTTP / HTTPS 代理，例如 http://127.0.0.1:7890。请先填写地址，再启用代理。')
            }
          >
            <Input
              aria-label={t('代理地址')}
              value={draft.proxyUrl}
              disabled={draft.proxyUseSystem}
              onChange={(event) => setField('proxyUrl', event.target.value)}
              placeholder="http://127.0.0.1:7890"
              className="!rounded-xl !font-mono !text-xs"
              spellCheck={false}
            />
          </SettingRow>
          <SettingRow
            label={t('请求超时')}
            description={t('单次 Bluesky API 请求的超时时间（默认 30 秒）。')}
          >
            <div className="flex items-center gap-3">
              <InputNumber
                min={10}
                max={120}
                value={draft.requestTimeout}
                onChange={(value) =>
                  typeof value === 'number' &&
                  setField('requestTimeout', value)
                }
                addonAfter={t('秒')}
                className="!w-32"
              />
              <span className="text-[11px] text-slate-400">
                {t('10 – 120 秒')}
              </span>
            </div>
          </SettingRow>
          <SettingRow
            label={t('登录服务器')}
            description={t('默认使用 Bluesky 官方 PDS；自定义服务器可在登录弹窗中单独设置。')}
          >
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              <CloudServerOutlined className="text-brand-400" />
              <span className="truncate font-mono">
                {user?.pds || 'https://bsky.social'}
              </span>
            </div>
          </SettingRow>
        </SettingsSection>

        <SettingsSection title={t('应用')}>
          <SettingRow
            label={t('流畅模式')}
            description={t('关闭所有动画效果，减少内存占用。')}
          >
            <Switch
              aria-label={t('流畅模式')}
              checked={draft.smoothMode}
              onChange={(checked) => setField('smoothMode', checked)}
            />
          </SettingRow>
          <SettingRow label={t('下载完成提示')}>
            <Switch
              checked={draft.desktopNotifications}
              onChange={(checked) => setField('desktopNotifications', checked)}
            />
          </SettingRow>
          <SettingRow label={t('检查更新')}>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="small"
                icon={<CloudDownloadOutlined />}
                loading={checkingUpdate}
                onClick={() => void checkUpdates()}
                className="!rounded-lg"
              >
                {t('检查更新')}
              </Button>
              {latestVersion && (
                <span className="text-[11px] text-slate-400">
                  {t('最新版本')}
                  {': '}
                  <span className="font-medium text-slate-500">
                    {`v${latestVersion}`}
                  </span>
                </span>
              )}
            </div>
          </SettingRow>
          <SettingRow
            label={t('应用数据')}
            description={t(
              '设置与任务记录保存在下方显示的数据目录，数据目录位于 Bsky-Spider.exe 同级的 data 文件夹。',
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="small"
                icon={<FolderOpenOutlined />}
                onClick={() => void openDataDir()}
                className="!rounded-lg"
              >
                {t('打开数据目录')}
              </Button>
              <Button
                size="small"
                icon={<ClearOutlined />}
                onClick={() => {
                  useHomeStore.getState().clearHistory();
                  message.success(t('搜索历史已清空'));
                }}
                className="!rounded-lg"
              >
                {t('清空搜索历史')}
              </Button>
            </div>
            <p className="mt-2 break-all font-mono text-[10px] text-slate-400">
              {system?.dataDir}
            </p>
          </SettingRow>
          <SettingRow
            label={t('恢复默认设置')}
            description={t(
              '把主题、语言、保存路径、命名模板、并发、代理与超时恢复为初始值；已下载的文件与任务记录不会删除。',
            )}
          >
            <Popconfirm
              title={t('确定恢复默认设置？')}
              okText={t('恢复')}
              cancelText={t('取消')}
              onConfirm={() => void restoreDefaults()}
            >
              <Button size="small" icon={<ReloadOutlined />} className="!rounded-lg">
                {t('恢复默认设置')}
              </Button>
            </Popconfirm>
          </SettingRow>
          <SettingRow
            label={t('运行环境')}
            description={t(
              'Bsky-Spider 完全在你的电脑上运行，媒体不会经过第三方中转。',
            )}
          >
            <div className="grid gap-2 text-[11px] text-slate-500 sm:grid-cols-2">
              <InfoLine label="Node.js" value={system?.nodeVersion || '—'} />
              <InfoLine label={t('API 服务')} value={window.location.origin} />
            </div>
          </SettingRow>
        </SettingsSection>

        <div className="flex items-center justify-center gap-2 pb-2 text-[10px] text-slate-300">
          <ThunderboltOutlined />
          <span>{t('设置会自动保存，无需手动确认')}</span>
        </div>
      </div>

      <FolderPickerModal
        open={pickerOpen}
        initialPath={
          isWindowsPlatform && isRemoteSaveDir(draft.saveDir)
            ? system?.defaultSaveDir || ''
            : draft.saveDir
        }
        onCancel={() => setPickerOpen(false)}
        onSelect={(path) => {
          setSaveDirInput(null);
          setField('saveDir', path);
        }}
      />
    </div>
  );
};

const InfoLine: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2.5 py-1.5">
    <span className="shrink-0 text-slate-400">{label}</span>
    <span className="truncate font-mono text-slate-600" title={value}>
      {value}
    </span>
  </div>
);
