import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { App as AntApp, Button, ConfigProvider, Result, Spin } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import zhTW from 'antd/locale/zh_TW';
import ruRU from 'antd/locale/ru_RU';
import { ReloadOutlined } from '@ant-design/icons';
import { SideBar } from './components/SideBar';
import { LoginModal } from './components/LoginModal';
import { AccountManagerModal } from './components/AccountManagerModal';
import { DownloadToast } from './components/DownloadToast';
import { HomePage } from './pages/HomePage';
import { DownloadsPage } from './pages/DownloadsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AboutPage } from './pages/AboutPage';
import { useRoute } from './hooks/useRoute';
import { useTaskPolling } from './hooks/useTaskPolling';
import { useAuthStore } from './stores/auth';
import { useSettingsStore } from './stores/settings';
import { useHomeStore } from './stores/home';
import { BrandLogo } from './components/Brand';
import { getThemeConfig, resolveThemeName } from './theme';
import { I18nProvider, translateError, useI18n } from './i18n';

const LoadingScreen: React.FC = () => {
  const { t } = useI18n();
  return (
    <div className="boot-screen">
      <div className="boot-glow" aria-hidden />
      <div className="relative z-10 flex flex-col items-center text-center">
        <BrandLogo size={86} className="animate-float shadow-lift" />
        <h1 className="mt-6 text-2xl font-black tracking-tight text-ink">
          Bsky-Spider
        </h1>
        <div className="mt-8 flex items-center gap-2 text-sm text-slate-500">
          <Spin size="small" />
          {t('正在连接本地服务…')}
        </div>
      </div>
    </div>
  );
};

const ErrorScreen: React.FC<{ message: string; onRetry: () => void }> = ({
  message,
  onRetry,
}) => {
  const { t } = useI18n();
  return (
    <div className="boot-screen">
      <div className="relative z-10 w-full max-w-lg">
        <Result
          status="warning"
          icon={<BrandLogo size={64} />}
          title={t('无法启动 Bsky-Spider')}
          subTitle={
            <div className="space-y-2 text-sm text-slate-500">
              <p>{translateError(message)}</p>
              <p className="text-xs text-slate-400">
                {t('请确认本地 API 服务已启动。开发模式请同时运行')}{' '}
                <code>npm run dev</code>
                {t('，生产模式请运行')}{' '}
                <code>npm run build &amp;&amp; npm start</code>。
              </p>
            </div>
          }
          extra={
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={onRetry}
              className="!rounded-xl"
            >
              {t('重新连接')}
            </Button>
          }
        />
      </div>
    </div>
  );
};

const ReadyApp: React.FC = () => {
  const { t } = useI18n();
  const [route, navigate] = useRoute();
  useTaskPolling();

  useEffect(() => {
    const onUnauthorized = () => {
      const auth = useAuthStore.getState();
      if (!auth.user) return;
      useAuthStore.setState({ user: null, loading: false });
      useHomeStore.getState().reset();
      auth.openLogin();
    };
    window.addEventListener('bsky-spider:unauthorized', onUnauthorized);
    return () =>
      window.removeEventListener('bsky-spider:unauthorized', onUnauthorized);
  }, []);

  return (
    <div className="app-frame">
      <SideBar route={route} navigate={navigate} />
      <main className="app-main" aria-label={t('主内容')}>
        <div key={route} className="route-view">
          {route === 'home' && <HomePage />}
          {route === 'downloads' && <DownloadsPage />}
          {route === 'settings' && <SettingsPage />}
          {route === 'about' && <AboutPage />}
        </div>
      </main>
      <LoginModal />
      <AccountManagerModal />
      <DownloadToast />
    </div>
  );
};

const AppInternal: React.FC = () => {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const bootstrapAuth = useAuthStore((state) => state.bootstrap);
  const loadSettings = useSettingsStore((state) => state.load);
  const loadSystem = useSettingsStore((state) => state.loadSystem);

  const bootstrap = useCallback(async () => {
    setState('loading');
    setError('');
    try {
      await Promise.all([bootstrapAuth(), loadSettings(), loadSystem()]);
      setState('ready');
    } catch (bootError) {
      setState('error');
      setError(
        bootError instanceof Error ? bootError.message : '未知错误',
      );
    }
  }, [bootstrapAuth, loadSettings, loadSystem]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (state === 'loading') return <LoadingScreen />;
  if (state === 'error') {
    return <ErrorScreen message={error} onRetry={() => void bootstrap()} />;
  }
  return <ReadyApp />;
};

const ThemedApp: React.FC = () => {
  const { language } = useI18n();
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches === true,
  );
  const themeName = useSettingsStore(
    (state) => state.settings?.theme ?? 'system',
  );
  const resolvedTheme = resolveThemeName(themeName, systemPrefersDark);
  const theme = useMemo(
    () => getThemeConfig(resolvedTheme),
    [resolvedTheme],
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) =>
      setSystemPrefersDark(event.matches);
    setSystemPrefersDark(query.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  return (
    <ConfigProvider
      theme={theme}
      locale={
        language === 'zh-CN'
          ? zhCN
          : language === 'zh-TW'
            ? zhTW
            : language === 'ru'
              ? ruRU
              : enUS
      }
      autoInsertSpaceInButton={false}
    >
      <AntApp message={{ maxCount: 3 }}>
        <AppInternal />
      </AntApp>
    </ConfigProvider>
  );
};

export const App: React.FC = () => {
  const language = useSettingsStore(
    (state) => state.settings?.language ?? 'system',
  );
  return (
    <I18nProvider language={language}>
      <ThemedApp />
    </I18nProvider>
  );
};
