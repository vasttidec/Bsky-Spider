import React from 'react';
import { Tag } from 'antd';
import {
  ApiOutlined,
  CheckCircleFilled,
  CloudOutlined,
  CodeOutlined,
  ExportOutlined,
  GithubOutlined,
  HeartFilled,
  InfoCircleFilled,
  LockOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { PageHeader } from '../components/PageHeader';
import { BrandLogo } from '../components/Brand';
import { useI18n } from '../i18n';

const CREDITS = [
  {
    name: 'X-Spider',
    by: 'MiningCattiva',
    url: 'https://github.com/MiningCattiva/x-spider',
    license: 'GPL-3.0',
    role: '界面与交互蓝本',
    description:
      '主页、下载、设置、关于四个页面的布局与交互方式参考了 X-Spider。感谢 MiningCattiva 开源这份优秀作品。',
  },
  {
    name: 'Bluesky-Media-Downloader',
    by: 'maxreinartz',
    url: 'https://github.com/maxreinartz/Bluesky-Media-Downloader',
    license: 'MIT',
    role: '登录逻辑参考',
    description:
      'App Password 登录、作者 Feed 抓取、图片与视频媒体解析逻辑参考了该项目。感谢 maxreinartz 的探索。',
  },
];

export const AboutPage: React.FC = () => {
  const { t } = useI18n();
  return (
    <div className="page-shell">
      <PageHeader title={t('关于')} icon={<InfoCircleFilled />} />

      <section className="about-hero">
        <div className="about-hero-glow" aria-hidden />
        <div className="relative z-10 flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
          <BrandLogo size={108} className="shadow-lift" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="text-4xl font-black tracking-tight text-ink">
                Bsky-Spider
              </h1>
              <Tag className="!m-0 !rounded-full !border-0 !bg-brand-100 !px-2.5 !text-[11px] !font-semibold !text-brand-700">
                v{__APP_VERSION__}
              </Tag>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className="about-card">
          <h2 className="about-title">
            <span className="about-title-icon">
              <CloudOutlined />
            </span>
            {t('它是什么？')}
          </h2>
          <p className="text-sm leading-7 text-slate-600">
            {t('一个在本地运行的开源 Bluesky 媒体下载器。使用App Password安全登录，浏览用户主页，批量收藏图片与视频。')}
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            {t('所有网络请求由本机 Node.js 服务发起，媒体文件直接写入你选择的文件夹。应用不会上传你的账号信息、Cookie、App Password 或下载内容到任何第三方服务器。')}
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Feature
              icon={<LockOutlined />}
              title={t('App Password 登录')}
            >
              {t('不接触账号主密码，凭据由 Windows DPAPI 加密')}
            </Feature>
            <Feature icon={<ThunderboltOutlined />} title={t('批量抓取')}>
              {t('按日期与类型筛选用户媒体帖子')}
            </Feature>
            <Feature icon={<CodeOutlined />} title={t('模板命名')}>
              {t('路径与文件名支持变量组合与自动清理')}
            </Feature>
            <Feature icon={<ApiOutlined />} title={t('标准协议')}>
              {t('直接调用 AT Protocol 官方 XRPC 接口')}
            </Feature>
          </div>
        </section>

        <section className="about-card">
          <h2 className="about-title">
            <span className="about-title-icon">
              <SafetyCertificateOutlined />
            </span>
            {t('隐私与免责声明')}
          </h2>
          <ul className="about-list">
            <li>
              {t('桌面版会把 App Password 使用 Windows DPAPI 加密保存，用于下次自动登录；浏览器模式仅驻留内存。退出登录只结束当前会话，可在「账号管理」中随时切换回已保存的账号。')}
            </li>
            <li>
              {t('任务记录保存在本机数据目录（桌面版为 Bsky-Spider.exe 同级的 data 文件夹），媒体保存在设置中的保存路径。')}
            </li>
            <li>
              {t('本工具仅用于备份你有权保存的内容。请遵守原作者版权与 Bluesky 社区规则。')}
            </li>
            <li>
              {t('请勿将本工具用于批量抓取、骚扰或任何违反平台条款的用途。')}
            </li>
            <li>{t('Bsky-Spider 与 Bluesky, PBC 无隶属关系。')}</li>
          </ul>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-700">
            <HeartFilled className="mt-0.5 shrink-0" />
            <span>
              {t('喜欢一位创作者的作品，记得在 Bluesky 上点赞、转发或关注支持 TA。')}
            </span>
          </div>
        </section>
      </div>

      <section className="about-card mt-4">
        <h2 className="about-title">
          <span className="about-title-icon">
            <GithubOutlined />
          </span>
          {t('开源致谢')}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {CREDITS.map((credit) => (
            <a
              key={credit.name}
              href={credit.url}
              target="_blank"
              rel="noreferrer"
              className="credit-card group"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-ink group-hover:text-brand-600">
                      {credit.name}
                    </h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                      {t(credit.role)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {t('by')} {credit.by} · {credit.license}
                  </p>
                </div>
                <ExportOutlined className="mt-1 text-slate-300 transition group-hover:text-brand-500" />
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-slate-500">
                {t(credit.description)}
              </p>
            </a>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          <span>{t('本项目的界面布局与交互灵感来自 X-Spider，特此致谢。')}</span>
          <a
            href="/LICENSE.txt"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-brand-500 hover:text-brand-700"
          >
            {t('查看 GPL-3.0 许可证')}
            <ExportOutlined />
          </a>
        </div>
      </section>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <LinkCard
          href="https://bsky.app"
          title="Bluesky"
          description={t('去 Bluesky 看看')}
          icon={<CloudOutlined />}
        />
        <LinkCard
          href="https://atproto.com"
          title="AT Protocol"
          description={t('开放社交协议')}
          icon={<ApiOutlined />}
        />
        <LinkCard
          href="https://bsky.app/settings/app-passwords"
          title="App Passwords"
          description={t('管理登录凭据')}
          icon={<LockOutlined />}
        />
      </div>

      <footer className="mt-6 flex flex-col items-center gap-1 pb-4 text-center text-[10px] text-slate-300">
        <p className="inline-flex items-center gap-1">
          {t('作者')}:{' '}
          <a
            href="https://github.com/vasttidec"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-brand-500 transition hover:text-brand-700"
          >
            VastTideC
            <GithubOutlined />
          </a>
        </p>
      </footer>
    </div>
  );
};

const Feature: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ icon, title, children }) => (
  <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
    <span className="mt-0.5 text-brand-500">{icon}</span>
    <div>
      <p className="text-xs font-semibold text-slate-700">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
        {children}
      </p>
    </div>
  </div>
);

const LinkCard: React.FC<{
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = ({ href, title, description, icon }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="about-link-card group"
  >
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition group-hover:bg-brand-500 group-hover:text-white">
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-ink">{title}</span>
      <span className="block text-[11px] text-slate-400">{description}</span>
    </span>
    <CheckCircleFilled className="text-[11px] text-slate-200 transition group-hover:text-brand-400" />
  </a>
);
