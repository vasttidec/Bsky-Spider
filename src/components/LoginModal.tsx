import React, { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Checkbox, Form, Input, Modal } from 'antd';
import {
  ExportOutlined,
  KeyOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../stores/auth';
import { useHomeStore } from '../stores/home';
import { BrandLogo } from './Brand';
import { translateError, useI18n } from '../i18n';

interface LoginValues {
  identifier: string;
  password: string;
  pds?: string;
}

export const LoginModal: React.FC = () => {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<LoginValues>();
  const open = useAuthStore((state) => state.loginOpen);
  const loading = useAuthStore((state) => state.loginLoading);
  const error = useAuthStore((state) => state.loginError);
  const login = useAuthStore((state) => state.login);
  const closeLogin = useAuthStore((state) => state.closeLogin);
  const refreshAccounts = useAuthStore((state) => state.refreshAccounts);
  const [customPds, setCustomPds] = useState(false);
  const [remember, setRemember] = useState(true);
  const credentialEpoch = useRef(0);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setCustomPds(false);
      setRemember(true);
      return;
    }

    let cancelled = false;
    const epoch = credentialEpoch.current;

    const prefillSavedCredentials = async () => {
      try {
        // When another account is already signed in, "Add account" must start
        // with a blank form instead of showing the current credentials.
        if (useAuthStore.getState().user) return;
        const result = await window.bskyDesktop?.loadCredentials?.();
        if (
          cancelled ||
          epoch !== credentialEpoch.current ||
          !result?.ok ||
          !result.credentials
        ) {
          return;
        }
        const current = form.getFieldsValue();
        if (current.identifier || current.password) return;
        const saved = result.credentials;
        form.setFieldsValue({
          identifier: saved.identifier,
          password: saved.password,
          pds: saved.pds,
        });
        if (saved.pds) setCustomPds(true);
      } catch {
        // Pre-filling is best-effort; the user can still type credentials.
      }
    };

    void prefillSavedCredentials();
    return () => {
      cancelled = true;
    };
  }, [open, form]);

  useEffect(() => {
    const onCredentialsCleared = () => {
      credentialEpoch.current += 1;
      form.resetFields();
      setCustomPds(false);
      setRemember(false);
      useAuthStore.setState({ loginError: null });
    };
    window.addEventListener(
      'bsky-spider:credentials-cleared',
      onCredentialsCleared,
    );
    return () =>
      window.removeEventListener(
        'bsky-spider:credentials-cleared',
        onCredentialsCleared,
      );
  }, [form]);

  const submit = async (values: LoginValues) => {
    const currentUser = useAuthStore.getState().user;
    const typed = values.identifier.trim().replace(/^@/, '').toLowerCase();
    if (currentUser && typed) {
      const currentKeys = [currentUser.handle, currentUser.did]
        .filter(Boolean)
        .map((value) => value.toLowerCase());
      if (currentKeys.includes(typed)) {
        message.info(t('当前账号已经登录'));
        return;
      }
    }
    try {
      await login({
        identifier: values.identifier,
        password: values.password,
        pds: customPds ? values.pds : undefined,
      });
      const user = useAuthStore.getState().user;
      const sameAccount = Boolean(
        currentUser && user && currentUser.did === user.did,
      );
      if (user) {
        if (sameAccount) {
          message.info(t('当前账号已经登录'));
        } else {
          useHomeStore.getState().setKeyword(user.handle);
          message.success(
            t('欢迎回来，@{{handle}}', { handle: user.handle }),
          );
        }
      }
      if (remember) {
        const saved = await window.bskyDesktop?.saveCredentials({
          identifier: values.identifier,
          password: values.password,
          pds: customPds ? values.pds : undefined,
          did: user?.did,
          avatar: user?.avatar,
          handle: user?.handle,
          displayName: user?.displayName,
        });
        if (saved && !saved.ok) {
          message.warning(
            t('登录成功，但自动登录保存失败：{{error}}', {
              error: translateError(saved.error) || t('未知错误'),
            }),
          );
        }
        await refreshAccounts();
      } else {
        const cleared = await window.bskyDesktop?.clearCredentials();
        if (cleared && !cleared.ok) {
          message.warning(
            t('登录成功，但清除自动登录凭据失败：{{error}}', {
              error: translateError(cleared.error) || t('未知错误'),
            }),
          );
        } else if (cleared?.ok) {
          window.dispatchEvent(new Event('bsky-spider:credentials-cleared'));
          await refreshAccounts();
        }
      }
    } catch {
      // The store exposes the message inside the modal.
    }
  };

  return (
    <Modal
      open={open}
      onCancel={closeLogin}
      width={520}
      centered
      destroyOnClose
      maskClosable={!loading}
      footer={
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="primary"
            loading={loading}
            onClick={() => form.submit()}
            className="!rounded-lg"
          >
            {t('登录 Bluesky')}
          </Button>
          <Button onClick={closeLogin} disabled={loading} className="!rounded-lg">
            {t('取消')}
          </Button>
        </div>
      }
      title={
        <div className="flex items-center gap-3 pb-1">
          <BrandLogo size={38} />
          <div>
            <div className="text-[17px] font-bold text-ink">
              {t('登录 Bluesky')}
            </div>
            <div className="mt-0.5 text-[11px] font-normal text-slate-500">
              {t('使用App Password，而不是账号主密码')}
            </div>
          </div>
        </div>
      }
    >
      <div className="pt-2">
        {error && (
          <Alert
            type="error"
            showIcon
            message={translateError(error)}
            className="!mb-4 !rounded-xl"
            closable
          />
        )}

        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={submit}
          autoComplete="off"
        >
          <Form.Item
            name="identifier"
            label={t('Bluesky 账号')}
            rules={[{ required: true, message: t('请输入账号或邮箱') }]}
          >
            <Input
              size="large"
              prefix={<UserOutlined className="text-slate-400" />}
              placeholder={t('alice.bsky.social 或邮箱')}
              autoComplete="username"
              autoFocus
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={t('App Password')}
            rules={[{ required: true, message: t('请输入 App Password') }]}
            extra={
              <a
                href="https://bsky.app/settings/app-passwords"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
              >
                <KeyOutlined />
                {t('在 Bluesky 设置中创建 App Password')}
                <ExportOutlined className="text-[10px]" />
              </a>
            }
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined className="text-slate-400" />}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              autoComplete="current-password"
            />
          </Form.Item>

          <button
            type="button"
            className="mb-3 text-xs text-slate-500 transition hover:text-brand-600"
            onClick={() => setCustomPds((value) => !value)}
          >
            {customPds
              ? `− ${t('使用默认服务器')}`
              : `+ ${t('自定义 PDS（进阶）')}`}
          </button>

          {customPds && (
            <Form.Item
              name="pds"
              label={t('PDS 地址')}
              initialValue="https://bsky.social"
              rules={[
                {
                  pattern: /^https:\/\/.+/i,
                  message: t('请输入以 https:// 开头的 PDS 地址'),
                },
              ]}
              extra={t('仅当你使用自建的 AT Protocol 数据服务器时需要修改。')}
            >
              <Input
                size="large"
                placeholder="https://bsky.social"
                spellCheck={false}
              />
            </Form.Item>
          )}
        </Form>

        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] leading-relaxed text-slate-500">
          <Checkbox
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            disabled={loading}
          >
            <span className="text-[12px] font-medium text-slate-700">
              {t('记住登录凭证')}
            </span>
          </Checkbox>
          <p className="mb-0 mt-1 text-[10px] leading-relaxed text-slate-400">
            {t('勾选后，下次启动会自动使用该账号登录；可在“账号管理”中切换多个账号')}
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/70 px-3.5 py-3">
          <div className="flex items-center gap-2">
            <SafetyCertificateOutlined className="text-[14px] text-brand-500" />
            <span className="text-[12px] font-semibold text-brand-800">
              {t('更安全的登录方式')}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            {t('Bsky-Spider 只使用 Bluesky 官方 App Password，应用密码可以随时撤销。Bsky-Spider 不会发布内容，也不会修改你的账号。')}
          </p>
        </div>
      </div>
    </Modal>
  );
};
