import React from 'react';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

export const SettingsSection: React.FC<{
  title: string;
  icon: ReactNode;
  description?: string;
  children: ReactNode;
  headerExtra?: ReactNode;
}> = ({ title, icon, description, children, headerExtra }) => (
  <section className="settings-card">
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-base text-brand-500">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-bold text-ink">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-slate-400">{description}</p>
          )}
        </div>
      </div>
      {headerExtra}
    </div>
    <div className="px-5">{children}</div>
  </section>
);

export const SettingRow: React.FC<{
  label: string;
  description?: ReactNode;
  tooltip?: string;
  children: ReactNode;
  /** Rendered below the label/value grid, aligned with the label column. */
  footer?: ReactNode;
  className?: string;
}> = ({ label, description, tooltip, children, footer, className }) => (
  <div
    className={clsx(
      'border-b border-slate-100 py-4 last:border-b-0',
      className,
    )}
  >
    <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6">
      <div className="pt-0.5">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
          {label}
          {tooltip && (
            <Tooltip title={tooltip}>
              <QuestionCircleOutlined className="text-[11px] text-slate-300" />
            </Tooltip>
          )}
        </div>
        {description && (
          <div className="mt-1 text-[11px] leading-relaxed text-slate-400">
            {description}
          </div>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
    {footer && <div className="mt-3">{footer}</div>}
  </div>
);
