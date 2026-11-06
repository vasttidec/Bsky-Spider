import type { ReactNode } from 'react';
import {
  DownloadOutlined,
  HomeFilled,
  InfoCircleFilled,
  SettingFilled,
} from '@ant-design/icons';

export type RouteId = 'home' | 'downloads' | 'settings' | 'about';

export interface NavItem {
  id: RouteId;
  name: string;
  hash: string;
  description: string;
  icon: ReactNode;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    name: '主页',
    hash: '#/home',
    description: '搜索并收集 Bluesky 上的图片与视频',
    icon: <HomeFilled />,
  },
  {
    id: 'downloads',
    name: '下载',
    hash: '#/downloads',
    description: '查看进度、暂停任务并管理本地文件',
    icon: <DownloadOutlined />,
  },
  {
    id: 'settings',
    name: '设置',
    hash: '#/settings',
    description: '保存位置、命名模板与网络选项',
    icon: <SettingFilled />,
  },
  {
    id: 'about',
    name: '关于',
    hash: '#/about',
    description: '关于 Bsky-Spider 与开源致谢',
    icon: <InfoCircleFilled />,
  },
];

export function routeFromHash(hash: string): RouteId {
  const clean = hash.replace(/^#\/?/, '').split('?')[0];
  if (clean === 'downloads' || clean === 'settings' || clean === 'about') {
    return clean;
  }
  return 'home';
}
