import React from 'react';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Empty,
  Modal,
  Popconfirm,
  Spin,
  Tag,
} from 'antd';
import {
  DeleteOutlined,
  LoginOutlined,
  PlusOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../stores/auth';
import { UserAvatar } from './Brand';
import { translateError, useI18n } from '../i18n';

export const AccountManagerModal: React.FC = () => {
  const { message } = App.useApp();
  const { t } = useI18n();
  const open = useAuthStore((state) => state.accountsOpen);
  const accounts = useAuthStore((state) => state.accounts);
  const loading = useAuthStore((state) => state.accountsLoading);
  const switching = useAuthStore((state) => state.switchingAccount);
  const user = useAuthStore((state) => state.user);
  const close = useAuthStore((state) => state.closeAccounts);
  const openLogin = useAuthStore((state) => state.openLogin);
  const switchAccount = useAuthStore((state) => state.switchAccount);
  const setSavedCredentials = useAuthStore(
    (state) => state.setSavedCredentials,
  );
  const removeAccount = useAuthStore((state) => state.removeAccount);
  const isDesktop = Boolean(window.bskyDesktop);

  const isSaved = (account: { saved?: boolean }): boolean =>
    account.saved !== false;

  const isCurrent = (account: {
    identifier: string;
    did?: string;
    handle?: string;
  }): boolean => {
    if (!user) return false;
    const candidates = [user.handle, user.did].filter(Boolean) as string[];
    const targets = [account.identifier, account.handle, account.did].filter(
      Boolean,
    ) as string[];
    return candidates.some((value) =>
      targets.some((target) => target.toLowerCase() === value.toLowerCase()),
    );
  };

  const onSwitch = async (identifier: string) => {
    try {
      await switchAccount(identifier);
      message.success(t('已切换账号'));
    } catch (error) {
      message.error(
        error instanceof Error
          ? translateError(error.message)
          : t('切换账号失败'),
      );
    }
  };

  const onRemove = async (account: { identifier: string }) => {
    try {
      await removeAccount(account.identifier);
      message.success(t('已删除该账号的登录凭证'));
    } catch (error) {
      message.error(
        error instanceof Error
          ? translateError(error.message)
          : t('删除账号失败'),
      );
    }
  };

  const onToggleSaved = async (
    account: { identifier: string },
    saved: boolean,
  ) => {
    try {
      await setSavedCredentials(account.identifier, saved);
      message.success(
        saved
          ? t('已保留登录凭证')
          : t('已取消保留登录凭证，该账号将在下次启动前移除'),
      );
    } catch (error) {
      message.error(
        error instanceof Error
          ? translateError(error.message)
          : t('更新登录凭证设置失败'),
      );
    }
  };

  const addAccount = () => {
    close();
    openLogin();
  };

  return (
    <Modal
      open={open}
      onCancel={close}
      footer={null}
      width={540}
      centered
      title={
        <div className="flex items-center gap-3 pb-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
            <SwapOutlined />
          </span>
          <div>
            <div className="text-[17px] font-bold text-ink">
              {t('账号管理')}
            </div>
            <div className="mt-0.5 text-[11px] font-normal text-slate-500">
              {t('保存多个账号，随时切换登录')}
            </div>
          </div>
        </div>
      }
    >
      <div className="pt-1">
        {!isDesktop && (
          <Alert
            type="info"
            showIcon
            className="!mb-3 !rounded-xl"
            message={t('浏览器模式不支持保存多个账号')}
          />
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Spin size="small" />
          </div>
        ) : accounts.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('还没有保存的账号')}
            className="!my-4"
          >
            <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
              {t('登录时勾选“记住登录凭证”，即可保存多个账号并在此切换。')}
            </p>
          </Empty>
        ) : (
          <ul className="space-y-2">
            {accounts.map((account) => {
              const current = isCurrent(account);
              const handle = (account.handle || account.identifier).replace(
                /^@/,
                '',
              );
              const name = account.displayName?.trim() || '';
              // The display name may look like the handle without its suffix,
              // so the full handle is always shown on its own line.
              const title = name && name !== handle ? name : `@${handle}`;
              const showIdentifier =
                account.identifier.replace(/^@/, '').toLowerCase() !==
                handle.toLowerCase();
              return (
                <li
                  key={account.identifier}
                  className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5"
                >
                  <UserAvatar
                    src={account.avatar}
                    name={name || handle}
                    size={40}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p
                        className="truncate text-[13px] font-semibold text-ink"
                        title={account.did || handle}
                      >
                        {title}
                      </p>
                      {current && (
                        <Tag className="!m-0 !rounded-full !border-0 !bg-emerald-50 !px-2 !text-[10px] !font-semibold !text-emerald-600">
                          {t('当前账号')}
                        </Tag>
                      )}
                    </div>
                    <p
                      className="truncate font-mono text-[11px] text-slate-400"
                      title={handle}
                    >
                      @{handle}
                    </p>
                    {showIdentifier && (
                      <p className="mt-0.5 truncate text-[10px] text-slate-400">
                        {t('登录账号：{{account}}', {
                          account: account.identifier,
                        })}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Checkbox
                      checked={isSaved(account)}
                      disabled={!isDesktop || switching !== null}
                      onChange={(event) =>
                        void onToggleSaved(account, event.target.checked)
                      }
                      className="!text-[11px]"
                    >
                      <span className="text-[11px] text-slate-500">
                        {t('保留登录凭证')}
                      </span>
                    </Checkbox>
                    <div className="flex items-center gap-1.5">
                      {!current && (
                        <Button
                          size="small"
                          type="primary"
                          ghost
                          icon={<LoginOutlined />}
                          loading={switching === account.identifier}
                          onClick={() => void onSwitch(account.identifier)}
                          className="!rounded-lg"
                        >
                          {t('切换')}
                        </Button>
                      )}
                      <Popconfirm
                        title={t('删除该账号的登录凭证？')}
                        okText={t('删除')}
                        cancelText={t('取消')}
                        onConfirm={() => void onRemove(account)}
                        disabled={current}
                      >
                        <Button
                          size="small"
                          type="text"
                          danger
                          disabled={current}
                          icon={<DeleteOutlined />}
                          aria-label={t('删除登录凭证')}
                          className="!rounded-lg"
                        />
                      </Popconfirm>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={addAccount}
            className="!rounded-lg"
          >
            {t('添加账号')}
          </Button>
          <Button onClick={close} className="!rounded-lg">
            {t('关闭')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
