import React, { useState } from 'react';
import clsx from 'clsx';
import { App, Button, Tooltip } from 'antd';
import {
  CheckCircleFilled,
  DownloadOutlined,
  ExportOutlined,
  EyeOutlined,
  PlayCircleFilled,
  PlusCircleOutlined,
} from '@ant-design/icons';
import type { MediaItem } from '../../../shared/types';
import { formatDate } from '../../utils/format';
import { MediaThumb } from './MediaThumb';
import { translateError, useI18n } from '../../i18n';

interface MediaCardProps {
  media: MediaItem;
  selected: boolean;
  onToggle: (media: MediaItem) => void;
  onPreview: (media: MediaItem) => void;
  onDownload: (media: MediaItem) => Promise<unknown>;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  media,
  selected,
  onToggle,
  onPreview,
  onDownload,
}) => {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      await onDownload(media);
      message.success(t('已添加到下载队列'));
    } catch (error) {
      message.error(
        error instanceof Error
          ? translateError(error.message)
          : t('创建下载任务失败'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={clsx(
        'media-card group relative overflow-hidden rounded-2xl border bg-white shadow-card transition-all duration-300',
        selected
          ? 'border-brand-400 ring-2 ring-brand-200'
          : 'border-slate-200/80 hover:-translate-y-0.5 hover:shadow-lift',
      )}
    >
      <button
        type="button"
        className="block aspect-[4/3] w-full overflow-hidden outline-none"
        onClick={() => onPreview(media)}
        aria-label={`${t('预览')} ${t(media.kind === 'video' ? '视频' : '图片')}`}
      >
        <MediaThumb
          media={media}
          className="transform-gpu transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100" />
      </button>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
        <button
          type="button"
          onClick={() => onToggle(media)}
          aria-label={selected ? t('取消选择') : t('选择此媒体')}
          aria-pressed={selected}
          className={clsx(
            'pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border text-sm shadow-sm transition-all',
            selected
              ? 'border-brand-500 bg-brand-500 text-white'
              : 'border-white/60 bg-white/80 text-slate-400 opacity-0 backdrop-blur hover:text-brand-500 group-hover:opacity-100 group-focus-within:opacity-100',
          )}
        >
          {selected ? <CheckCircleFilled /> : <PlusCircleOutlined />}
        </button>

        {media.kind === 'video' && (
          <span className="pointer-events-none inline-flex items-center gap-1 rounded-full bg-slate-950/65 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
            <PlayCircleFilled />
            {t('视频')}
          </span>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-3 p-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div className="pointer-events-auto">
          <p className="mb-2 line-clamp-1 text-[11px] font-medium text-white/75">
            {formatDate(media.createdAt)} ·{' '}
            {media.author.displayName || media.author.handle}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              size="small"
              ghost
              icon={<EyeOutlined />}
              onClick={() => onPreview(media)}
              className="!rounded-lg !border-white/40 !text-xs !text-white hover:!border-white hover:!text-slate-900"
            >
              {t('预览')}
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<DownloadOutlined />}
              loading={busy}
              onClick={download}
              className="!rounded-lg !text-xs"
            >
              {t('下载')}
            </Button>
            <Tooltip title={t('打开原帖')}>
              <a
                href={media.postUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={t('打开原帖')}
                className="ml-auto flex h-6 w-6 items-center justify-center rounded-full border border-white/35 text-[11px] text-white/85 transition hover:bg-white hover:text-slate-900"
              >
                <ExportOutlined />
              </a>
            </Tooltip>
          </div>
        </div>
      </div>
    </article>
  );
};
