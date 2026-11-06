import React from 'react';
import clsx from 'clsx';
import { useI18n } from '../i18n';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  extra?: React.ReactNode;
  eyebrow?: string;
  /** Colour accent shared with the sidebar navigation icons. */
  tone?: 'home' | 'downloads' | 'settings' | 'about';
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  extra,
  eyebrow,
  tone,
}) => {
  const { t } = useI18n();
  return (
    <header className="page-header">
      <div className="flex min-w-0 items-center gap-4">
        <span
          aria-hidden
          className={clsx(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 bg-white text-[22px] shadow-[0_8px_20px_-12px_rgba(17,133,254,0.8)]',
            tone ? `page-icon-${tone}` : 'page-icon-default',
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-500/80">
              {t(eyebrow)}
            </p>
          )}
          <h1 className="truncate text-[28px] font-bold leading-tight text-ink">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 truncate text-sm text-slate-500">{subtitle}</p>
          )}
        </div>
      </div>
      {extra && <div className="ml-auto shrink-0">{extra}</div>}
    </header>
  );
};

export const SectionTitle: React.FC<{
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}> = ({ children, icon, className }) => (
  <h2
    className={clsx(
      'flex items-center gap-2 text-lg font-bold text-ink',
      className,
    )}
  >
    {icon && <span className="text-brand-500">{icon}</span>}
    {children}
  </h2>
);
