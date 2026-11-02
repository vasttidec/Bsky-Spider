import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  PlayCircleFilled,
  PictureOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import type { MediaItem } from '../../../shared/types';
import { useI18n } from '../../i18n';

export const MediaThumb: React.FC<{
  media: MediaItem;
  className?: string;
}> = ({ media, className }) => {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [media.thumbUrl]);

  if (!media.thumbUrl || failed) {
    return (
      <div
        className={clsx(
          'flex h-full w-full items-center justify-center bg-gradient-to-br',
          media.kind === 'video'
            ? 'from-slate-700 via-sky-800 to-blue-950 text-white/70'
            : 'from-sky-100 via-cyan-50 to-blue-200 text-brand-300',
          className,
        )}
      >
        {media.kind === 'video' ? (
          <VideoCameraOutlined className="text-4xl" />
        ) : (
          <PictureOutlined className="text-4xl" />
        )}
      </div>
    );
  }

  return (
    <img
      src={media.thumbUrl}
      alt={media.alt || media.postText || t('Bluesky 媒体')}
      loading="lazy"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailed(true)}
      className={clsx('h-full w-full object-cover', className)}
    />
  );
};

export const VideoBadge: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { t } = useI18n();
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full bg-slate-900/70 font-medium text-white backdrop-blur-sm',
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]',
      )}
    >
      <PlayCircleFilled className="text-[10px]" />
      {!compact && t('视频')}
    </span>
  );
};
