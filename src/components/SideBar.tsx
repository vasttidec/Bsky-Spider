import React from 'react';
import clsx from 'clsx';
import { App, Badge, Tooltip } from 'antd';
import {
  ExportOutlined,
  LoginOutlined,
  LogoutOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { NAV_ITEMS, type RouteId } from '../navigation';
import { useAuthStore } from '../stores/auth';
import { useTasksStore } from '../stores/tasks';
import { BrandLogo, UserAvatar } from './Brand';
import { useI18n } from '../i18n';

interface SideBarProps {
  route: RouteId;
  navigate: (id: RouteId) => void;
}

export const SideBar: React.FC<SideBarProps> = ({ route, navigate }) => {
  const { message } = App.useApp();
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const openLogin = useAuthStore((state) => state.openLogin);
  const openAccounts = useAuthStore((state) => state.openAccounts);
  const accounts = useAuthStore((state) => state.accounts);
  const logout = useAuthStore((state) => state.logout);
  const counts = useTasksStore((state) => state.counts);
  const activeCount = counts.downloading + counts.waiting;
  const isDesktop = Boolean(window.bskyDesktop);

  const onLogout = async () => {
    try {
      await logout();
      message.success(t('已退出登录'));
    } catch {
      message.warning(t('已退出登录'));
    }
  };

  return (
    <aside className="app-sidebar" aria-label={t('侧边栏')}>
      <div className="sidebar-aurora" aria-hidden />
      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-center gap-3 px-5 pb-4 pt-6">
          <BrandLogo
            size={42}
            className="shrink-0 shadow-[0_8px_20px_-10px_rgba(0,20,60,0.7)]"
          />
          <div className="sidebar-brand min-w-0">
            <div className="truncate text-[19px] font-bold tracking-tight text-white">
              Bsky-Spider
            </div>
          </div>
        </div>

        <div className="px-4">
          <section
            aria-label={t('账号')}
            className="sidebar-account rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm"
          >
            {user ? (
              <div className="flex items-center gap-2.5">
                <a
                  href={`https://bsky.app/profile/${encodeURIComponent(
                    user.handle,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-full focus:outline focus:outline-2 focus:outline-white"
                  title={t('在 Bluesky 查看个人主页')}
                >
                  <UserAvatar
                    src={user.avatar}
                    name={user.displayName || user.handle}
                    size={44}
                    ring
                  />
                </a>
                <div className="sidebar-account-text min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-white">
                    {user.displayName || user.handle}
                  </p>
                  <p className="truncate text-[11px] text-white/65">
                    @{user.handle}
                  </p>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={openLogin}
                className="sidebar-login flex w-full items-center gap-2.5 rounded-xl text-left text-white transition hover:bg-white/5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-white/45 bg-white/10">
                  <LoginOutlined />
                </span>
                <span className="sidebar-account-text min-w-0">
                  <span className="block text-[13px] font-semibold">
                    {t('登录 Bluesky')}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-white/60">
                    {t('使用 App Password')}
                  </span>
                </span>
              </button>
            )}

            {(isDesktop && accounts.length > 0) || user ? (
              <div className="sidebar-account-actions mt-2.5 flex items-center gap-1.5">
                {isDesktop && accounts.length > 0 && (
                  <button
                    type="button"
                    onClick={openAccounts}
                    className="sidebar-accounts flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.07] px-2 py-1.5 text-left text-[11px] font-medium text-white/85 transition hover:bg-white/15 hover:text-white"
                  >
                    <TeamOutlined className="text-[12px]" />
                    <span className="sidebar-account-text min-w-0 flex-1 truncate">
                      {t('账号管理')}
                    </span>
                    {accounts.length > 1 && (
                      <span className="sidebar-count rounded-full bg-white/20 px-1 text-[9px] font-semibold text-white">
                        {accounts.length}
                      </span>
                    )}
                  </button>
                )}
                {user && (
                  <Tooltip title={t('登出')}>
                    <button
                      type="button"
                      aria-label={t('登出')}
                      disabled={loading}
                      onClick={onLogout}
                      className="sidebar-logout flex shrink-0 items-center gap-1 rounded-xl border border-white/15 bg-white/[0.07] px-2 py-1.5 text-[11px] font-medium text-white/85 transition hover:bg-white/15 hover:text-white disabled:opacity-50"
                    >
                      <LogoutOutlined className="text-[12px]" />
                      <span className="sidebar-account-text">{t('登出')}</span>
                    </button>
                  </Tooltip>
                )}
              </div>
            ) : null}
          </section>
        </div>

        <nav aria-label={t('页面导航')} className="mt-5 flex-1 px-3">
          <ul className="space-y-1.5">
            {NAV_ITEMS.map((item) => {
              const active = route === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    title={t(item.name)}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => navigate(item.id)}
                    className={clsx(
                      'nav-item group relative flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[14px] font-medium transition-all duration-200',
                      active
                        ? 'bg-white text-brand-600 shadow-[0_10px_30px_-16px_rgba(0,30,80,0.8)]'
                        : 'text-white/85 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    <span
                      className={clsx(
                        'flex h-5 w-5 items-center justify-center text-[17px] transition-transform duration-200',
                        `nav-icon-${item.id}`,
                        active ? 'scale-105' : 'group-hover:scale-105',
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="sidebar-label flex-1 truncate">
                      {t(item.name)}
                    </span>
                    {item.id === 'downloads' && activeCount > 0 && (
                      <span className="sidebar-badge">
                        <Badge
                          count={activeCount}
                          size="small"
                          color={active ? '#1185fe' : '#ffffff'}
                          styles={{
                            indicator: active
                              ? undefined
                              : {
                                  color: '#1185fe',
                                  fontWeight: 700,
                                  boxShadow: 'none',
                                },
                          }}
                        />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="sidebar-footer px-5 pb-5 pt-3">
          <div className="mb-3 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <p className="text-[10px] leading-relaxed text-white/50">
            Bsky-Spider v{__APP_VERSION__}
          </p>
          <a
            href="https://bsky.app"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-white/60 transition hover:text-white"
          >
            {t('打开 Bluesky')}
            <ExportOutlined className="text-[9px]" />
          </a>
        </div>
      </div>
    </aside>
  );
};
