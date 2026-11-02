import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Modal, Skeleton } from 'antd';
import { ArrowRightOutlined, TeamOutlined } from '@ant-design/icons';
import type { FollowUser } from '../../shared/types';
import { api, errorMessage } from '../api';
import { UserAvatar } from './Brand';
import { translateError, useI18n } from '../i18n';

interface FollowsModalProps {
  open: boolean;
  actor?: string;
  onClose: () => void;
  onSelect: (handle: string) => void;
}

export const FollowsModal: React.FC<FollowsModalProps> = ({
  open,
  actor,
  onClose,
  onSelect,
}) => {
  const { t } = useI18n();
  const [follows, setFollows] = useState<FollowUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!open) return;
    setFollows([]);
    setCursor(null);
    setError(null);
    setLoading(true);
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.getFollows(actor || '', undefined, 50);
        if (cancelled) return;
        setFollows(response.follows || []);
        setCursor(response.cursor || null);
      } catch (loadError) {
        if (!cancelled) setError(errorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, actor, reloadToken]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await api.getFollows(actor || '', cursor, 50);
      setFollows((current) => {
        const seen = new Set(current.map((follow) => follow.did));
        return [
          ...current,
          ...(response.follows || []).filter((follow) => !seen.has(follow.did)),
        ];
      });
      setCursor(response.cursor || null);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoadingMore(false);
    }
  };

  const retry = () => {
    if (follows.length > 0 && cursor) {
      void loadMore();
      return;
    }
    setReloadToken((value) => value + 1);
  };

  const countLabel = useMemo(
    () =>
      follows.length > 0
        ? t('已加载 {{count}} 位', { count: follows.length })
        : '',
    [follows.length, t],
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      centered
      destroyOnClose
      title={
        <div className="flex items-center gap-3 pb-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
            <TeamOutlined />
          </span>
          <div>
            <div className="text-[17px] font-bold text-ink">
              {t('我的关注')}
            </div>
            <div className="mt-0.5 text-[11px] font-normal text-slate-500">
              {t('选择一位用户，进入 TA 的媒体主页')}
            </div>
          </div>
          {countLabel && (
            <span className="ml-auto text-[10px] text-slate-400">
              {countLabel}
            </span>
          )}
        </div>
      }
    >
      <div className="pt-1">
        {error && (
          <Alert
            type="error"
            showIcon
            message={translateError(error)}
            action={
              <Button size="small" onClick={retry}>
                {t('重试')}
              </Button>
            }
            className="!mb-3 !rounded-xl"
          />
        )}

        {loading ? (
          <div className="space-y-3 py-1">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="flex items-center gap-3 px-1">
                <Skeleton.Avatar active size={42} />
                <Skeleton active paragraph={{ rows: 1 }} title={false} />
              </div>
            ))}
          </div>
        ) : follows.length === 0 && !error ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('还没有关注任何用户')}
            className="!my-8"
          />
        ) : (
          <div className="follows-list">
            {follows.map((follow) => (
              <button
                key={follow.did}
                type="button"
                className="follow-row"
                onClick={() => {
                  onSelect(follow.handle);
                  onClose();
                }}
              >
                <UserAvatar
                  src={follow.avatar}
                  name={follow.displayName || follow.handle}
                  size={42}
                />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px] font-semibold text-ink">
                    {follow.displayName || follow.handle}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">
                    @{follow.handle}
                  </span>
                  {follow.description && (
                    <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                      {follow.description}
                    </span>
                  )}
                </span>
                <ArrowRightOutlined className="shrink-0 text-[11px] text-slate-300" />
              </button>
            ))}
          </div>
        )}

        {cursor && !loading && (
          <Button
            block
            loading={loadingMore}
            onClick={() => void loadMore()}
            className="!mt-3 !rounded-xl"
          >
            {t('加载更多')}
          </Button>
        )}
      </div>
    </Modal>
  );
};
