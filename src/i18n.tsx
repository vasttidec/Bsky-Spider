import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/zh-tw';
import 'dayjs/locale/ru';
import type { LanguageSetting } from '../shared/types';
import { zhTW } from './locales/zh-TW';
import { ru } from './locales/ru';

export type UiLanguage = 'zh-CN' | 'zh-TW' | 'en' | 'ru';

interface I18nContextValue {
  language: UiLanguage;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  t: (key) => key,
});

/**
 * English translations. Chinese strings are used as stable keys so the
 * existing Chinese UI can be localized without duplicating source text.
 */
const en: Record<string, string> = {
  // App shell / boot
  '请确认本地 API 服务已启动。开发模式请同时运行': 'Make sure the local API service is running. In development, run',
  '生产模式请运行': 'For production, run',
  '未知错误': 'Unknown error',
  '使用 App Password': 'Use an App Password',
  '使用App Password，而不是账号主密码': 'Use an App Password, not your main password',
  '已通过 App Password 安全登录': 'Signed in securely with an App Password',
  '退出登录': 'Sign out',
  '已退出登录，并清除自动登录凭据': 'Signed out and cleared saved login credentials',
  '已清理本地登录状态': 'Local login state cleared',
  '打开 Bluesky': 'Open Bluesky',
  '主页': 'Home',
  '下载': 'Downloads',
  '设置': 'Settings',
  '关于': 'About',
  '发现与收藏': 'Discover & collect',
  '队列与媒体库': 'Queue & library',
  '偏好设置': 'Preferences',
  '外观、保存位置、命名模板与网络选项': 'Appearance, storage, naming templates, and network options',

  // Login
  '更安全的登录方式': 'A safer way to sign in',
  'Bsky-Spider 只使用 Bluesky 官方 App Password，应用密码可以随时撤销。Bsky-Spider 不会发布内容，也不会修改你的账号。':
    'Bsky-Spider only uses the official Bluesky App Password, which can be revoked at any time. Bsky-Spider will not publish content or modify your account.',
  '记住登录凭证': 'Remember login credentials',
  '勾选后，下次启动会自动使用该账号登录': 'When checked, the app will sign in with this account automatically next time',
  '下次启动自动登录': 'Sign in automatically next time',
  'Bluesky 账号': 'Bluesky account',
  '请输入账号或邮箱': 'Enter your handle or email',
  'alice.bsky.social 或邮箱': 'alice.bsky.social or email',
  'App Password': 'App Password',
  '请输入 App Password': 'Enter your App Password',
  '在 Bluesky 设置中创建 App Password': 'Create an App Password in Bluesky settings',
  '使用默认服务器': 'Use the default server',
  '自定义 PDS（进阶）': 'Custom PDS (advanced)',
  'PDS 地址': 'PDS URL',
  '请输入以 https:// 开头的 PDS 地址': 'Enter a PDS URL starting with https://',
  '仅当你使用自建的 AT Protocol 数据服务器时需要修改。': 'Only change this if you use a self-hosted AT Protocol data server.',
  '登录成功，但自动登录保存失败：': 'Signed in, but saving auto-login failed: ',
  '登录 Bluesky': 'Sign in to Bluesky',
  '登录中…': 'Signing in…',
  '关闭': 'Close',
  '保存': 'Save',
  '选择': 'Select',
  '加载中…': 'Loading…',
  '正在读取设置…': 'Loading settings…',
  '正在检测系统代理…': 'Detecting system proxy…',
  '已保存': 'Saved',
  '修改后自动保存': 'Changes are saved automatically',
  '正在自动保存…': 'Saving…',
  '设置保存失败，请检查填写内容': 'Could not save settings. Check the values and try again.',
  '设置未能保存': 'Settings could not be saved',
  '已恢复默认设置': 'Default settings restored',
  '已清空搜索历史': 'Search history cleared',

  // Home
  '搜索 Bluesky 用户，收集你喜欢图片与视频': 'Search Bluesky users and collect images and videos you like',
  '输入用户 Handle，或粘贴 bsky.app 个人主页链接': 'Enter a handle or paste a bsky.app profile link',
  '登录后即可搜索 Bluesky 用户': 'Sign in to search Bluesky users',
  '加载': 'Load',
  '加载中': 'Loading',
  '我的关注': 'My follows',
  '请输入 Bluesky 用户 Handle': 'Enter a Bluesky user handle',
  '加载失败': 'Failed to load',
  '加载更多失败': 'Failed to load more',
  '下载配置': 'Download settings',
  '扫描账号的媒体帖子，按日期与类型创建批量下载任务。': 'Scan an account’s media posts and create batch downloads by date and type.',
  '当前已加载': 'Loaded',
  '个匹配媒体': 'matching media items',
  '日期范围': 'Date range',
  '开始日期': 'Start date',
  '结束日期': 'End date',
  '全部时间': 'All time',
  '最近 7 天': 'Last 7 days',
  '最近 30 天': 'Last 30 days',
  '最近 6 个月': 'Last 6 months',
  '最近 1 年': 'Last year',
  '媒体类型': 'Media type',
  '请至少保留一种媒体类型': 'Keep at least one media type',
  '抓取上限': 'Scan limit',
  '最多向后扫描多少条媒体帖子。选择“全部”会一直翻页到末尾，耗时较长。':
    'Maximum number of posts to scan. “All” keeps paging to the end and may take longer.',
  '最近 100 条': 'Latest 100 posts',
  '最近 300 条': 'Latest 300 posts',
  '最近 500 条': 'Latest 500 posts',
  '最近 1000 条': 'Latest 1000 posts',
  '仅下载已加载': 'Download loaded',
  '开始下载': 'Start download',
  '已添加': 'Added',
  '这些媒体已经在下载队列中，无需重复添加': 'These media items are already in the download queue.',
  '没有找到符合筛选条件的媒体': 'No media matched the current filters.',
  '已创建': 'Created',
  '，跳过': ', skipped ',
  '个重复项': 'duplicates',
  '当前没有符合筛选条件的已加载媒体': 'No loaded media match the current filters.',
  '创建任务失败': 'Failed to create task',
  '已添加下载任务': 'Download task added',
  '下载全部': 'Download all',
  '下载所选': 'Download selected',
  '全选当前': 'Select all',
  '取消全选': 'Clear selection',
  '暂停': 'Pause',
  '继续': 'Resume',
  '删除': 'Delete',
  '打开原帖': 'Open post',
  '全选': 'Select all',
  '清空选择': 'Clear selection',
  '暂无媒体': 'No media',
  '没有匹配的媒体': 'No matching media',
  '已经到底啦 · Bluesky 没有尽头': 'You’ve reached the end · Bluesky goes on',
  '加载更多媒体': 'Load more media',
  '媒体预览': 'Media preview',
  '视频帖子': 'Video post',
  '图片帖子': 'Image post',
  '文件大小': 'File size',
  '尺寸': 'Dimensions',
  '发布时间': 'Published',
  '作者': 'Author',
  '下载选中': 'Download selected',
  '正在下载': 'Downloading',
  '正在连接': 'Connecting',
  '或': 'or',
  '。输入任意用户的 Handle，或加载你自己的媒体开始探索。':
    '. Enter any handle, or open your follows to start exploring.',
  '加载我自己的媒体': 'Load my media',

  // Follows
  '已加载': 'Loaded',
  '位': 'users',
  '重试': 'Retry',
  '关注列表加载失败': 'Failed to load follows',

  // Profile
  '已加载媒体': 'media loaded',
  '帖子': 'Posts',
  '粉丝': 'Followers',
  '关注': 'Following',
  '加入于': 'Joined',
  '在 Bluesky 查看': 'View on Bluesky',
  '加载该用户的媒体失败': 'Failed to load this user’s media',

  // Downloads page
  '刷新': 'Refresh',
  '保存文件夹': 'Open folder',
  '下载中': 'Downloading',
  '错误': 'Errors',
  '全部开始': 'Resume all',
  '全部暂停': 'Pause all',
  '清空列表': 'Clear list',
  '共': 'Total',
  '个进行中的任务，最多并发': 'active tasks, max concurrency',
  '个任务': 'tasks',
  '视频分段': 'Video segments',
  '图片': 'Image',
  '视频': 'Video',
  '已跳过': 'Skipped',
  '打开文件': 'Open file',
  '打开目录': 'Open folder',
  '重新下载': 'Download again',
  '移除任务': 'Remove task',
  '删除任务': 'Delete task',
  'ETA': 'ETA',
  '剩余': 'left',
  '已完成': 'Completed',
  '已暂停': 'Paused',
  '等待中': 'Waiting',
  '下载失败': 'Download failed',
  '本地文件已存在，已跳过': 'File already exists; skipped',
  '下载完成': 'Download complete',
  '个下载完成': 'downloads complete',
  '文件已保存到本地': 'Files saved locally',

  // Settings
  '主题': 'Theme',
  '跟随系统': 'Follow system',
  '默认': 'Default',
  '打开文件夹': 'Open folder',
  '暗黑': 'Dark',
  '赛博朋克': 'Cyberpunk',
  '外观': 'Appearance',
  '选择界面主题，修改后自动保存': 'Choose a theme; changes save automatically',
  '语言': 'Language',
  '系统语言': 'System language',
  '简体中文': 'Simplified Chinese',
  '英语': 'English',
  '繁体中文': 'Traditional Chinese',
  '俄语': 'Russian',
  by: 'by',
  '下载设置': 'Downloads',
  '下载文件夹': 'Downloads',
  '控制文件保存位置、命名方式与下载行为': 'Control save location, naming, and download behavior',
  '保存路径': 'Save location',
  'Bluesky 媒体文件将保存到这个文件夹。': 'Bluesky media will be saved to this folder.',
  '打开': 'Open',
  '选择路径': 'Choose folder',
  '恢复默认路径': 'Restore default path',
  '文件夹模板': 'Folder template',
  '支持多级文件夹，用 / 分隔；留空则直接保存到保存路径。':
    'Supports nested folders separated by /. Leave empty to save directly in the save location.',
  '文件名模板': 'File name template',
  '建议保留 %EXT% 变量，Bsky-Spider 会自动补全扩展名。':
    'Keep the %EXT% variable; Bsky-Spider fills in the extension automatically.',
  '文件夹模板可使用变量': 'Folder template supports variables',
  '文件名模板可使用变量': 'File name template supports variables',
  '参数写法：%POST_TIME,d=1% %TEXT,t=16%': 'Options: %POST_TIME,d=1% %TEXT,t=16%',
  '预览': 'Preview',
  '恢复默认模板': 'Restore default template',
  '跳过相同文件': 'Skip duplicate files',
  '保存目录中已存在同名文件时跳过下载，避免重复占用空间。':
    'Skip files that already exist in the destination to avoid duplicates.',
  '并发下载数': 'Concurrent downloads',
  '同时下载的任务数量。网络不稳定时建议调低。': 'Number of simultaneous downloads. Lower it on unstable networks.',
  'HLS 视频转封装': 'HLS video remux',
  '内置 MP4 合并引擎，HLS 回退流会无损转为 MP4，无需安装 ffmpeg。':
    'The built-in MP4 muxer converts HLS fallback streams losslessly; ffmpeg is not required.',
  '已就绪': 'Ready',
  '重新检测': 'Check again',
  '视频会优先下载原帖的原始 MP4；仅当原始文件不可用时才回退到 HLS 合并。':
    'Videos download the original MP4 first and only fall back to HLS muxing when needed.',
  '网络': 'Network',
  '当直接连接 Bluesky 较慢或无法访问时，可通过代理下载': 'Use a proxy if Bluesky is slow or unreachable',
  '启用代理': 'Enable proxy',
  '代理会用于 Bluesky API 请求和媒体下载。': 'The proxy is used for Bluesky API requests and media downloads.',
  '使用系统代理': 'Use system proxy',
  '自动读取 Windows 系统代理，免去手动填写地址。支持 HTTPS_PROXY / HTTP_PROXY 环境变量。':
    'Read the Windows system proxy automatically. HTTPS_PROXY / HTTP_PROXY are also supported.',
  '已检测到系统代理': 'System proxy detected',
  '重新检测系统代理': 'Detect system proxy again',
  '代理地址': 'Proxy URL',
  '当前使用系统代理。关闭“使用系统代理”后即可手动填写。':
    'Currently using the system proxy. Turn off “Use system proxy” to enter a manual URL.',
  '未填写': 'Not set',
  '请求超时': 'Request timeout',
  '单次 Bluesky API 或视频分段请求的超时时间。': 'Timeout for a single Bluesky API or video segment request.',
  '秒': 'seconds',
  '登录服务器': 'Login server',
  '默认使用 Bluesky 官方 PDS；自定义服务器可在登录弹窗中单独设置。':
    'Uses the official Bluesky PDS by default; a custom server can be set in the sign-in dialog.',
  '应用': 'Application',
  '通知、数据目录与运行环境': 'Notifications, data directory, and runtime',
  '应用数据': 'App data',
  '登录凭据经 Windows DPAPI 加密后保存在本机，用于下次自动登录；当前会话保存在内存中。设置与任务记录保存在下方显示的数据目录。':
    'Login credentials are encrypted with Windows DPAPI on this device for auto-login. The active session stays in memory. Settings and tasks are stored in the data directory shown below.',
  '打开数据目录': 'Open data directory',
  '清空搜索历史': 'Clear search history',
  '清除自动登录': 'Clear auto-login',
  '已清除自动登录凭据；下次启动需要重新登录': 'Auto-login credentials cleared; you will need to sign in again next time.',
  '清除自动登录凭据失败': 'Failed to clear auto-login credentials',
  '桌面版数据目录：与 Bsky-Spider.exe 同级的 data 文件夹': 'Desktop data folder: the “data” folder next to Bsky-Spider.exe',
  '运行环境': 'Runtime',
  'Bsky-Spider 完全在你的电脑上运行，媒体不会经过第三方中转。':
    'Bsky-Spider runs entirely on your computer; media never passes through a third party.',
  '版本': 'Version',
  '平台': 'Platform',
  '可用': 'Available',
  '已启用': 'Enabled',
  '未启用': 'Disabled',
  'API 服务': 'API service',
  '文件夹选择': 'Choose folder',
  '上级目录': 'Parent folder',
  '驱动器': 'Drives',
  '空文件夹': 'Empty folder',
  '加载目录失败': 'Failed to load directory',
  '打开文件夹失败': 'Failed to open folder',
  '这是一个必填项': 'This field is required',
  '模板变量': 'Template variables',
  '变量': 'Variable',
  '含义': 'Meaning',
  '复制': 'Copy',
  '已复制': 'Copied',
  '复制失败': 'Copy failed',

  // About
  '一只在 Bluesky 上收集光影的小蜘蛛': 'A little spider collecting light on Bluesky',
  '一个在本地运行的开源 Bluesky 媒体下载器。使用App Password安全登录，浏览用户主页，批量收藏图片与视频。':
    'An open-source, locally running Bluesky media downloader. Sign in safely with an App Password, browse user profiles, and save images and videos in batches.',
  '它是什么？': 'What is it?',
  'Bsky-Spider 保留 X-Spider 清晰的四页式交互：': 'Bsky-Spider keeps X-Spider’s clear four-page flow: ',
  '负责搜索与预览，': ' for search and preview, ',
  '负责进度与文件，': ' for progress and files, ',
  '管理保存路径和命名模板，': ' for save paths and naming templates, ',
  '记录来源与致谢。': ' for sources and credits.',
  '所有网络请求由本机 Node.js 服务发起，媒体文件直接写入你选择的文件夹。应用不会上传你的账号信息、Cookie、App Password 或下载内容到任何第三方服务器。':
    'All network requests are made by a local Node.js service, and media files are written directly to the folder you choose. The app does not upload your account information, cookies, App Passwords, or downloads to any third-party server.',
  'App Password 登录': 'App Password sign-in',
  '不接触账号主密码，凭据由 Windows DPAPI 加密': 'Never touches your main password; credentials are encrypted with Windows DPAPI',
  '批量抓取': 'Batch scraping',
  '按日期与类型筛选用户媒体帖子': 'Filter a user’s media posts by date and type',
  '模板命名': 'Template naming',
  '路径与文件名支持变量组合与自动清理': 'Paths and file names support variables and automatic sanitization',
  '标准协议': 'Open protocol',
  '直接调用 AT Protocol 官方 XRPC 接口': 'Calls the official AT Protocol XRPC APIs directly',
  '隐私与免责声明': 'Privacy and disclaimer',
  '桌面版会把 App Password 使用 Windows DPAPI 加密保存，用于下次自动登录；浏览器模式仅驻留内存。退出登录只结束当前会话，可在「账号管理」中随时切换回已保存的账号。':
    'The desktop app stores App Passwords encrypted with Windows DPAPI for auto-login; browser mode keeps them in memory only. Signing out only ends the current session; saved accounts stay available under "Accounts".',
  '任务记录保存在本机数据目录（桌面版为 Bsky-Spider.exe 同级的 data 文件夹），媒体保存在设置中的保存路径。':
    'Task records are stored in the local data directory (on desktop: the “data” folder next to Bsky-Spider.exe); media is stored in the save path configured in Settings.',
  '本工具仅用于备份你有权保存的内容。请遵守原作者版权与 Bluesky 社区规则。':
    'Use this tool only to back up content you have the right to save. Respect creators’ copyrights and Bluesky community rules.',
  '请勿将本工具用于批量抓取、骚扰或任何违反平台条款的用途。':
    'Do not use this tool for bulk scraping, harassment, or any use that violates platform terms.',
  '喜欢一位创作者的作品，记得在 Bluesky 上点赞、转发或关注支持 TA。':
    'If you enjoy a creator’s work, like, repost, or follow them on Bluesky to show your support.',
  '开源致谢': 'Open-source credits',
  '界面与交互蓝本': 'UI and interaction reference',
  '登录逻辑参考': 'Sign-in logic reference',
  '主页、下载、设置、关于四个页面的布局与交互方式参考了 X-Spider。感谢 MiningCattiva 开源这份优秀作品。':
    'The layout and interactions of Home, Downloads, Settings, and About reference X-Spider. Thanks to MiningCattiva for open-sourcing this excellent work.',
  'App Password 登录、作者 Feed 抓取、图片与视频媒体解析逻辑参考了该项目。感谢 maxreinartz 的探索。':
    'App Password sign-in, author feed fetching, and image/video media parsing reference this project. Thanks to maxreinartz for the exploration.',
  '本项目的界面布局与交互灵感来自 X-Spider，特此致谢。': 'The UI layout and interaction inspiration for this project come from X-Spider. With thanks.',
  '查看 GPL-3.0 许可证': 'View GPL-3.0 license',
  '去 Bluesky 看看': 'Visit Bluesky',
  '开放社交协议': 'Open social protocol',
  '管理登录凭据': 'Manage login credentials',

  // Misc
  '全部': 'All',
  '确定': 'OK',
  '取消': 'Cancel',
  '暂无数据': 'No data',
  '搜索': 'Search',
  '复制链接': 'Copy link',
  '已复制链接': 'Link copied',
  '视频以 HLS 分段下载': 'Video downloads as HLS segments',
  '下载时会自动抓取全部分段并合并': 'All segments are fetched and merged during download',
  'HLS 视频流': 'HLS video stream',
  '加载更多': 'Load more',
  '上一页': 'Previous',
  '下一页': 'Next',
  '文件': 'File',
  '目录': 'Folder',
  '文件夹': 'Folder',
  '保存位置': 'Save location',
  '创建时间': 'Created',
  '完成时间': 'Completed',
  '速度': 'Speed',
  '进度': 'Progress',
  '错误信息': 'Error',
  '任务': 'Task',
  '状态': 'Status',
  '操作': 'Actions',
  '取消下载': 'Cancel download',
  '移除': 'Remove',
  '关闭提示': 'Dismiss',
  '警告': 'Warning',
  '提示': 'Notice',
  '确认': 'Confirm',
  '未知': 'Unknown',
  '成功': 'Success',
  '失败': 'Failed',

  // Additional UI copy
  '主内容': 'Main content',
  '侧边栏': 'Sidebar',
  '头像': 'Avatar',
  'Bsky-Spider · Bluesky 媒体下载器':
    'Bsky-Spider · Bluesky media downloader',
  '无法连接到本地服务，请确认 Bsky-Spider 服务正在运行。':
    'Cannot connect to the local service. Make sure Bsky-Spider is running.',
  '上次保存的自动登录凭据已失效或网络不可用，请重新登录或检查代理设置。':
    'The saved auto-login credentials are invalid or the network is unavailable. Sign in again or check your proxy settings.',
  '请先加载用户': 'Load a user first',
  '请至少选择一种媒体类型': 'Select at least one media type',
  '请先选择要下载的媒体': 'Select media to download first',
  '没有可下载的媒体': 'No media available to download',
  '账号': 'Account',
  '页面导航': 'Page navigation',
  '在 Bluesky 查看个人主页': 'View profile on Bluesky',
  '登录引导': 'Sign-in guide',
  '把 Bluesky 上的灵感': 'Turn inspiration on Bluesky',
  '收藏到本地': 'into a local collection.',
  '登录后输入任意 Bluesky 用户的账号，即可浏览 TA 的图片与视频，并按日期、类型批量下载。':
    'After signing in, enter any Bluesky handle to browse that user’s images and videos and download them by date and type.',
  '如何获取？': 'How do I get one?',
  '图片与视频': 'Images and videos',
  '批量下载': 'Batch downloads',
  '本地存储': 'Stored locally',
  '傍晚的云层': 'Evening clouds',
  '4 张图片': '4 images',
  '一次登录': 'Sign in once',
  '随时收集': 'Collect anytime',
  '仅本机可见': 'Only visible on this device',
  '搜索与下载功能需要登录。Bsky-Spider 只读取公开媒体，不修改账号。':
    'Sign in to search and download. Bsky-Spider only reads public media and never modifies your account.',
  '登录': 'Sign in',
  '欢迎回来，@{{handle}}': 'Welcome back, @{{handle}}',
  '登录成功，但自动登录保存失败：{{error}}':
    'Signed in, but saving auto-login failed: {{error}}',
  '登录成功，但清除自动登录凭据失败：{{error}}':
    'Signed in, but clearing saved auto-login credentials failed: {{error}}',
  '未检测到可用的系统代理，请关闭“使用系统代理”并填写代理地址':
    'No system proxy detected. Turn off “Use system proxy” and enter a proxy URL.',
  '环境变量': 'Environment',
  '暂未检测到系统代理，下载时可能无法连接':
    'No system proxy detected. Downloads may fail to connect.',
  '请先在下方填写代理地址': 'Enter a proxy URL below first.',
  '请填写手动代理地址，否则代理请求会失败':
    'Enter a manual proxy URL, otherwise proxy requests will fail.',
  '用户信息': 'User information',
  '已加载 {{count}} 个媒体': '{{count}} media items loaded',
  '用户目录': 'Home',
  '选择保存文件夹': 'Choose save folder',
  '选择此文件夹': 'Select this folder',
  '输入完整路径后按回车': 'Enter a full path and press Enter',
  '前往': 'Go',
  '上一级': 'Up',
  '正在读取…': 'Reading…',
  '这个文件夹里没有子文件夹': 'This folder has no subfolders',
  '无法读取文件夹': 'Unable to read folder',
  '进入文件夹': 'Open folder',
  '所有文件已保存': 'All files saved',
  '共 {{count}} 个媒体': '{{count}} media items',
  '已选 {{count}} 项': '{{count}} selected',
  '没有符合条件的媒体': 'No media matches the filters',
  '试试调整日期范围或媒体类型，或者继续向下滚动加载更多。':
    'Try changing the date range or media type, or scroll down to load more.',
  '媒体列表': 'Media list',
  '正在加载更多媒体…': 'Loading more media…',
  '视频预览': 'Video preview',
  '图片预览': 'Image preview',
  'Bluesky 图片': 'Bluesky image',
  '（这条帖子没有文字内容）': '(This post has no text)',
  '下载视频': 'Download video',
  '下载图片': 'Download image',
  '视频下载为 HLS 分段': 'Videos download as HLS segments',
  '{{count}} 个下载完成': '{{count}} downloads complete',
  '操作失败': 'Operation failed',
  '删除下载任务': 'Delete download task',
  '只删除任务记录，已下载的文件不会从磁盘删除。':
    'Only the task record is removed; downloaded files remain on disk.',
  '任务已删除': 'Task deleted',
  '查看原帖': 'View post',
  '未知用户': 'Unknown user',
  '创建于 {{date}}': 'Created {{date}}',
  '文件已存在': 'File already exists',
  '等待开始': 'Waiting to start',
  '无法打开文件夹': 'Unable to open folder',
  '无法读取下载任务': 'Unable to read download tasks',
  '去主页收集媒体': 'Go to Home to collect media',
  '{{action}}成功': '{{action}} succeeded',
  '{{action}}失败': '{{action}} failed',
  '删除进行中的任务': 'Remove active tasks',
  '任务记录将被移除，未完成的临时文件会被清理，已下载完成的文件不会删除。':
    'Task records will be removed and unfinished temporary files cleaned up; completed files are kept.',
  '下载队列是空的': 'The download queue is empty',
  '去主页加载一个 Bluesky 用户，选择喜欢的图片或视频开始下载。':
    'Load a Bluesky user from Home, then choose images or videos to download.',
  '失败的下载可以重试；源文件过期时需要重新加载用户。':
    'Failed downloads can be retried; if the source expired, reload the user.',
  '全部重试': 'Retry all',
  '清除错误记录': 'Clear error records',
  '只删除错误的任务记录，已下载的文件不会受影响。':
    'Only failed task records are removed; downloaded files are unaffected.',
  '没有失败的任务': 'No failed tasks',
  '一切顺利。如果网络不稳定，下载失败的任务会出现在这里。':
    'All good. Failed downloads will appear here if the network is unstable.',
  '文件已保存到本地，点击文件名可直接打开。':
    'Files are saved locally. Click a file name to open it.',
  '打开保存目录': 'Open save folder',
  '清除已完成记录': 'Clear completed records',
  '只清理任务列表，磁盘上的文件不会被删除。':
    'Only the task list is cleared; files on disk are kept.',
  '还没有完成的下载': 'No completed downloads yet',
  '下载好的图片和视频会出现在这里，方便你快速打开。':
    'Downloaded images and videos will appear here for quick access.',
  '读取设置失败': 'Failed to read settings',
  '设置已保存': 'Settings saved',
  '保存失败': 'Save failed',
  '无法打开数据目录': 'Unable to open data directory',
  '下载完成提示': 'Download completion notice',
  '设置会自动保存，无需手动确认':
    'Settings save automatically; no manual confirmation needed',
  '可使用变量生成按用户或日期归档的文件夹。':
    'Use variables to organize folders by user or date.',
  '文件名中的非法字符会被自动替换，不会覆盖已有文件（除非重新下载）。':
    'Invalid file name characters are replaced automatically; existing files are not overwritten unless you download again.',
  '路径预览': 'Path preview',
  '示例基于用户 example.bsky.social 的一条图片帖子。':
    'Example based on an image post from example.bsky.social.',
  '恢复推荐模板': 'Restore recommended template',
  '1 – 6 个任务': '1–6 tasks',
  '视频引擎': 'Video engine',
  '内置': 'Built-in',
  '转封装只复制音视频流，不重新编码，速度很快且不会损失画质。':
    'Remuxing copies audio and video streams without re-encoding, so it is fast and lossless.',
  '当前使用手动代理：': 'Using manual proxy: ',
  '支持 HTTP / HTTPS 代理，例如 http://127.0.0.1:7890。请先填写地址，再启用代理。':
    'Supports HTTP/HTTPS proxies, for example http://127.0.0.1:7890. Enter the URL before enabling the proxy.',
  '10 – 120 秒': '10–120 seconds',
  '下载完成轻提示': 'Download completion notice',
  'Made for the open sky. 与 Bluesky, PBC 无隶属关系。':
    'Made for the open sky. Not affiliated with Bluesky, PBC.',
  '图片描述：': 'Image description: ',
  'ALT 文本': 'Alt text',
  '没有更多内容': 'No more content',
  '已复制 {{value}}': 'Copied {{value}}',
  '请手动输入 {{value}}': 'Please enter {{value}} manually',
  '收起变量列表': 'Hide variable list',
  '查看并复制可用变量': 'View and copy variables',
  '参数写法：': 'Options: ',
  '变量会被自动清理为合法文件名。点击变量可复制，然后粘贴到上方输入框。':
    'Variables are sanitized into valid file names. Click a variable to copy it, then paste it above.',
  '约 {{count}} 秒': '~{{count}}s',
  '约 {{minutes}} 分 {{seconds}} 秒': '~{{minutes}}m {{seconds}}s',
  '约 {{hours}} 小时 {{minutes}} 分': '~{{hours}}h {{minutes}}m',
  '未知时间': 'Unknown time',
  '刚刚': 'Just now',
  '{{count}} 分钟前': '{{count}}m ago',
  '{{count}} 小时前': '{{count}}h ago',
  '{{count}} 天前': '{{count}}d ago',
  '已加载 {{count}} 位': '{{count}} loaded',
  '选择一位用户，进入 TA 的媒体主页':
    'Choose a user to open their media page',
  '还没有关注任何用户': 'You are not following anyone yet',
  '搜索历史': 'Search history',
  '清空': 'Clear',
  '已连接 Bluesky': 'Connected to Bluesky',
  '未登录': 'Not signed in',
  '从 Bluesky 开始': 'Start with Bluesky',
  '在上方输入任何 Bluesky 用户的 Handle，例如':
    'Enter any Bluesky handle above, for example',
  '加载后即可浏览图片与视频，并批量保存到你的电脑。':
    'Load an account to browse images and videos and save them to your computer.',
  '查看我的关注': 'View my follows',
  '支持粘贴 bsky.app 个人主页链接': 'Paste a bsky.app profile link',
  '自动跳过重复文件': 'Skip duplicate files automatically',
  '可暂停 / 继续下载': 'Pause and resume downloads',
  '已登录为': 'Signed in as',
  '。输入任意用户的 Handle，或打开我的关注开始探索。':
    '. Enter any handle, or open My follows to start exploring.',
  '正在加载新的用户…': 'Loading a new user…',
  'Bsky-Spider 仅读取 Bluesky 公开媒体，下载内容请遵循原作者版权':
    'Bsky-Spider only reads public Bluesky media. Respect creators’ rights when downloading.',
  '没有更多媒体': 'No more media',
  '个下载任务': 'download tasks',
  '个已加载媒体': 'loaded media items',
  '已创建 {{count}} 个下载任务': 'Created {{count}} download tasks',
  '，跳过 {{count}} 个重复项': ', skipped {{count}} duplicates',
  '已添加 {{count}} 个已加载媒体': 'Added {{count}} loaded media items',
  '已添加 {{count}} 个下载任务': 'Added {{count}} download tasks',
  '帖子的 rkey，例如 3l5x...': 'The post rkey, for example 3l5x...',
  '发布日期与时间，可用 ,d=1 只保留日期':
    'Publish date and time; use ,d=1 to keep only the date',
  '例如 alice.bsky.social': 'For example alice.bsky.social',
  'Bluesky 上显示的昵称': 'The display name shown on Bluesky',
  '账号的永久标识': 'The permanent account identifier',
  '该媒体在本地的唯一标识': 'The unique local identifier for this media',
  '媒体在帖子中的序号，从 1 开始':
    'The media index within the post, starting at 1',
  'image 或 video': 'image or video',
  '媒体宽度（如有）': 'Media width (if available)',
  '媒体高度（如有）': 'Media height (if available)',
  '可用 ,t=16 截断到指定字符数':
    'Use ,t=16 to truncate to a specific number of characters',
  '带点的扩展名，例如 .jpg': 'Extension with a dot, for example .jpg',
  '已重新加入下载队列': 'Added back to the download queue',
  '重新下载这个文件？': 'Download this file again?',
  '新文件将覆盖原路径下的同名文件。':
    'The new file will overwrite the existing file at the same path.',
  'APP PASSWORD 安全登录': 'SECURE APP PASSWORD LOGIN',
  '使用 App Password 登录': 'Sign in with an App Password',
  '取消选择': 'Deselect',
  'Bluesky 媒体': 'Bluesky media',
  '刷新任务': 'Refresh tasks',
  '共 {{count}} 个进行中的任务，最多并发 {{concurrency}} 个':
    '{{count}} active tasks, max concurrency {{concurrency}}',
  '清除记录': 'Clear records',
  '（保存路径根目录）': '(save location root)',
  '当直连 Bluesky 较慢或无法访问时，可通过代理下载':
    'Use a proxy when Bluesky is slow or unreachable.',
  '搜索历史已清空': 'Search history cleared',
  '搜索用户': 'Search users',
  '选择此媒体': 'Select this media',
  '已添加到下载队列': 'Added to the download queue',
  '创建下载任务失败': 'Failed to create download task',
  '正在连接本地服务…': 'Connecting to the local service…',
  '无法启动 Bsky-Spider': 'Unable to start Bsky-Spider',
  '重新连接': 'Reconnect',
  '，生产模式请运行': ', and in production run ',

  '视频封装': 'Video muxing',
  '内置 MP4 合并引擎：HLS 回退流会无损封装为 MP4，只复制音视频流、不重新编码，无需安装 FFmpeg；输出文件带完整索引，可直接显示封面缩略图。': 'The built-in MP4 muxer converts HLS fallback streams losslessly: it copies the audio and video streams without re-encoding, needs no FFmpeg, and writes a fully indexed file that shows a cover thumbnail.',
  '视频优先下载原帖的原始 MP4；仅当原始文件不可用时才回退到 HLS 并封装。': 'Original MP4 files are downloaded first; HLS is only fetched and muxed when the original is unavailable.',
  '恢复默认设置': 'Restore default settings',
  '把主题、语言、保存路径、命名模板、并发、代理与超时恢复为初始值；已下载的文件与任务记录不会删除。': 'Reset the theme, language, save path, templates, concurrency, proxy and timeout to their initial values. Downloaded files and task records are kept.',
  '确定恢复默认设置？': 'Restore default settings?',
  '恢复': 'Restore',
  '恢复默认设置失败': 'Could not restore default settings',
  '单次 Bluesky API 请求的超时时间（默认 30 秒）。': 'Timeout for a single Bluesky API request (30 seconds by default).',
  '账号管理': 'Accounts',
  '保存多个账号，随时切换登录': 'Save several accounts and switch anytime',
  '浏览器模式不支持保存多个账号': 'Browser mode cannot store multiple accounts',
  '还没有保存的账号': 'No saved accounts yet',
  '登录时勾选“记住登录凭证”，即可保存多个账号并在此切换。': 'Enable “Remember login credentials” while signing in to save accounts and switch here.',
  '当前账号': 'Current',
  '切换': 'Switch',
  '删除该账号的登录凭据？': 'Delete the saved credentials for this account?',
  '添加账号': 'Add account',
  '已切换账号': 'Account switched',
  '切换账号失败': 'Could not switch account',
  '已删除该账号的登录凭据': 'Saved credentials removed',
  '删除账号失败': 'Could not remove the account',
  '已退出登录': 'Signed out',
  '勾选后，下次启动会自动使用该账号登录；可在“账号管理”中切换多个账号': 'When checked, this account signs in automatically next time; use “Accounts” to switch between saved accounts.',
  '当前环境不支持多账号切换': 'Account switching is not available in this environment',
  '账号标识不能为空': 'An account identifier is required',
  '没有找到该账号': 'Account not found',
  '内置封装失败，已保存为 .ts 文件': 'Muxing failed; saved as a .ts file instead',
  '原始文件下载失败，已停止以避免降低画质': 'The original file could not be downloaded; stopped to avoid lowering quality',
  '无法解析作者 PDS，已使用 Bluesky 转码版本': 'The author PDS could not be resolved; used the Bluesky transcoded version',
  '该帖子没有原始文件记录，已使用 Bluesky 转码版本': 'This post has no original-file record; used the Bluesky transcoded version',

  '登出': 'Sign out',
  '登录账号：{{account}}': 'Sign-in name: {{account}}',
  'exe 同级目录不可写，已回退到用户数据目录': 'The folder next to the exe is not writable; using the user data folder instead',
  '数据目录位于 Bsky-Spider.exe 同级的 data 文件夹': 'Data folder: the “data” folder next to Bsky-Spider.exe',
  '浏览器模式数据目录为项目下的 data 文件夹': 'Browser mode stores data in the project’s “data” folder',

  '当前账号已经登录': 'This account is already signed in',
  '自动登录': 'Sign in automatically',
  '已开启自动登录': 'Automatic sign-in enabled',
  '已关闭自动登录': 'Automatic sign-in disabled',
  '保存自动登录设置失败': 'Could not save the automatic sign-in setting',
  'Bsky-Spider 与 Bluesky, PBC 无隶属关系。': 'Bsky-Spider is not affiliated with Bluesky, PBC.',

  '保存登录凭证': 'Save sign-in credentials',
  '已保存登录凭证': 'Sign-in credentials saved',
  '已取消保存登录凭证，重启后将退出登录': 'Credentials will not be saved; you will be signed out on restart',
  '保存登录凭证设置失败': 'Could not update the saved-credentials setting',
  '检查更新': 'Check for updates',
  '后续版本将关联 GitHub Releases 自动检查新版本。': 'A later version will check GitHub Releases for new releases.',
  '检查更新功能将在后续版本接入 GitHub Releases。': 'Update checks will be connected to GitHub Releases in a later version.',

  '保留登录凭证': 'Keep sign-in credentials',
  '已保留登录凭证': 'Sign-in credentials kept',
  '已取消保留登录凭证，重启后将切换到其他已勾选账号或退出登录': 'Credentials will not be kept; on restart the next checked account is used, or you will be signed out',
  '更新登录凭证设置失败': 'Could not update the saved-credentials setting',
  '删除该账号的登录凭证？': 'Delete the saved sign-in credentials for this account?',
  '已删除该账号的登录凭证': 'Saved sign-in credentials deleted',
  '删除登录凭证': 'Delete sign-in credentials',

  '当前已经是最新版本': 'You are on the latest version',
  '已取消保留登录凭证，该账号将在下次启动前移除': 'Credentials will not be kept; this account is removed on next start',

  '发现新版本 v{{version}}': 'New version v{{version}} is available',
  '可在 GitHub Releases 页面下载新版本。': 'You can download the new version from the GitHub Releases page.',
  '前往下载': 'Download now',
  '检查更新失败：{{error}}': 'Update check failed: {{error}}',

  '当前平台没有系统代理设置': 'No system proxy is available on this platform',
  '自动读取系统代理：Windows 系统设置或 HTTPS_PROXY / HTTP_PROXY 环境变量。': 'Detects the system proxy automatically: Windows settings or the HTTPS_PROXY / HTTP_PROXY environment variables.',

  '最新版本': 'Latest version',
  'Linux 系统代理': 'Linux system proxy',
  'Linux 系统代理未启用': 'The Linux system proxy is not enabled',
  'Linux 系统代理已启用，但未找到有效的 HTTP/HTTPS 代理地址': 'The Linux system proxy is enabled, but no valid HTTP/HTTPS proxy address was found',
  '检测到系统 PAC 自动配置，当前版本不支持 PAC，请改用手动代理地址': 'A system PAC autoconfiguration was detected, but PAC is not supported; please use a manual proxy address',
  '自动读取系统代理：Windows 系统设置、Linux 桌面（GNOME/KDE）或 HTTPS_PROXY / HTTP_PROXY 环境变量。': 'Detects the system proxy automatically: Windows settings, Linux desktop (GNOME/KDE), or the HTTPS_PROXY / HTTP_PROXY environment variables.',

  '已设置网络位置：下载完成后会自动上传，文件不会保留在本地。': 'Network location selected: files are uploaded after downloading and are not kept locally.',
  '该文件保存在网络位置，无法在本地打开': 'This file is stored on a network location and cannot be opened locally.',
  '连接网络位置超时，请检查地址与网络': 'Timed out connecting to the network location; check the address and network.',
  '上传到网络位置超时，请检查地址与网络': 'Timed out uploading to the network location; check the address and network.',
  '无法创建网络位置目录，请确认地址指向一个可写的 WebDAV 目录': 'Could not create the network folder; make sure the address points to a writable WebDAV directory.',

  'Bluesky 媒体文件将保存到这个位置，支持本地目录、Windows 网络共享（\\\\server\\share）。': 'Bluesky media files are saved to this location; local folders and Windows network shares (\\\\server\\share) are supported.',
  'Bluesky 媒体文件将保存到这个位置。': 'Bluesky media files are saved to this location.',

  '流畅模式': 'Smooth mode',
  '关闭所有动画效果，降低轮询与特效开销，在不影响功能的前提下减少内存占用；默认关闭。': 'Turns off every animation and reduces polling and effect overhead to lower memory usage without affecting functionality; off by default.',

  '自动读取当前系统代理。': 'Automatically reads the current system proxy.',
  '设置与任务记录保存在下方显示的数据目录，数据目录位于 Bsky-Spider.exe 同级的 data 文件夹。': 'Settings and task records are stored in the data directory shown below, which is the data folder next to Bsky-Spider.exe.',
  '关闭所有动画效果，减少内存占用。': 'Turns off all animations to reduce memory usage.',
};

