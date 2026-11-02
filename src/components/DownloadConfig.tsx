import React from 'react';
import { App, Button, Checkbox, DatePicker, Select, Tooltip } from 'antd';
import {
  CloudDownloadOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { MediaKind } from '../../shared/types';
import { filterVisibleItems, useHomeStore } from '../stores/home';
import { SectionTitle } from './PageHeader';
import { translateError, useI18n } from '../i18n';

const { RangePicker } = DatePicker;

const PRESETS = [
  {
    label: '全部时间',
    value: [dayjs('2000-01-01'), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs],
  },
  {
    label: '最近 7 天',
    value: [dayjs().subtract(7, 'day'), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs],
  },
  {
    label: '最近 30 天',
    value: [dayjs().subtract(30, 'day'), dayjs()] as [
      dayjs.Dayjs,
      dayjs.Dayjs,
    ],
  },
  {
    label: '最近 6 个月',
    value: [dayjs().subtract(6, 'month'), dayjs()] as [
      dayjs.Dayjs,
      dayjs.Dayjs,
    ],
  },
  {
    label: '最近 1 年',
    value: [dayjs().subtract(1, 'year'), dayjs()] as [
      dayjs.Dayjs,
      dayjs.Dayjs,
    ],
  },
];

export const DownloadConfig: React.FC = () => {
  const { message } = App.useApp();
  const { t } = useI18n();
  const filter = useHomeStore((state) => state.filter);
  const setFilter = useHomeStore((state) => state.setFilter);
  const items = useHomeStore((state) => state.items);
  const downloading = useHomeStore((state) => state.downloading);
  const downloadAll = useHomeStore((state) => state.downloadAll);
  const downloadItems = useHomeStore((state) => state.downloadItems);

  const loadedMatching = filterVisibleItems(items, filter);

  const startAll = async () => {
    try {
      const result = await downloadAll();
      if (result.added === 0) {
        message.info(
          result.skipped > 0
            ? t('这些媒体已经在下载队列中，无需重复添加')
            : t('没有找到符合筛选条件的媒体'),
        );
        return;
      }
      message.success(
        `${t('已创建 {{count}} 个下载任务', {
          count: result.added,
        })}${
          result.skipped > 0
            ? t('，跳过 {{count}} 个重复项', { count: result.skipped })
            : ''
        }`,
      );
    } catch (error) {
      message.error(
        error instanceof Error
          ? translateError(error.message)
          : t('创建下载任务失败'),
      );
    }
  };

  const startLoaded = async () => {
    if (loadedMatching.length === 0) {
      message.info(t('当前没有符合筛选条件的已加载媒体'));
      return;
    }
    try {
      const result = await downloadItems(loadedMatching);
      message.success(
        t('已添加 {{count}} 个已加载媒体', { count: result.added }),
      );
    } catch (error) {
      message.error(
        error instanceof Error
          ? translateError(error.message)
          : t('创建下载任务失败'),
      );
    }
  };

  return (
    <section className="config-card animate-fadeUp" aria-label={t('下载配置')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionTitle icon={<CloudDownloadOutlined />}>
            {t('下载配置')}
          </SectionTitle>
          <p className="mt-1 text-xs text-slate-400">
            {t('扫描账号的媒体帖子，按日期与类型创建批量下载任务。')}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-600">
          <InfoCircleOutlined />
          {t('当前已加载')} {loadedMatching.length} {t('个匹配媒体')}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="config-field">
          <label className="config-label">{t('日期范围')}</label>
          <RangePicker
            value={filter.from && filter.to ? [filter.from, filter.to] : null}
            presets={PRESETS.map((preset) => ({
              ...preset,
              label: t(preset.label),
            }))}
            allowClear
            disabledDate={(date) => date && date > dayjs().endOf('day')}
            onChange={(dates) =>
              setFilter({
                from: dates?.[0] ?? null,
                to: dates?.[1] ?? null,
              })
            }
            className="!rounded-xl"
            placeholder={[t('开始日期'), t('结束日期')]}
            format="YYYY-MM-DD"
          />
        </div>

        <div className="config-field">
          <label className="config-label">{t('媒体类型')}</label>
          <Checkbox.Group
            value={filter.mediaTypes}
            onChange={(values) => {
              if (values.length === 0) {
                message.warning(t('请至少保留一种媒体类型'));
                return;
              }
              setFilter({ mediaTypes: values as MediaKind[] });
            }}
            className="config-checkboxes"
          >
            <Checkbox value="image">
              <span className="inline-flex items-center gap-1.5">
                <PictureOutlined className="text-brand-500" />
                {t('图片')}
              </span>
            </Checkbox>
            <Checkbox value="video">
              <span className="inline-flex items-center gap-1.5">
                <PlayCircleOutlined className="text-brand-500" />
                {t('视频')}
              </span>
            </Checkbox>
          </Checkbox.Group>
        </div>

        <div className="config-field">
          <label className="config-label">
            {t('抓取上限')}
            <Tooltip
              title={t(
                '最多向后扫描多少条媒体帖子。选择“全部”会一直翻页到末尾，耗时较长。',
              )}
            >
              <InfoCircleOutlined className="ml-1 text-slate-300" />
            </Tooltip>
          </label>
          <Select
            value={filter.maxPosts}
            onChange={(value) => setFilter({ maxPosts: value })}
            options={[
              { value: 100, label: t('最近 100 条') },
              { value: 300, label: t('最近 300 条') },
              { value: 500, label: t('最近 500 条') },
              { value: 1000, label: t('最近 1000 条') },
              { value: 0, label: t('全部') },
            ]}
            className="!w-[136px]"
          />
        </div>

        <div className="ml-auto flex flex-wrap gap-2 pb-0.5">
          <Button
            icon={<ReloadOutlined />}
            loading={downloading}
            disabled={loadedMatching.length === 0}
            onClick={startLoaded}
            className="!rounded-xl"
          >
            {t('仅下载已加载')}
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={downloading}
            onClick={startAll}
            className="!rounded-xl !px-5"
          >
            {t('开始下载')}
          </Button>
        </div>
      </div>
    </section>
  );
};
