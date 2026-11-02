import React from 'react';
import { Button } from 'antd';
import {
  ArrowRightOutlined,
  CloudDownloadOutlined,
  ExportOutlined,
  KeyOutlined,
  LockOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../stores/auth';
import { BrandLogo } from './Brand';
import { useI18n } from '../i18n';

export const LoginHero: React.FC = () => {
  const { t } = useI18n();
  const openLogin = useAuthStore((state) => state.openLogin);

  return (
    <section className="login-hero animate-fadeUp" aria-label={t('登录引导')}>
      <div className="login-hero-copy">
        <span className="hero-pill">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {t('APP PASSWORD 安全登录')}
        </span>
        <h2>
          {t('把 Bluesky 上的灵感')}
          <br />
          <span className="hero-gradient-text">{t('收藏到本地')}</span>
        </h2>
        <p className="hero-lead">
          {t('登录后输入任意 Bluesky 用户的账号，即可浏览 TA 的图片与视频，并按日期、类型批量下载。')}
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Button
            type="primary"
            size="large"
            icon={<KeyOutlined />}
            onClick={openLogin}
            className="!h-11 !rounded-xl !px-6 !text-sm !font-semibold shadow-lift"
          >
            {t('使用 App Password 登录')}
          </Button>
          <a
            href="https://bsky.app/settings/app-passwords"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-brand-600"
          >
            {t('如何获取？')}
            <ExportOutlined className="text-xs" />
          </a>
        </div>

        <ul className="hero-features">
          <li>
            <PictureOutlined />
            <span>{t('图片与视频')}</span>
          </li>
          <li>
            <CloudDownloadOutlined />
            <span>{t('批量下载')}</span>
          </li>
          <li>
            <SafetyCertificateOutlined />
            <span>{t('本地存储')}</span>
          </li>
        </ul>
      </div>

      <div className="login-hero-art" aria-hidden>
        <div className="hero-orbit hero-orbit-one" />
        <div className="hero-orbit hero-orbit-two" />
        <div className="hero-media-card hero-media-card-back">
          <div className="hero-media-sky" />
          <span className="hero-media-chip">
            <PlayCircleOutlined /> {t('视频')}
          </span>
        </div>
        <div className="hero-media-card hero-media-card-front">
          <div className="hero-media-sun" />
          <div className="hero-media-cloud hero-media-cloud-a" />
          <div className="hero-media-cloud hero-media-cloud-b" />
          <div className="hero-media-caption">
            <span>{t('傍晚的云层')}</span>
            <span>{t('4 张图片')}</span>
          </div>
        </div>
        <div className="hero-logo-float">
          <BrandLogo size={64} />
          <span>
            {t('一次登录')}
            <br />
            {t('随时收集')}
          </span>
        </div>
        <div className="hero-stat-float">
          <LockOutlined />
          <div>
            <strong>{t('仅本机可见')}</strong>
          </div>
        </div>
      </div>
    </section>
  );
};

export const LoginHint: React.FC = () => {
  const { t } = useI18n();
  const openLogin = useAuthStore((state) => state.openLogin);
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-3">
      <p className="text-xs leading-relaxed text-brand-800">
        <LockOutlined className="mr-1.5" />
        {t('搜索与下载功能需要登录。Bsky-Spider 只读取公开媒体，不修改账号。')}
      </p>
      <Button
        size="small"
        type="primary"
        ghost
        onClick={openLogin}
        className="!shrink-0 !rounded-lg"
      >
        {t('登录')}
        <ArrowRightOutlined className="ml-1" />
      </Button>
    </div>
  );
};
