import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircleFilled, CloudDownloadOutlined } from '@ant-design/icons';
import { useDownloadToastStore } from '../stores/toast';
import { useI18n } from '../i18n';

const TOAST_DURATION = 2000;

export const DownloadToast: React.FC = () => {
  const { t } = useI18n();
  const toast = useDownloadToastStore((state) => state.toast);
  const dismiss = useDownloadToastStore((state) => state.dismiss);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      dismiss();
    }, TOAST_DURATION);
    return () => window.clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;

  return createPortal(
    <div className="download-toast" role="status" aria-live="polite">
      <span className="download-toast-icon" aria-hidden>
        <CheckCircleFilled />
      </span>
      <span className="download-toast-body">
        <strong>
          {toast.count > 1
            ? t('{{count}} 个下载完成', { count: toast.count })
            : t('下载完成')}
        </strong>
        <span>
          {toast.count > 1 ? (
            <>
              <CloudDownloadOutlined /> {t('文件已保存到本地')}
            </>
          ) : (
            toast.fileName
          )}
        </span>
      </span>
    </div>,
    document.body,
  );
};