/**
 * Chinese translations for English source strings used as labels.
 * Chinese strings are passed through unchanged when no entry exists.
 */
const zh: Record<string, string> = {
  'DISCOVER & COLLECT': '发现与收藏',
  PREFERENCES: '偏好设置',
  ABOUT: '关于',
  'QUEUE & LIBRARY': '队列与媒体库',
  'APP PASSWORD 安全登录': 'App Password安全登录',
  'Bluesky media studio': 'Bluesky 媒体工作室',
  'Secure App Password login': '应用密码安全登录',
  'App Password': '应用密码',
  'App Password 登录': '应用密码登录',
  '使用 App Password': '使用应用密码',
  '使用 App Password 登录': '使用应用密码登录',
  '已通过 App Password 安全登录': '已通过应用密码安全登录',
  '在 Bluesky 设置中创建 App Password': '在 Bluesky 设置中创建应用密码',
  'Made for the open sky. 与 Bluesky, PBC 无隶属关系。':
    '为开阔的天空而生。与 Bluesky, PBC 无隶属关系。',
  '输入用户 Handle，或粘贴 bsky.app 个人主页链接':
    '输入用户账号，或粘贴 bsky.app 个人主页链接',
  '在上方输入任何 Bluesky 用户的 Handle，例如':
    '在上方输入任何 Bluesky 用户的账号，例如',
  '请输入 Bluesky 用户 Handle': '请输入 Bluesky 用户账号',
  '。输入任意用户的 Handle，或打开我的关注开始探索。':
    '。输入任意用户的账号，或打开我的关注开始探索。',
  '。输入任意用户的 Handle，或加载你自己的媒体开始探索。':
    '。输入任意用户的账号，或加载你自己的媒体开始探索。',
  '所有网络请求由本机 Node.js 服务发起，媒体文件直接写入你选择的文件夹。应用不会上传你的账号信息、Cookie、App Password 或下载内容到任何第三方服务器。':
    '所有网络请求由本机 Node.js 服务发起，媒体文件直接写入你选择的文件夹。应用不会上传你的账号信息、Cookie、应用密码或下载内容到任何第三方服务器。',
  'App Password 登录、作者 Feed 抓取、图片与视频媒体解析逻辑参考了该项目。感谢 maxreinartz 的探索。':
    '应用密码登录、作者动态抓取、图片与视频媒体解析逻辑参考了该项目。感谢 maxreinartz 的探索。',
};

