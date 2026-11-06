import React from 'react';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

/** Small question mark next to a title; shows the explanatory text on hover. */
const HelpDot: React.FC<{ text: ReactNode }> = ({ text }) => (
  <Tooltip title={text} placement="top">
    <QuestionCircleOutlined
      className="cursor-help text-[12px] text-slate-300 transition-colors hover:text-brand-400"
      aria-label="说明"
    />
  </Tooltip>
);

export const SettingsSection: React.FC<{
  title: string;
  children: ReactNode;
}> = ({ title, children }) => (
  <section className="settings-block">
    <h2 className="settings-block-title">{title}</h2>
    <div className="settings-card">
      <div className="px-5">{children}</div>
    </div>
  </section>
);

export const SettingRow: React.FC<{
  label: string;
  /**
   * Explanatory text. Rendered as a hover tooltip next to the label; when a
   * `tooltip` is also given, the description is appended after it.
   */
  description?: ReactNode;
  tooltip?: ReactNode;
  children: ReactNode;
  /** Rendered below the label/value grid, aligned with the label column. */
  footer?: ReactNode;
  className?: string;
}> = ({ label, description, tooltip, children, footer, className }) => {
  const helpText: ReactNode =
    description && tooltip ? (
      <>
        {tooltip}
        {' '}
        {description}
      </>
    ) : (
      tooltip ?? description
    );

  return (
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
            {helpText != null && <HelpDot text={helpText} />}
          </div>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
};
