import React from 'react';
import { Button, Tag } from 'antd';
import {
  CalendarOutlined,
  ExportOutlined,
  PictureOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { BskyProfile } from '../../shared/types';
import { formatCount, formatDate } from '../utils/format';
import { UserAvatar } from './Brand';
import { useI18n } from '../i18n';

interface ProfileCardProps {
  profile: BskyProfile;
  mediaCount: number;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({
  profile,
  mediaCount,
}) => {
  const { t } = useI18n();
  return (
    <section className="profile-card animate-fadeUp" aria-label={t('用户信息')}>
      <div
        className="profile-banner"
        style={
          profile.banner
            ? { backgroundImage: `url("${profile.banner}")` }
            : undefined
        }
      >
        <div className="profile-banner-overlay" />
        <div className="profile-banner-clouds" aria-hidden />
      </div>

      <div className="relative px-5 pb-5">
        <div className="-mt-9 flex items-end justify-between gap-4">
          <div className="profile-avatar-wrap">
            <UserAvatar
              src={profile.avatar}
              name={profile.displayName || profile.handle}
              size={78}
              className="shadow-lg"
            />
          </div>
          <a
            href={`https://bsky.app/profile/${encodeURIComponent(
              profile.handle,
            )}`}
            target="_blank"
            rel="noreferrer"
            className="mb-1"
          >
            <Button
              size="small"
              icon={<ExportOutlined />}
              className="!rounded-full !border-slate-200 !text-xs !text-slate-500 hover:!border-brand-200 hover:!text-brand-600"
            >
              {t('在 Bluesky 查看')}
            </Button>
          </a>
        </div>

        <div className="mt-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-bold text-ink">
              {profile.displayName || profile.handle}
            </h2>
            <Tag
              color="blue"
              className="!m-0 !rounded-full !border-0 !bg-brand-50 !px-2 !text-[10px] !font-semibold !text-brand-600"
            >
              {t('已加载 {{count}} 个媒体', { count: mediaCount })}
            </Tag>
          </div>
          <a
            href={`https://bsky.app/profile/${encodeURIComponent(
              profile.handle,
            )}`}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-block text-sm text-slate-400 transition hover:text-brand-600"
          >
            @{profile.handle}
          </a>
          {profile.description && (
            <p className="mt-2 line-clamp-2 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
              {profile.description}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <PictureOutlined className="text-brand-400" />
            <strong className="font-semibold text-ink">
              {formatCount(profile.postsCount)}
            </strong>
            {t('帖子')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <TeamOutlined className="text-brand-400" />
            <strong className="font-semibold text-ink">
              {formatCount(profile.followersCount)}
            </strong>
            {t('粉丝')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <TeamOutlined className="text-brand-300" />
            <strong className="font-semibold text-ink">
              {formatCount(profile.followsCount)}
            </strong>
            {t('关注')}
          </span>
          {profile.createdAt && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-slate-400">
              <CalendarOutlined />
              {t('加入于')} {formatDate(profile.createdAt).slice(0, 10)}
            </span>
          )}
        </div>
      </div>
    </section>
  );
};
