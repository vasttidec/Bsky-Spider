import React, { useEffect, useMemo, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Empty,
  Tabs,
  Tooltip,
} from 'antd';
import {
  CheckCircleFilled,
  ClearOutlined,
  CloudDownloadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ExclamationCircleFilled,
  FolderOpenOutlined,
  LoadingOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SyncOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { PageHeader } from '../components/PageHeader';
import { DownloadTaskItem } from '../components/downloads/DownloadTaskItem';
import { useTasksStore } from '../stores/tasks';
import { useSettingsStore } from '../stores/settings';
import { api } from '../api';
import type { TaskBatchAction } from '../../shared/types';
import { translateError, useI18n } from '../i18n';

type TabKey = 'active' | 'error' | 'completed';

const STATUS_ORDER: Record<string, number> = {
  downloading: 0,
  paused: 1,
  waiting: 2,
  error: 0,
  completed: 0,
};

const StatCard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}> = ({ label, value, icon, tone }) => (
  <div className="download-stat">
    <span className={`download-stat-icon ${tone}`}>{icon}</span>
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="text-xl font-bold leading-tight text-ink">{value}</p>
    </div>
  </div>
);

export const DownloadsPage: React.FC = () => {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const tasks = useTasksStore((state) => state.tasks);
  const counts = useTasksStore((state) => state.counts);
  const concurrency = useTasksStore((state) => state.concurrency);
  const loading = useTasksStore((state) => state.loading);
  const initialized = useTasksStore((state) => state.initialized);
  const error = useTasksStore((state) => state.error);
  const refresh = useTasksStore((state) => state.refresh);
  const batch = useTasksStore((state) => state.batch);
  const settings = useSettingsStore((state) => state.settings);
  const [tab, setTab] = useState<TabKey>('active');
  const [batchBusy, setBatchBusy] = useState<string | null>(null);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  const activeTasks = useMemo(
    () =>
      tasks
        .filter((task) =>
          ['downloading', 'waiting', 'paused'].includes(task.status),
        )
        .sort((a, b) => {
          const order = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          if (order !== 0) return order;
          return b.createdAt.localeCompare(a.createdAt);
        }),
    [tasks],
  );
  const errorTasks = useMemo(
    () => tasks.filter((task) => task.status === 'error'),
    [tasks],
  );
  const completedTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status === 'completed')
        .sort((a, b) =>
          (b.completedAt || b.createdAt).localeCompare(
            a.completedAt || a.createdAt,
          ),
        ),
    [tasks],
  );

  const runBatch = async (
    action: TaskBatchAction,
    label: string,
    confirm?: string,
  ) => {
    const execute = async () => {
      setBatchBusy(action);
      try {
        await batch(action);
        message.success(
          t('{{action}}成功', { action: label }),
        );
      } catch (batchError) {
        message.error(
          batchError instanceof Error
            ? translateError(batchError.message)
            : t('{{action}}失败', { action: label }),
        );
      } finally {
        setBatchBusy(null);
      }
    };
    if (confirm) {
      modal.confirm({
        title: `${label}？`,
        content: confirm,
        okText: label,
        cancelText: t('取消'),
        okButtonProps: { danger: action.startsWith('remove') },
        onOk: execute,
      });
    } else {
      await execute();
    }
  };

  const openSaveDir = async () => {
    if (!settings?.saveDir) return;
    try {
      await api.openFolder(settings.saveDir);
    } catch (openError) {
      message.error(
        openError instanceof Error
          ? translateError(openError.message)
          : t('无法打开文件夹'),
      );
    }
  };

  const renderList = (
    list: typeof tasks,
    emptyTitle: string,
    emptyDescription: string,
  ) => {
    if (list.length === 0) {
      return (
        <div className="download-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div>
                <p className="font-medium text-slate-600">{emptyTitle}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {emptyDescription}
                </p>
              </div>
            }
          >
            <Button
              type="primary"
              ghost
              icon={<CloudDownloadOutlined />}
              onClick={() => {
                window.location.hash = '#/home';
              }}
              className="!rounded-xl"
            >
              {t('去主页收集媒体')}
            </Button>
          </Empty>
        </div>
      );
    }
    return (
      <div className="space-y-2.5" role="list">
        {list.map((task) => (
          <DownloadTaskItem key={task.id} task={task} />
        ))}
      </div>
    );
  };

  return (
    <div className="page-shell">
      <PageHeader
        title={t('下载')}
        icon={<DownloadOutlined />}
        tone="downloads"
        extra={
          <div className="flex items-center gap-2">
            <Tooltip title={t('刷新任务')}>
              <Button
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={() => void refresh()}
                className="!rounded-xl"
              >
                {t('刷新')}
              </Button>
            </Tooltip>
            <Button
              icon={<FolderOpenOutlined />}
              onClick={openSaveDir}
              disabled={
                !settings?.saveDir ||
                /^(davs?|https?):\/\//i.test(settings.saveDir)
              }
              className="!rounded-xl"
            >
              {t('打开文件夹')}
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <StatCard
          label={t('正在下载')}
          value={counts.downloading}
          icon={<SyncOutlined spin={counts.downloading > 0} />}
          tone="bg-brand-50 text-brand-600"
        />
        <StatCard
          label={t('等待中')}
          value={counts.waiting}
          icon={<LoadingOutlined />}
          tone="bg-slate-100 text-slate-500"
        />
        <StatCard
          label={t('已完成')}
          value={counts.completed}
          icon={<CheckCircleFilled />}
          tone="bg-emerald-50 text-emerald-500"
        />
        <StatCard
          label={t('失败')}
          value={counts.error}
          icon={<WarningFilled />}
          tone="bg-rose-50 text-rose-500"
        />
      </div>

      {error && !initialized && (
        <Alert
          type="error"
          showIcon
          message={t('无法读取下载任务')}
          description={translateError(error)}
          action={
            <Button size="small" onClick={() => void refresh()}>
              {t('重试')}
            </Button>
          }
          className="!mb-4 !rounded-xl"
        />
      )}

      <section className="download-panel">
        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as TabKey)}
          className="download-tabs"
          items={[
            {
              key: 'active',
              label: (
                <span className="inline-flex items-center gap-2">
                  <DownloadOutlined />
                  {t('下载中')}
                  <span className="tab-count">{activeTasks.length}</span>
                </span>
              ),
              children: (
                <>
                  <div className="download-toolbar">
                    <span className="text-xs text-slate-400">
                      {t('共 {{count}} 个进行中的任务，最多并发 {{concurrency}} 个', {
                        count: activeTasks.length,
                        concurrency,
                      })}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="small"
                        icon={<PlayCircleOutlined />}
                        loading={batchBusy === 'resumeAll'}
                        disabled={counts.paused === 0}
                        onClick={() =>
                          void runBatch('resumeAll', t('全部开始'))
                        }
                        className="!rounded-lg"
                      >
                        {t('全部开始')}
                      </Button>
                      <Button
                        size="small"
                        icon={<PauseCircleOutlined />}
                        loading={batchBusy === 'pauseAll'}
                        disabled={activeTasks.length === 0}
                        onClick={() =>
                          void runBatch('pauseAll', t('全部暂停'))
                        }
                        className="!rounded-lg"
                      >
                        {t('全部暂停')}
                      </Button>
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        loading={batchBusy === 'removeActive'}
                        disabled={activeTasks.length === 0}
                        onClick={() =>
                          void runBatch(
                            'removeActive',
                            t('删除进行中的任务'),
                            t(
                              '任务记录将被移除，未完成的临时文件会被清理，已下载完成的文件不会删除。',
                            ),
                          )
                        }
                        className="!rounded-lg"
                      >
                        {t('清空列表')}
                      </Button>
                    </div>
                  </div>
                  {renderList(
                    activeTasks,
                    t('下载队列是空的'),
                    t(
                      '去主页加载一个 Bluesky 用户，选择喜欢的图片或视频开始下载。',
                    ),
                  )}
                </>
              ),
            },
            {
              key: 'error',
              label: (
                <span className="inline-flex items-center gap-2">
                  <ExclamationCircleFilled />
                  {t('错误')}
                  <span className="tab-count">{errorTasks.length}</span>
                </span>
              ),
              children: (
                <>
                  <div className="download-toolbar">
                    <span className="text-xs text-slate-400">
                      {t('失败的下载可以重试；源文件过期时需要重新加载用户。')}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        loading={batchBusy === 'retryErrors'}
                        disabled={errorTasks.length === 0}
                        onClick={() =>
                          void runBatch('retryErrors', t('全部重试'))
                        }
                        className="!rounded-lg"
                      >
                        {t('全部重试')}
                      </Button>
                      <Button
                        size="small"
                        danger
                        icon={<ClearOutlined />}
                        loading={batchBusy === 'removeErrors'}
                        disabled={errorTasks.length === 0}
                        onClick={() =>
                          void runBatch(
                            'removeErrors',
                            t('清除错误记录'),
                            t(
                              '只删除错误的任务记录，已下载的文件不会受影响。',
                            ),
                          )
                        }
                        className="!rounded-lg"
                      >
                        {t('清除记录')}
                      </Button>
                    </div>
                  </div>
                  {renderList(
                    errorTasks,
                    t('没有失败的任务'),
                    t(
                      '一切顺利。如果网络不稳定，下载失败的任务会出现在这里。',
                    ),
                  )}
                </>
              ),
            },
            {
              key: 'completed',
              label: (
                <span className="inline-flex items-center gap-2">
                  <CheckCircleFilled />
                  {t('已完成')}
                  <span className="tab-count">{completedTasks.length}</span>
                </span>
              ),
              children: (
                <>
                  <div className="download-toolbar">
                    <span className="text-xs text-slate-400">
                      {t('文件已保存到本地，点击文件名可直接打开。')}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="small"
                        icon={<FolderOpenOutlined />}
                        onClick={openSaveDir}
                        disabled={!settings?.saveDir}
                        className="!rounded-lg"
                      >
                        {t('打开保存目录')}
                      </Button>
                      <Button
                        size="small"
                        danger
                        icon={<ClearOutlined />}
                        loading={batchBusy === 'removeCompleted'}
                        disabled={completedTasks.length === 0}
                        onClick={() =>
                          void runBatch(
                            'removeCompleted',
                            t('清除已完成记录'),
                            t(
                              '只清理任务列表，磁盘上的文件不会被删除。',
                            ),
                          )
                        }
                        className="!rounded-lg"
                      >
                        {t('清除记录')}
                      </Button>
                    </div>
                  </div>
                  {renderList(
                    completedTasks,
                    t('还没有完成的下载'),
                    t(
                      '下载好的图片和视频会出现在这里，方便你快速打开。',
                    ),
                  )}
                </>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
};
