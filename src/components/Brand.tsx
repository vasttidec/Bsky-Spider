import React from 'react';
import clsx from 'clsx';
import { useI18n } from '../i18n';

export const BrandLogo: React.FC<{ size?: number; className?: string }> = ({
  size = 44,
  className,
}) => (
  <img
    src="/logo.png"
    width={size}
    height={size}
    alt="Bsky-Spider"
    className={clsx('select-none rounded-xl', className)}
    draggable={false}
  />
);

function initials(name?: string): string {
  const text = (name || '').trim();
  if (!text) return 'B';
  const chars = Array.from(text);
  return chars.slice(0, 1).join('').toUpperCase();
}

const GRADIENTS = [
  'from-sky-400 to-blue-600',
  'from-cyan-300 to-sky-500',
  'from-indigo-400 to-blue-600',
  'from-teal-300 to-cyan-600',
  'from-violet-400 to-indigo-600',
];

function gradientFor(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return GRADIENTS[hash % GRADIENTS.length];
}

export const UserAvatar: React.FC<{
  src?: string;
  name?: string;
  size?: number;
  className?: string;
  ring?: boolean;
}> = ({ src, name, size = 48, className, ring = false }) => {
  const { t } = useI18n();
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);

  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br font-semibold text-white',
        gradientFor(name || src || 'bsky'),
        ring && 'ring-2 ring-white/70 ring-offset-2 ring-offset-brand-500',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.36) }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={name || t('头像')}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
};
