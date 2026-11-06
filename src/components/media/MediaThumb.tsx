import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
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
