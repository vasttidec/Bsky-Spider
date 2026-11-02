import dayjs from 'dayjs';
import type { TaskStatus } from '../../shared/types';
import { translate } from '../i18n';

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** index;
  return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${
    units[index]
  }`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond < 1) return '';
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatEta(seconds: number | null): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '';
  if (seconds < 60) {
    return translate('约 {{count}} 秒', { count: Math.ceil(seconds) });
  }
  if (seconds < 3600) {
    return translate('约 {{minutes}} 分 {{seconds}} 秒', {
      minutes: Math.floor(seconds / 60),
      seconds: Math.ceil(seconds % 60),
    });
  }
  return translate('约 {{hours}} 小时 {{minutes}} 分', {
    hours: Math.floor(seconds / 3600),
    minutes: Math.ceil((seconds % 3600) / 60),
  });
}

export function formatDate(value: string): string {
  const date = dayjs(value);
  return date.isValid()
    ? date.format('YYYY-MM-DD HH:mm')
    : translate('未知时间');
}

export function formatRelative(value: string): string {
  const date = dayjs(value);
  if (!date.isValid()) return '';
  const seconds = dayjs().diff(date, 'second');
  if (seconds < 60) return translate('刚刚');
  if (seconds < 3600) {
    return translate('{{count}} 分钟前', {
      count: Math.floor(seconds / 60),
    });
  }
  if (seconds < 86400) {
    return translate('{{count}} 小时前', {
      count: Math.floor(seconds / 3600),
    });
  }
  if (seconds < 86400 * 30) {
    return translate('{{count}} 天前', {
      count: Math.floor(seconds / 86400),
    });
  }
  return date.format('YYYY-MM-DD');
}

export function formatCount(value?: number): string {
  if (value === undefined || value === null) return '—';
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  }
  return `${(value / 1_000_000).toFixed(1)}m`;
}

export interface StatusMeta {
  label: string;
  color: string;
  dot: string;
}

export const TASK_STATUS_META: Record<TaskStatus, StatusMeta> = {
  waiting: { label: '等待中', color: 'text-slate-500', dot: 'bg-slate-400' },
  downloading: {
    label: '下载中',
    color: 'text-brand-600',
    dot: 'bg-brand-500',
  },
  paused: {
    label: '已暂停',
    color: 'text-amber-600',
    dot: 'bg-amber-400',
  },
  completed: {
    label: '已完成',
    color: 'text-emerald-600',
    dot: 'bg-emerald-500',
  },
  error: { label: '下载失败', color: 'text-rose-600', dot: 'bg-rose-500' },
};

export function mediaTypeLabel(kind: 'image' | 'video'): string {
  return kind === 'video' ? '视频' : '图片';
}

export function mediaSelectionKey(media: {
  postUri: string;
  id: string;
}): string {
  return `${media.postUri}|${media.id}`;
}

export function safeDisplayHandle(handle?: string): string {
  return handle ? `@${handle}` : '@unknown';
}

export function clampText(value: string, length: number): string {
  const chars = Array.from(value || '');
  if (chars.length <= length) return value;
  return `${chars.slice(0, length).join('')}…`;
}
