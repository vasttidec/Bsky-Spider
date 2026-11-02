import React, { useEffect, useState } from 'react';
import { Alert, Button, Empty, Input, Modal, Spin } from 'antd';
import {
  ArrowUpOutlined,
  DesktopOutlined,
  FolderFilled,
  FolderOpenOutlined,
  HomeOutlined,
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { DirectoryListing } from '../../../shared/types';
import { api } from '../../api';
import { useSettingsStore } from '../../stores/settings';
import { translateError, useI18n } from '../../i18n';

interface FolderPickerModalProps {
  open: boolean;
  initialPath: string;
  onCancel: () => void;
  onSelect: (path: string) => void;
}

export const FolderPickerModal: React.FC<FolderPickerModalProps> = ({
  open,
  initialPath,
  onCancel,
  onSelect,
}) => {
  const { t } = useI18n();
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState(initialPath);
  const system = useSettingsStore((state) => state.system);

  const load = async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listDirectories(target);
      setListing(result);
      setPathInput(result.path);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? translateError(loadError.message)
          : t('无法读取文件夹'),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void load(initialPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const quickPaths = [
    system?.homeDir
      ? { label: t('用户目录'), path: system.homeDir, icon: <HomeOutlined /> }
      : null,
    system?.downloadsDir
      ? {
          label: t('下载文件夹'),
          path: system.downloadsDir,
          icon: <DesktopOutlined />,
        }
      : null,
    system?.defaultSaveDir
      ? {
          label: 'Bsky-Spider',
          path: system.defaultSaveDir,
          icon: <FolderOpenOutlined />,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; path: string; icon: React.ReactNode }>;

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title={t('选择保存文件夹')}
      width={680}
      centered
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-left text-[11px] text-slate-400">
            {listing?.path}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button onClick={onCancel}>{t('取消')}</Button>
            <Button
              type="primary"
              disabled={!listing}
              onClick={() => {
                if (listing) {
                  onSelect(listing.path);
                  onCancel();
                }
              }}
            >
              {t('选择此文件夹')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 pt-1">
        <div className="flex gap-2">
          <Input
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
            onPressEnter={() => void load(pathInput)}
            placeholder={t('输入完整路径后按回车')}
            prefix={<FolderOpenOutlined className="text-slate-400" />}
            className="!rounded-xl"
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void load(pathInput)}
            className="!rounded-xl"
          >
            {t('前往')}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {listing?.drives.map((drive) => (
            <Button
              key={drive.path}
              size="small"
              onClick={() => void load(drive.path)}
              className="!rounded-lg"
            >
              {drive.name}
            </Button>
          ))}
          {quickPaths.map((item) => (
            <Button
              key={item.path}
              size="small"
              icon={item.icon}
              onClick={() => void load(item.path)}
              className="!rounded-lg"
            >
              {item.label}
            </Button>
          ))}
        </div>

        {error && (
          <Alert
            type="error"
            showIcon
            message={translateError(error)}
            className="!rounded-xl"
          />
        )}

        <div className="flex items-center gap-2">
          <Button
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={!listing?.parent}
            onClick={() => listing?.parent && void load(listing.parent)}
            className="!rounded-lg"
          >
            {t('上一级')}
          </Button>
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
              <Spin indicator={<LoadingOutlined spin />} size="small" />
              {t('正在读取…')}
            </span>
          )}
        </div>

        <div className="folder-list">
          {!loading && listing?.directories.length === 0 && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('这个文件夹里没有子文件夹')}
              className="!my-6"
            />
          )}
          {listing?.directories.map((directory) => (
            <button
              key={directory.path}
              type="button"
              className="folder-row"
              onClick={() => void load(directory.path)}
            >
              <FolderFilled className="text-[15px] text-brand-400" />
              <span className="truncate">{directory.name}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
};