let activeLanguage: UiLanguage = 'en';

// Russian is keyed by English copy so it can be maintained without duplicating
// the long Simplified Chinese dictionary keys.
const ruKeyOverrides: Record<string, string> = {
  用户目录: 'Домашняя папка',
};

export function detectSystemLanguage(): UiLanguage {
  if (typeof navigator === 'undefined') return 'en';
  const language = (navigator.language || 'en').toLowerCase();
  if (
    language === 'zh-tw' ||
    language === 'zh-hk' ||
    language === 'zh-mo' ||
    language.startsWith('zh-hant')
  ) {
    return 'zh-TW';
  }
  if (
    language === 'zh' ||
    language === 'zh-cn' ||
    language.startsWith('zh-hans')
  ) {
    return 'zh-CN';
  }
  if (language === 'ru' || language.startsWith('ru-')) return 'ru';
  if (language === 'en' || language.startsWith('en-')) return 'en';
  return 'en';
}

export function translate(
  key: string,
  params?: Record<string, string | number>,
): string {
  let text: string;
  if (activeLanguage === 'zh-CN') {
    text = zh[key] ?? key;
  } else if (activeLanguage === 'zh-TW') {
    text = zhTW[key] ?? key;
  } else if (activeLanguage === 'ru') {
    text =
      ruKeyOverrides[key] ??
      (en[key] ? ru[en[key]] : undefined) ??
      ru[key] ??
      en[key] ??
      key;
  } else {
    text = en[key] ?? key;
  }
  if (params) {
    text = text.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      String(params[name] ?? ''),
    );
  }
  return text;
}

