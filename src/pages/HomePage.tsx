import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { App, Alert, Button, Input, Skeleton, Tag } from 'antd';
import {
  ArrowRightOutlined,
  ClearOutlined,
  CloudOutlined,
  HistoryOutlined,
  HomeFilled,
  LoadingOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { PageHeader } from '../components/PageHeader';
import { LoginHero } from '../components/LoginHero';
import { DownloadConfig } from '../components/DownloadConfig';
import { ProfileCard } from '../components/ProfileCard';
import { FollowsModal } from '../components/FollowsModal';
import { MediaGrid } from '../components/media/MediaGrid';
import { MediaPreview } from '../components/media/MediaPreview';
import { useAuthStore } from '../stores/auth';
import {
  filterVisibleItems,
  normalizeHandleInput,
  useHomeStore,
} from '../stores/home';
import { useInfiniteScroll } from '../hooks/useUiHooks';
import { mediaSelectionKey } from '../utils/format';
import type { MediaItem } from '../../shared/types';
import { translateError, useI18n } from '../i18n';

const ExploreEmpty: React.FC<{
  onOpenFollows: () => void;
  hasUser: boolean;
}> = ({ onOpenFollows, hasUser }) => {
  const { t } = useI18n();
  return (
    <section className="explore-empty animate-fadeUp">
      <div className="explore-empty-orbit" aria-hidden>
        <CloudOutlined />
      </div>
      <h2>{t('从 Bluesky 开始')}</h2>
      <p>
        {t('在上方输入任何 Bluesky 用户的 Handle，例如')}{' '}
        <code>bsky.app</code> {t('或')} <code>jay.bsky.team</code>。
        <br />
        {t('加载后即可浏览图片与视频，并批量保存到你的电脑。')}
      </p>
      {hasUser && (
        <Button
          type="primary"
          ghost
          icon={<TeamOutlined />}
          onClick={onOpenFollows}
          className="!rounded-xl"
        >
          {t('查看我的关注')}
        </Button>
      )}
      <div className="explore-tips">
        <span>{t('支持粘贴 bsky.app 个人主页链接')}</span>
        <span>{t('自动跳过重复文件')}</span>
        <span>{t('可暂停 / 继续下载')}</span>
      </div>
    </section>
  );
};

export const HomePage: React.FC = () => {
  const { message } = App.useApp();
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const openLogin = useAuthStore((state) => state.openLogin);
  const [followsOpen, setFollowsOpen] = useState(false);
  const {
    keyword,
    setKeyword,
    profile,
    items,
    cursor,
    loading,
    loadingMore,
    error,
    history,
    filter,
    selected,
    activeMedia,
    downloading,
    search,
    loadMore,
    toggleSelected,
    selectAll,
    clearSelection,
    setActiveMedia,
    downloadSelected,
    downloadOne,
    clearHistory,
    loadHistory,
  } = useHomeStore();

  useEffect(() => {
    if (user) void loadHistory();
  }, [user, loadHistory]);

  const filteredItems = useMemo(
    () => filterVisibleItems(items, filter),
    [items, filter],
  );
  const selectedKeys = useMemo(
    () => filteredItems.map(mediaSelectionKey),
    [filteredItems],
  );

  const doSearch = useCallback(
    async (value: string) => {
      if (!user) {
        openLogin();
        return;
      }
      if (!normalizeHandleInput(value)) {
        message.warning(t('请输入 Bluesky 用户 Handle'));
        return;
      }
      try {
        await search(value);
      } catch (searchError) {
        message.error(
          searchError instanceof Error
            ? translateError(searchError.message)
            : t('加载失败'),
        );
      }
    },
    [user, openLogin, message, search],
  );

  const loadNext = useCallback(async () => {
    try {
      await loadMore();
    } catch (loadError) {
      message.error(
        loadError instanceof Error
          ? translateError(loadError.message)
          : t('加载更多失败'),
      );
    }
  }, [loadMore, message]);

  const sentinelRef = useInfiniteScroll<HTMLDivElement>(
    loadNext,
    Boolean(profile && cursor && !loading && !loadingMore),
  );

  useEffect(() => {
    if (!user) return;
    const onFocusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>('input[type="search"]')
          ?.focus();
      }
    };
    window.addEventListener('keydown', onFocusSearch);
    return () => window.removeEventListener('keydown', onFocusSearch);
  }, [user]);

  const downloadSelectedItems = async () => {
    try {
      const result = await downloadSelected();
      message.success(
        t('已添加 {{count}} 个下载任务', { count: result.added }),
      );
      clearSelection();
    } catch (downloadError) {
      message.error(
        downloadError instanceof Error
          ? translateError(downloadError.message)
          : t('创建任务失败'),
      );
    }
  };

  const openFollows = () => {
    if (!user) {
      openLogin();
      return;
    }
    setFollowsOpen(true);
  };

  const selectFollow = (handle: string) => {
    setKeyword(handle);
    void doSearch(handle);
  };

  return (
    <div className="page-shell">
      <PageHeader
        title={t('主页')}
        icon={<HomeFilled />}
        tone="home"
        extra={
          user ? (
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-600 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {t('已连接 Bluesky')}
            </span>
          ) : (
            <Tag className="!rounded-full !border-slate-200 !bg-white !px-3 !py-1 !text-[11px] !text-slate-500">
              {t('未登录')}
            </Tag>
          )
        }
      />

      <section className="search-zone" aria-label={t('搜索用户')}>
        <form
          className="search-bar"
          onSubmit={(event) => {
            event.preventDefault();
            void doSearch(keyword);
          }}
        >
          <div className="search-input-wrap">
            <SearchOutlined className="search-input-icon" />
            <Input
              aria-label={t('搜索用户')}
              type="search"
              size="large"
              autoComplete="off"
              spellCheck={false}
              disabled={loading || !user}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={
                user
                  ? t('输入用户 Handle，或粘贴 bsky.app 个人主页链接')
                  : t('登录后即可搜索 Bluesky 用户')
              }
              className="!h-12 !rounded-xl !border-slate-200 !bg-white !pl-10 !text-sm !shadow-sm focus:!border-brand-400"
            />
            <span className="search-shortcut">Ctrl K</span>
          </div>
          <Button
            type="primary"
            size="large"
            htmlType="submit"
            disabled={!user || !keyword.trim()}
            loading={loading}
            className="!h-12 !rounded-xl !px-6 !text-sm !font-semibold shadow-lift"
          >
            {loading ? t('加载中') : t('加载')}
          </Button>
          {user?.handle && (
            <Button
              size="large"
              type="text"
              icon={<TeamOutlined />}
              onClick={openFollows}
              className="!h-12 !rounded-xl !text-xs !text-slate-500 hover:!bg-white hover:!text-brand-600"
            >
              {t('我的关注')}
            </Button>
          )}
        </form>

        {history.length > 0 && user && (
          <div className="search-history">
            <HistoryOutlined className="shrink-0 text-slate-300" />
            <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-slate-400">
              {t('搜索历史')}
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {history.map((handle) => (
                <button
                  key={handle}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setKeyword(handle);
                    void doSearch(handle);
                  }}
                  className="max-w-[200px] truncate whitespace-nowrap rounded-full border border-transparent bg-white/80 px-2.5 py-1 text-[11px] text-slate-500 transition hover:border-brand-200 hover:text-brand-600"
                >
                  {handle}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={clearHistory}
              className="ml-auto shrink-0 whitespace-nowrap inline-flex items-center gap-1 text-[10px] text-slate-400 transition hover:text-rose-500"
            >
              <ClearOutlined />
              {t('清空')}
            </button>
          </div>
        )}
      </section>

      {!user && (
        <div className="mt-5 space-y-5">
          <LoginHero />
        </div>
      )}

      {user && !profile && loading && (
        <div className="mt-5 space-y-4">
          <div className="config-card">
            <Skeleton active paragraph={{ rows: 2 }} />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <Skeleton avatar active paragraph={{ rows: 2 }} />
          </div>
        </div>
      )}

      {user && !profile && !loading && (
        <div className="mt-5 space-y-4">
          {error && (
            <Alert
              type="error"
              showIcon
              message={t('加载失败')}
              description={translateError(error)}
              action={
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => void doSearch(keyword)}
                  className="!rounded-lg"
                >
                  {t('重试')}
                </Button>
              }
              className="!rounded-xl"
            />
          )}
          <div className="rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-xs leading-relaxed text-brand-800">
            {t('已登录为')} <strong>@{user.handle}</strong>
            {t('。输入任意用户的 Handle，或打开我的关注开始探索。')}
          </div>
          <ExploreEmpty
            onOpenFollows={openFollows}
            hasUser={Boolean(user)}
          />
        </div>
      )}

      {user && profile && (
        <div className="mt-5 space-y-4">
          <DownloadConfig />

          <ProfileCard profile={profile} mediaCount={filteredItems.length} />

          {loading && (
            <div className="flex items-center gap-2 rounded-xl bg-white/70 px-4 py-3 text-sm text-slate-500">
              <LoadingOutlined className="text-brand-500" />
              {t('正在加载新的用户…')}
            </div>
          )}

          <MediaGrid
            items={filteredItems}
            filteredCount={filteredItems.length}
            selected={selected}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={Boolean(cursor)}
            downloading={downloading}
            sentinelRef={sentinelRef}
            onToggle={(media: MediaItem) =>
              toggleSelected(mediaSelectionKey(media))
            }
            onPreview={(media) => setActiveMedia(media)}
            onDownload={downloadOne}
            onSelectAll={() => selectAll(selectedKeys)}
            onClearSelection={clearSelection}
            onDownloadSelected={() => void downloadSelectedItems()}
            onLoadMore={() => void loadNext()}
          />
        </div>
      )}

      <FollowsModal
        open={followsOpen}
        actor={user?.did}
        onClose={() => setFollowsOpen(false)}
        onSelect={selectFollow}
      />

      <MediaPreview
        media={activeMedia}
        onClose={() => setActiveMedia(null)}
        onDownload={downloadOne}
      />

      <div className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-slate-300">
        <ArrowRightOutlined className="rotate-180" />
        <span>
          {t('Bsky-Spider 仅读取 Bluesky 公开媒体，下载内容请遵循原作者版权')}
        </span>
      </div>
    </div>
  );
};
