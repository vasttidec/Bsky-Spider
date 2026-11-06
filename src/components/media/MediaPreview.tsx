import React, { useEffect, useState } from 'react';
import { App, Button, Modal, Spin } from 'antd';
import {
  CalendarOutlined,
  DownloadOutlined,
  ExportOutlined,
  PlayCircleFilled,
  PictureOutlined,
} from '@ant-design/icons';
import type { MediaItem } from '../../../shared/types';
import { formatDate } from '../../utils/format';
import { UserAvatar } from '../Brand';
import { MediaThumb } from './MediaThumb';
import { translateError, useI18n } from '../../i18n';

interface MediaPreviewProps {
  media: MediaItem | null;
  onClose: () => void;
  onDownload: (media: MediaItem) => Promise<unknown>;
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({
  media,
  onClose,
  onDownload,
}) => {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    setImageReady(false);
  }, [media?.url]);

  if (!media) return null;

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
    <Modal
      open={Boolean(media)}
      onCancel={onClose}
      footer={null}
      width={960}
      centered
      destroyOnClose
      className="preview-modal"
      title={
        <div className="flex items-center gap-2 text-sm text-slate-500">
          {media.kind === 'video' ? <PlayCircleFilled /> : <PictureOutlined />}
          {t(media.kind === 'video' ? '视频预览' : '图片预览')}
          <span className="text-slate-300">/</span>
          <span className="truncate text-xs font-normal">{media.postUrl}</span>
        </div>
      }
    >
      <div className="grid gap-5 pt-1 lg:grid-cols-[1.6fr_1fr]">
        <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-2xl bg-slate-950">
          {media.kind === 'image' ? (
            <>
              {!imageReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Spin />
                </div>
              )}
              <img
                src={media.url}
                alt={media.alt || t('Bluesky 图片')}
                referrerPolicy="no-referrer"
                onLoad={() => setImageReady(true)}
                className="max-h-[68vh] w-full object-contain"
              />
            </>
          ) : (
            <>
              <MediaThumb
                media={media}
                className="max-h-[68vh] object-contain"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/45 text-white">
                <PlayCircleFilled className="text-6xl drop-shadow-lg" />
                <p className="mt-3 text-sm font-semibold">
                  {t('HLS 视频流')}
                </p>
                <p className="mt-1 text-xs text-white/70">
                  {t('下载时会自动抓取全部分段并合并')}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-3">
            <UserAvatar
              src={media.author.avatar}
              name={media.author.displayName || media.author.handle}
              size={44}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {media.author.displayName || media.author.handle}
              </p>
              <a
                href={`https://bsky.app/profile/${encodeURIComponent(
                  media.author.handle,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="truncate text-xs text-slate-400 hover:text-brand-600"
              >
                @{media.author.handle}
              </a>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            <p className="mb-2 flex items-center gap-1.5 text-slate-400">
              <CalendarOutlined />
              {formatDate(media.createdAt)}
            </p>
            <p className="line-clamp-6 whitespace-pre-wrap">
              {media.postText || t('（这条帖子没有文字内容）')}
            </p>
            {media.alt && (
              <p className="mt-3 border-t border-slate-200 pt-2 text-[11px] text-slate-400">
                {t('图片描述：')}
                {media.alt}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="primary"
              size="large"
              icon={<DownloadOutlined />}
              loading={busy}
              onClick={download}
              className="!rounded-xl"
            >
              {t(media.kind === 'video' ? '下载视频' : '下载图片')}
            </Button>
            <Button
              size="large"
              icon={<ExportOutlined />}
              href={media.postUrl}
              target="_blank"
              className="!rounded-xl"
            >
              {t('打开原帖')}
            </Button>
          </div>

        </div>
      </div>
    </Modal>
  );
};