export function translateError(message?: string | null): string {
  if (!message) return '';
  if (activeLanguage === 'zh-CN') return message;
  const hasChinese = /[\u4e00-\u9fff]/.test(message);
  if (!hasChinese) return message;
  const httpMatch = message.match(/^请求失败（HTTP (\d+)）$/);
  if (activeLanguage === 'zh-TW') {
    if (httpMatch) return `請求失敗（HTTP ${httpMatch[1]}）`;
    return (
      zhTW[message] ||
      '操作失敗，請檢查登入、代理或網路後再試一次。'
    );
  }
  if (activeLanguage === 'ru') {
    if (httpMatch) return `Ошибка запроса (HTTP ${httpMatch[1]})`;
    const english = en[message];
    return (
      (english && ru[english]) ||
      'Не удалось выполнить операцию. Проверьте вход, прокси или сеть и попробуйте снова.'
    );
  }
  if (httpMatch) return `Request failed (HTTP ${httpMatch[1]})`;
  return (
    en[message] ||
    'The operation failed. Check your login, proxy, or network and try again.'
  );
}

export const I18nProvider: React.FC<{
  language: LanguageSetting;
  children: React.ReactNode;
}> = ({ language, children }) => {
  const [systemLanguage, setSystemLanguage] = useState<UiLanguage>(() =>
    detectSystemLanguage(),
  );
  const resolved = language === 'system' ? systemLanguage : language;
  activeLanguage = resolved;

  useEffect(() => {
    if (language !== 'system') return;
    const onChange = () => setSystemLanguage(detectSystemLanguage());
    window.addEventListener('languagechange', onChange);
    return () => window.removeEventListener('languagechange', onChange);
  }, [language]);

  useEffect(() => {
    activeLanguage = resolved;
    document.documentElement.lang = resolved;
    document.title = 'Bsky-Spider';
    dayjs.locale(
      resolved === 'zh-CN'
        ? 'zh-cn'
        : resolved === 'zh-TW'
          ? 'zh-tw'
          : resolved === 'ru'
            ? 'ru'
            : 'en',
    );
  }, [resolved]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language: resolved,
      t: translate,
    }),
    [resolved],
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
