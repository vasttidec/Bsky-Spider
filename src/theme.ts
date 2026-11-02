import { theme as antdTheme, type ThemeConfig } from 'antd';
import type { ThemeName } from '../shared/types';

const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif';

const baseToken: ThemeConfig['token'] = {
  borderRadius: 10,
  fontFamily: FONT_FAMILY,
  fontSize: 13,
};

const baseComponents: ThemeConfig['components'] = {
  Button: {
    controlHeight: 36,
    borderRadius: 10,
    fontWeight: 500,
  },
  Input: { controlHeight: 36, borderRadius: 10 },
  InputNumber: { controlHeight: 36, borderRadius: 10 },
  Select: { controlHeight: 36, borderRadius: 10 },
  Modal: { borderRadiusLG: 18 },
  Tabs: { itemSelectedColor: '#1185fe', inkBarColor: '#1185fe' },
  Switch: { colorPrimary: '#1185fe' },
  Progress: { defaultColor: '#1185fe' },
};

export const THEME_OPTIONS: Array<{
  value: ThemeName;
  label: string;
}> = [
  { value: 'system', label: '跟随系统' },
  { value: 'default', label: 'Bluesky' },
  { value: 'dark', label: '暗黑' },
  { value: 'cyberpunk', label: '赛博朋克' },
];

const defaultTheme: ThemeConfig = {
  token: {
    ...baseToken,
    colorPrimary: '#1185fe',
    colorInfo: '#1185fe',
    colorLink: '#1185fe',
    colorText: '#12233a',
    colorTextSecondary: '#64748b',
    colorBgLayout: '#f4f9ff',
    colorBorder: '#dfe9f4',
  },
  components: {
    ...baseComponents,
    Button: {
      ...baseComponents?.Button,
      primaryShadow: '0 8px 20px -12px rgba(17, 133, 254, 0.8)',
    },
  },
  cssVar: true,
  hashed: false,
};

const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...baseToken,
    colorPrimary: '#64b5ff',
    colorInfo: '#64b5ff',
    colorLink: '#82c7ff',
    colorText: '#e7eefb',
    colorTextSecondary: '#94a7c1',
    colorBgBase: '#080d17',
    colorBgLayout: '#0a101b',
    colorBgContainer: '#111a29',
    colorBgElevated: '#162235',
    colorBorder: '#26374f',
    colorSplit: '#1d2c42',
    colorSuccess: '#43d9a3',
    colorWarning: '#f4c96b',
    colorError: '#ff6b81',
  },
  components: {
    ...baseComponents,
    Button: {
      ...baseComponents?.Button,
      primaryShadow: '0 10px 24px -14px rgba(100, 181, 255, 0.8)',
    },
    Tabs: { itemSelectedColor: '#82c7ff', inkBarColor: '#64b5ff' },
    Switch: { colorPrimary: '#64b5ff' },
    Progress: { defaultColor: '#64b5ff' },
  },
  cssVar: true,
  hashed: false,
};

const cyberpunkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...baseToken,
    borderRadius: 8,
    colorPrimary: '#ff38cf',
    colorInfo: '#28e7ff',
    colorLink: '#32e9ff',
    colorText: '#f4ecff',
    colorTextSecondary: '#b9a9d8',
    colorBgBase: '#05020c',
    colorBgLayout: '#070310',
    colorBgContainer: '#10091c',
    colorBgElevated: '#170d28',
    colorBorder: '#43265f',
    colorSplit: '#2c1943',
    colorSuccess: '#46ffc0',
    colorWarning: '#ffd166',
    colorError: '#ff4d7d',
    colorTextQuaternary: '#7f6f9c',
  },
  components: {
    Button: {
      controlHeight: 36,
      borderRadius: 6,
      fontWeight: 600,
      primaryShadow:
        '0 0 0 1px rgba(255, 56, 207, 0.35), 0 12px 30px -14px rgba(255, 56, 207, 0.9)',
    },
    Input: {
      controlHeight: 36,
      borderRadius: 6,
      activeBorderColor: '#28e7ff',
      hoverBorderColor: '#ff38cf',
    },
    InputNumber: { controlHeight: 36, borderRadius: 6 },
    Select: {
      controlHeight: 36,
      borderRadius: 6,
      optionSelectedBg: 'rgba(255, 56, 207, 0.2)',
    },
    Modal: { borderRadiusLG: 10, contentBg: '#0d0718', headerBg: '#0d0718' },
    Tabs: { itemSelectedColor: '#28e7ff', inkBarColor: '#ff38cf' },
    Switch: { colorPrimary: '#ff38cf' },
    Progress: { defaultColor: '#ff38cf' },
    Tag: { defaultBg: '#160d25', defaultColor: '#d9c9f5' },
  },
  cssVar: true,
  hashed: false,
};

export function getThemeConfig(name: ThemeName): ThemeConfig {
  if (name === 'dark') return darkTheme;
  if (name === 'cyberpunk') return cyberpunkTheme;
  return defaultTheme;
}

export function resolveThemeName(
  name: ThemeName,
  systemPrefersDark: boolean,
): Exclude<ThemeName, 'system'> {
  if (name !== 'system') return name;
  return systemPrefersDark ? 'dark' : 'default';
}
