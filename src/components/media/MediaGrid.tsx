import React from 'react';
import { Button, Empty, Space } from 'antd';
import {
  CheckOutlined,
  CloudDownloadOutlined,
  DownloadOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { MediaItem } from '../../../shared/types';
import { mediaSelectionKey } from '../../utils/format';
import { MediaCard } from './MediaCard';
import { useI18n } from '../../i18n';

interface MediaGridProps {
  items: MediaItem[];
  filteredCount: number;
  selected: Set<string>;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  downloading: boolean;
  sentinelRef: React.MutableRefObject<HTMLDivElement | null>;
  onToggle: (media: MediaItem) => void;
  onPreview: (media: MediaItem) => void;
  onDownload: (media: MediaItem) => Promise<unknown>;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDownloadSelected: () => void;
  onLoadMore: () => void;
}

const SkeletonCard: React.FC = () => (
  <div className="aspect-[4/3] animate-pulse overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-100">
    <div className="h-full w-full bg-gradient-to-br from-slate-100 via-white to-sky-50" />
  </div>
);

export const MediaGrid: React.FC<MediaGridProps> = ({
  items,
  filteredCount,
  selected,
  loading,
  loadingMore,
  hasMore,
  downloading,
  sentinelRef,
  onToggle,
  onPreview,
  onDownload,
  onSelectAll,
  onClearSelection,
  onDownloadSelected,
  onLoadMore,
}) => {
  const { t } = useI18n();
  if (loading && items.length === 0) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    );
  }

  return (
    <section aria-label={t('媒体列表')} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-ink">
            {t('共 {{count}} 个媒体', { count: filteredCount })}
          </span>
          {selected.size > 0 && (
            <>
              <span className="h-3 w-px bg-slate-200" />
              <span className="text-brand-600">
                {t('已选 {{count}} 项', { count: selected.size })}
              </span>
              <button
                type="button"
                className="text-xs text-slate-400 underline decoration-slate-300 underline-offset-2 transition hover:text-brand-600"
                onClick={onClearSelection}
              >
                {t('取消选择')}
              </button>
            </>
          )}
        </div>

        <Space size={6}>
          <Button
            size="small"
            icon={<CheckOutlined />}
            onClick={onSelectAll}
            disabled={items.length === 0}
            className="!rounded-lg"
          >
            {t('全选当前')}
          </Button>
          {selected.size > 0 && (
            <Button
              size="small"
              type="primary"
              icon={<CloudDownloadOutlined />}
              loading={downloading}
              onClick={onDownloadSelected}
              className="!rounded-lg"
            >
              {t('下载所选')}
            </Button>
          )}
        </Space>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 py-14">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="text-slate-500">
                <p className="font-medium text-slate-600">
                  {t('没有符合条件的媒体')}
                </p>
                <p className="mt-1 text-xs">
                  {t('试试调整日期范围或媒体类型，或者继续向下滚动加载更多。')}
                </p>
              </div>
            }
          >
            {hasMore && (
              <Button
                icon={<DownloadOutlined />}
                loading={loadingMore}
                onClick={onLoadMore}
                className="!rounded-lg"
              >
                {t('加载更多')}
              </Button>
            )}
          </Empty>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
          {items.map((media) => (
            <MediaCard
              key={`${media.postUri}-${media.id}`}
              media={media}
              selected={selected.has(mediaSelectionKey(media))}
              onToggle={onToggle}
              onPreview={onPreview}
              onDownload={onDownload}
            />
          ))}
          {loadingMore &&
            Array.from({ length: 3 }).map((_, index) => (
              <SkeletonCard key={`skeleton-${index}`} />
            ))}
        </div>
      )}

      <div ref={sentinelRef} className="flex h-10 items-center justify-center">
        {loadingMore && items.length > 0 && (
          <span className="inline-flex items-center gap-2 text-xs text-slate-400">
            <LoadingOutlined className="text-brand-500" />
            {t('正在加载更多媒体…')}
          </span>
        )}
        {!hasMore && items.length > 0 && !loadingMore && (
          <span className="text-xs text-slate-400">
            {t('已经到底啦 · Bluesky 没有尽头')}
          </span>
        )}
      </div>
    </section>
  );
};
