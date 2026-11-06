# Bsky-Spider

[English](README.md) | **简体中文** | [繁體中文](README.zh-TW.md) | [Русский](README.ru.md)

**Bluesky 媒体下载器**

> 当前版本：1.2.5
> 下载链接：https://github.com/vasttidec/Bsky-Spider/releases/tag/v1.2.5

Bsky-Spider 以 DeepSeek Harness 为框架，全程使用模型 DeepSeek-V4.1-Flash-1017 构建，推理等级配置为 Max。

Bsky-Spider 是一个完全在本机运行的 Bluesky 图片与视频下载工具：使用 **App Password** 安全登录，浏览任意用户的媒体帖子，按日期与类型批量下载，并尽可能保存**原始文件**而不是转码版本。界面沿用历代版本的四页结构（主页 / 下载 / 设置 / 关于），交互蓝本来自 [X-Spider](https://github.com/MiningCattiva/x-spider)。

![Bsky-Spider 主页](screenshots/home.png)

## 目录

- [功能](#功能)
- [下载原理](#下载原理)
- [安装与运行](#安装与运行)
- [登录与自动登录](#登录与自动登录)
- [使用流程](#使用流程)
- [文件命名模板](#文件命名模板)
- [设置项说明](#设置项说明)
- [数据、隐私与安全](#数据隐私与安全)
- [环境变量](#环境变量)
- [项目结构](#项目结构)
- [验证脚本](#验证脚本)
- [常见问题](#常见问题)
- [已知限制](#已知限制)
- [免责声明](#免责声明)
- [更新日志](#更新日志)
- [开源致谢与许可](#开源致谢与许可)

## 功能

- **App Password 登录**：不接触账号主密码；可勾选「记住登录凭证」，桌面版用 Windows DPAPI 加密保存，下次启动自动登录。
- **搜索用户**：支持 Handle、`@handle`、DID，或直接粘贴 `https://bsky.app/profile/...` 链接。
- **我的关注**：读取当前账号的关注列表，点选任意用户即可跳到 TA 的媒体主页。
- **媒体浏览**：拉取用户媒体帖子，自动解析图片、视频以及引用帖（`recordWithMedia`）里的媒体，网格预览并支持无限滚动。
- **搜索历史**：最近搜索的账号保存在本地数据目录，重启后仍可直接点选。
- **筛选与批量下载**：按日期范围、图片/视频类型、扫描上限（100/300/500/1000/全部）创建任务；支持单个下载、下载所选、一次下载当前筛选结果。
- **下载**：下载中 / 错误 / 已完成三个标签，实时进度、速度、ETA；支持暂停、继续、重试、删除、打开文件、打开所在文件夹。
- **原画质优先**：视频与图片都优先通过作者 PDS 的 `com.atproto.sync.getBlob` 下载原始 blob（原始 MP4 / JPEG / PNG），而不是 CDN 的 WebP 图片或 HLS 转码视频。
- **免 FFmpeg 的视频合并**：HLS 回退流由内置 TypeScript 封装器无损转成 MP4（仅复制音视频流，不重新编码）。
- **账号管理**：可保存多个账号（App Password 由 Windows DPAPI 加密），侧边栏一键切换；列表显示头像、昵称与完整 handle，并可为每个账号独立勾选「保留登录凭证」。
- **多主题**：跟随系统 / Bluesky / 暗黑 / 赛博朋克。
- **多语言**：系统语言、简体中文 (zh-CN)、繁体中文 (zh-TW)、英语 (en-US)、俄语 (ru-RU)。
- **代理支持**：自动读取 Windows 系统代理或 `HTTPS_PROXY` / `HTTP_PROXY` 环境变量，也可手动填写 HTTP/HTTPS 代理。
- **可配置**：保存路径、文件夹模板、文件名模板、跳过同名文件、并发数、请求超时、下载完成提示，并可一键恢复默认设置。
- **隐私**：所有请求由本机 Node.js 服务发起，媒体直接写入本机文件夹，不上传账号或下载内容。

## 下载原理

### 1. 媒体从哪里来

| 媒体 | 优先来源 | 回退来源 |
| --- | --- | --- |
| 视频 | 作者 PDS 上的**原始上传 MP4**（`com.atproto.sync.getBlob`） | Bluesky HLS 转码流（最高档位） |
| 图片 | 作者 PDS 上的**原始 blob**（JPEG / PNG / WebP 等原始格式） | CDN `fullsize`（通常是 WebP） |

Bluesky 的 CDN 对图片做格式转换，对视频提供 HLS 转码（常见档位为 360p / 720p）。原始文件只存在于作者的 PDS 上，因此 Bsky-Spider 会：

1. 通过 `did:plc` / `did:web` 的 DID 文档解析作者 PDS 地址（带缓存，同一作者只解析一次）；
2. 用 `cid` 调用 `com.atproto.sync.getBlob` 取得原始文件；
3. 用响应 `Content-Type` 决定扩展名（`.mp4` / `.jpg` / `.png` / `.webp` / `.gif` / `.avif` 等）；
4. 只有原始文件返回错误、或返回的内容不是图片/视频时，才回退到 CDN / HLS，并在任务上标注「原始文件不可用，已回退到 Bluesky 转码版本」。

> 实测：同一条视频，原始文件可能是 1080×1920，而 HLS 最高档位是 720×1280。

### 2. 下载引擎

单文件下载由 `server/download-engine.ts` 负责，行为与 X-Spider 借助 aria2 多连接下载的思路一致：

1. 先用 `HEAD`（失败时退化为 1 字节 Range 请求）探测 `Content-Type`、`Content-Length` 与是否支持 `Range`；
2. 若服务器支持分段且文件 ≥ 2 MB，按 **最多 6 个连接**并行分段写入同一文件；
3. 若服务器不支持分段（Bluesky 的 PDS blob 端点即如此），退化为单连接流式写入；
4. 每次尝试失败自动重试，最多 3 次，退避 600 ms 起；HTTP 4xx 与内容类型错误不重试；
5. 临时文件保留在目标目录（`.bsky-<任务ID>.part`），服务器支持 `Range` 时继续下载会从断点续传；
6. 网络超时保护：连接 20 s、响应头 45 s、数据静默 90 s。

### 3. HLS 回退

1. 读取主播放列表，按 `BANDWIDTH` / `RESOLUTION` 选择最高档位；
2. 解析媒体播放列表：分片列表、`EXT-X-MAP` 初始化段、`EXT-X-KEY` 加密标记（加密流会直接报错，不保存无法播放的文件）；
3. 分片以 **4 路并发**下载到 `.bsky-<任务ID>.parts/`，完成后按顺序合并；中断后「继续下载」会复用已经下完的分片，播放列表变化时自动作废旧分片；
4. 若流是 fMP4（`EXT-X-MAP` + `.m4s`），初始化段 + 分片顺序拼接即为可播放 MP4；
5. 若流是 MPEG-TS（Bluesky 当前的转码格式），交由内置封装器处理。

### 4. 内置 MP4 合并引擎（替代 FFmpeg）

`server/remux/` 是一个只做「流复制」的 MPEG-TS → MP4 转换器，全部用 TypeScript 实现：

| 模块 | 职责 |
| --- | --- |
| `ts-demux.ts` | 解析 188 字节 TS 包、PAT/PMT、PES 头，提取 H.264 / AAC 基本流与 PTS/DTS |
| `h264.ts` | Annex B 拆分、SPS 解析（分辨率 / 帧率）、生成 `avcC`、把访问单元转成 MP4 样本 |
| `aac.ts` | ADTS 拆帧、生成 `AudioSpecificConfig` |
| `mp4-writer.ts` | 写 `ftyp` / `mdat` / `moov`（`mvhd`、`tkhd`、`mdhd`、`hdlr`、`stsd`、`avcC`、`esds`、`stts`、`ctts`、`stss`、`stsc`、`stsz`、`stco` 等） |
| `index.ts` | 时间轴归一化、音视频起点对齐、调用封装器输出 MP4 |

特点：

- **只复制，不重新编码**，画质与原流完全一致；
- 自动处理 33 位时间戳回绕与分片时间戳重启，音视频始终同步；
- 输出为渐进式 MP4（`moov` 在文件末尾），Chromium / Windows / 常见播放器都可直接播放；
- 转化失败时不会丢文件：保留 `.ts` 并在任务上提示「视频封装失败，已保留为 .ts 文件」；
- MP4 采用 faststart 布局（`moov` 在 `mdat` 之前），播放器与 Windows 资源管理器可以立即读取时长并生成封面缩略图。
- 只有在封装器无法解析该流（例如编码不是 H.264/AAC）时才会保留 `.ts`，任务上会明确标注。

## 安装与运行

### 方式一：ZIP 免安装版（推荐）

1. 从仓库下载 `Bsky-Spider-1.2.5-win-x64.zip`（或直接使用本机 `release/` 中的同名文件）并解压；
2. 进入 `Bsky-Spider` 文件夹，双击 **`Bsky-Spider.exe`**；
3. 无需安装，也无需 Node.js 或 FFmpeg。

SHA256（ZIP）：`4069D3F8037BF166FEDC0BE9F21EB9850D1CFC38005FC51A2AC2C13E37003F6B`

- 如果 Windows 提示「文件来自网络」，先右键 ZIP → 属性 → 勾选「解除锁定」，再解压；
- 不要在压缩包预览窗口中直接双击 exe；
- 启动失败时查看 exe 同级 `data\server.log`（不可写时为 `%APPDATA%\Bsky-Spider\data\server.log`）。

### 其他安装包

- **Windows 安装程序**：`Bsky-Spider-1.2.5-win-x64-setup.exe`，默认安装到 `C:\Program Files\Bsky-Spider`（全机安装，需要管理员权限），安装最后一页可选择创建桌面快捷方式与立即启动。
- **Linux**：`Bsky-Spider-1.2.5.AppImage` 与 `Bsky-Spider-1.2.5.deb`（x64），默认下载目录为 `~/Downloads/Bsky-Spider`。

### 方式二：从源码运行

需要 **Node.js 20 或更高版本**。

```bash
npm install
npm run build
npm start            # 打开 http://127.0.0.1:5179
```

Windows 也可以直接双击 **`start-bsky-spider.bat`**：脚本会安装依赖、构建并启动，然后打开浏览器。

开发模式（Vite 热更新 + API 服务）：

```bash
npm run dev
# UI:  http://127.0.0.1:5178
# API: http://127.0.0.1:5179
```

### 重新打包

```bash
npm run build:exe       # release/Bsky-Spider-1.2.5-portable.exe
npm run build:zip       # release/Bsky-Spider-1.2.5-win-x64.zip（含 win-unpacked 目录）
```

`build:zip` 内部会执行 `build:exe:dir`（生成 `release/win-unpacked`）与 `scripts/build-zip.ps1`。

## 登录与自动登录

1. 在 Bluesky 中打开 **Settings → App Passwords**（<https://bsky.app/settings/app-passwords>）；
2. 创建 App Password，复制形如 `xxxx-xxxx-xxxx-xxxx` 的凭据；
3. 在 Bsky-Spider 侧边栏点击 **登录 Bluesky**，填写 Handle（或邮箱）与 App Password；
4. 登录窗口可勾选 **记住登录凭证**（默认勾选）。

- 桌面版把账号、App Password 与可选的自定义 PDS 用 **Windows DPAPI** 加密后保存在 `<exe 同级>/data/accounts.enc`，下次启动自动登录；
- 自动登录失败（凭据被撤销、网络或代理不可用）时会打开登录窗口，并预填已保存的账号；
- 点击侧边栏 **账号管理** 可以在已保存的账号之间切换、添加或删除账号；每个账号的 App Password 都单独用 Windows DPAPI 加密保存；
- 在「账号管理」中可为每个账号独立勾选 **保留登录凭证**：当前账号已勾选时会在下次启动自动登录；取消勾选的账号会在下次启动前被移除（不再出现在账号管理中，也无法切换）；删除某个账号的凭证也可直接在「账号管理」中点删除；
- 点击 **登出** 会删除当前账号的登录凭证；若还有其他已保存账号，会自动切换并登录其中一个，否则进入完全登出状态（侧边栏只保留「登录 Bluesky」）；
- 浏览器 / 源码模式没有 Electron 安全存储，凭据只驻留内存，不会自动登录；
- 使用自建 PDS 时可在登录窗口展开「自定义 PDS（进阶）」填写地址，登录流程会自动校验 HTTPS。

## 使用流程

1. 主页输入用户 Handle（例如 `bsky.app`）并点击 **加载**；
2. 用日期范围、媒体类型、抓取上限筛选；网格可悬停预览、单独下载或打开原帖；
3. 勾选多个媒体后点 **下载所选**，或直接 **开始下载** 让服务端回扫该用户的媒体帖子；
4. 在 **下载** 查看进度，暂停 / 继续 / 重试 / 打开文件；
5. 在 **设置** 调整保存位置、模板、并发、代理等，修改后自动保存。

下载完成后，应用窗口顶部居中会显示约 **2 秒**的轻提示（多个任务合并计数），可在 **设置 → 应用 → 下载完成提示** 中关闭。

### 暂停与继续

- 暂停会立即中止当前连接；已写下的数据保留在临时文件中；
- 继续时会重新排队：原始文件下载会尽可能从断点续传（服务器支持 `Range` 时），HLS 回退会直接复用已经下载完成的分片；
- 重启应用后，未完成的任务会恢复为「等待」，可继续或删除。

## 文件命名模板

默认模板：

```text
文件夹：%USER_HANDLE%
文件名：%POST_TIME%_%USER_HANDLE%_%MEDIA_ID%%EXT%
```

可用变量：

| 变量 | 含义 |
| --- | --- |
| `%POST_ID%` | 帖子的 rkey |
| `%POST_TIME%` | 发布时间；`%POST_TIME,d=1%` 仅日期 |
| `%USER_HANDLE%` | 用户 Handle |
| `%USER_NAME%` | 用户昵称 |
| `%USER_DID%` | 用户 DID |
| `%MEDIA_ID%` | 媒体在帖子内的标识 |
| `%MEDIA_INDEX%` | 媒体在帖子中的序号（从 1 开始） |
| `%MEDIA_TYPE%` | `image` / `video` |
| `%MEDIA_WIDTH%` / `%MEDIA_HEIGHT%` | 媒体尺寸（如有） |
| `%TEXT%` | 帖子文本；`%TEXT,t=16%` 截断到 16 字符 |
| `%EXT%` | 扩展名（含点），按实际响应的内容类型自动修正 |

- 文件夹模板支持 `/` 分隔多级目录，留空则直接保存到保存路径；
- 变量值中的非法字符会被替换，Windows 保留文件名会被自动加前缀，避免路径穿越与覆盖；
- 「设置」中提供实时路径预览与一键恢复推荐模板。

## 设置项说明

| 分组 | 设置 | 说明 |
| --- | --- | --- |
| 外观 | 主题 | 跟随系统 / Bluesky / 暗黑 / 赛博朋克，系统主题变化时实时更新 |
| 外观 | 语言 | 跟随系统 / 简体中文 / 繁体中文 / 英语 / 俄语 |
| 存储 | 保存路径 | 媒体保存根目录，默认 `~/Downloads/Bsky-Spider`，可打开或重新选择 |
| 存储 | 文件夹模板 | 支持变量与多级目录 |
| 存储 | 文件名模板 | 支持变量，自动补全扩展名 |
| 下载 | 跳过相同文件 | 目标文件已存在时跳过（默认开启） |
| 下载 | 并发下载数 | 同时下载的任务数，1–6，默认 3 |
| 网络 | 启用代理 | 代理同时用于 Bluesky API 与媒体下载 |
| 网络 | 使用系统代理 | 自动读取 Windows 代理 / `HTTPS_PROXY` / `HTTP_PROXY`，也可关闭后手动填写 |
| 网络 | 代理地址 | 手动 HTTP/HTTPS 代理，例如 `http://127.0.0.1:7890` |
| 网络 | 请求超时 | 单次 Bluesky API 请求超时，10–120 秒，默认 30 |
| 应用 | 下载完成提示 | 窗口内轻提示开关，默认开启 |
| 应用 | 检查更新 | 读取 GitHub Releases 并与当前版本比较，可打开下载页面 |
| 应用 | 数据目录 | 显示当前数据目录，可一键打开 |
| 应用 | 恢复默认设置 | 一键恢复主题、语言、保存路径、模板、并发、代理与超时（不影响已下载文件与任务记录） |
| 应用 | 运行环境 | 版本、Node.js、平台、视频引擎、AppView、API 地址 |

内置 MP4 合并引擎随应用一起启动，始终启用，不依赖任何外部程序；设置页不再显示相关选项。

## 数据、隐私与安全

- 桌面版数据目录：**`Bsky-Spider.exe` 同级的 `data` 文件夹**——只要该文件夹存在就一定读取；仅在不存在且无法创建时才使用 `%APPDATA%\Bsky-Spider\data`；首次启动会自动迁移旧数据
- 浏览器 / 源码模式：项目下的 `data/`
- 设置 `settings.json`、任务记录 `tasks.json`、搜索历史 `history.json`（按账号 DID 分区保存）
- 自动登录凭据：`data/accounts.enc`（Windows DPAPI 加密，可保存多个账号）
- 运行日志：`data/server.log`
- 启动诊断：`%APPDATA%\Bsky-Spider\startup.log`（记录实际使用的数据目录与迁移结果）
- 当前会话：仅服务端内存 + HttpOnly Cookie
- 下载文件：设置中的保存路径，默认 `~/Downloads/Bsky-Spider`
- 服务只监听 `127.0.0.1`，不对局域网开放

应用不会发布内容、不会修改账号，也不会把账号信息、Cookie、App Password 或下载内容发送到任何第三方服务器。媒体请求由本机服务直接发往 Bluesky / 作者 PDS。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `BSKY_SPIDER_PORT` | `5179` | API / 生产页面端口 |
| `BSKY_SPIDER_HOST` | `127.0.0.1` | 监听地址 |
| `BSKY_SPIDER_DATA_DIR` | `./data` | 设置与任务数据目录 |
| `BSKY_SPIDER_APPVIEW` | `https://public.api.bsky.app` | AppView 地址 |
| `BSKY_SPIDER_PDS` | `https://bsky.social` | 默认 PDS 登录地址 |
| `BSKY_SPIDER_OPEN` | 未设置 | 设为 `1` 启动后自动打开浏览器 |
| `BSKY_SPIDER_AUTO_LOGIN` | 未设置 | 私有：桌面主进程传给本地服务的一次性自动登录凭据 |

## 项目结构

```text
src/                  React 页面、组件、i18n 与 Zustand 状态
server/
  index.ts            Express API 与静态资源服务
  bsky.ts             Bluesky XRPC 客户端、媒体解析、Feed 抓取
  auth.ts             登录 / 会话 / 限流
  pds.ts              DID 文档解析、原始 blob URL
  downloads.ts        下载队列、任务状态、候选来源与回退
  download-engine.ts  单文件下载引擎（多连接 / 重试 / 续传）
  hls.ts              HLS 播放列表解析
  remux/              内置 MPEG-TS → MP4 封装器（替代 FFmpeg）
  proxy.ts            系统代理检测
  storage.ts          设置持久化
  http.ts             undici + 代理 + 超时封装
shared/               前后端共享类型与命名模板
electron/             Electron 主进程、preload、启动画面与 Logo
public/               界面 Logo、PWA manifest、许可证
build/                打包图标（icon.ico / icon-512.png）
scripts/              验证、UI 自动化与截图脚本
data/                 运行时生成（已 gitignore）
```

技术栈：

- 前端：React 18、TypeScript、Vite、Ant Design 5、Tailwind CSS、Zustand、Day.js
- 服务端：Node.js、Express、undici（HTTP/HTTPS 代理）、文件系统流式下载
- 媒体处理：项目内置 TypeScript H.264/AAC 解封装与 MP4 封装（无外部二进制）
- 协议：AT Protocol XRPC（`com.atproto.server.createSession`、`app.bsky.actor.getProfile`、`app.bsky.feed.getAuthorFeed`、`com.atproto.sync.getBlob`）

## 验证脚本

安装依赖并构建后运行。

```bash
npm run test             # TypeScript 类型检查
npm run test:original    # 真实网络：原始 JPEG/MP4 下载 + HLS 回退内置封装并校验 MP4 结构
npm run test:auth        # App Password 登录、JWT 刷新、Feed 媒体解析（本地 mock）
npm run test:server      # HTTP 登录 Cookie、会话、鉴权、批量下载、登出（本地 mock）
npm run test:download    # 图片 + HLS 分片合并；已完成文件缺失时重新下载
npm run test:pause       # 暂停、立即继续、Range 续传
npm run test:proxy       # 系统代理检测并通过代理访问 Bluesky（需要网络）
npm run test:proxy-auto  # 检测到系统代理时自动启用，且手动关闭后不被重置
npm run test:auto-login  # 自动登录与代理设置跨重启持久化
npm run test:history    # 搜索历史按账号隔离与旧数据迁移（本地）
```

UI 自动化与截图需要本机 Chrome / Edge，并且先启动生产服务：

```bash
npm start
# 另一个终端
npm run test:ui      # 登录、搜索、预览、下载、设置保存、关于、移动端布局
npm run screenshot   # 生成 screenshots/*.png（使用模拟数据）
```

`test:original` 会：

1. 从真实帖子下载图片与视频的原始 blob，校验 JPEG 魔数与 MP4 `ftyp/moov`；
2. 对同一条视频强制走 HLS 回退，校验输出为带 `moov` / `mdat` / `avcC` 的 MP4，并检查时长；
3. 用一个多分片、带音频的视频校验音轨被正确写入（`mp4a`），并与源分片 PMT 中的音频流对照。

## 常见问题

**Q：还需要安装 FFmpeg 吗？**

不需要。1.0.0 起应用不包含也不调用 FFmpeg，HLS 转封装由内置 TypeScript 引擎完成，并且总是输出 MP4。

**Q：为什么有的视频只有 720p？**

Bluesky 的 HLS 转码通常只提供 360p / 720p 档位。Bsky-Spider 会优先下载作者 PDS 上的原始 MP4（例如 1080×1920）；只有原始文件被清理时才会落到 HLS 档位，并在任务上标注。

**Q：下载的图片是 WebP，不是原图？**

说明该帖子的原始 blob 已不可用，回退到了 CDN 的 `fullsize`，CDN 统一返回 WebP。原始 blob 可用时会保存为 JPEG / PNG。

**Q：为什么任务失败提示「原始文件不可用」？**

作者 PDS 上的 blob 可能已被删除或该 PDS 不允许匿名读取，此时会自动回退到转码版本；回退成功时任务仍会显示完成，只是带备注。

**Q：代理怎么设置？**

程序启动时会自动检测 Windows 系统代理（也支持 `HTTPS_PROXY` / `HTTP_PROXY`），检测到时会自动开启；若系统代理没有被识别（PAC 或仅 SOCKS 的情况），在设置中关闭「使用系统代理」并填写 HTTP/HTTPS 代理地址即可。

**Q：自动登录失败怎么办？**

打开登录窗口重新输入即可；勾选「记住登录凭证」会更新保存的凭据。如需删除本地凭据，可在「账号管理」中删除对应账号，或取消其「保留登录凭证」勾选后重启。

**Q：下载到一半崩溃了会丢进度吗？**

不会丢文件。未完成的任务会保留为「等待/暂停」，临时文件保存在目标目录；HLS 回退已完成的分片会在继续时复用。

## 已知限制

- 只读取用户作者 Feed 中的媒体帖子，不提供搜索、点赞、书签或私密内容下载。
- Bluesky / AppView 的速率限制可能导致批量抓取失败，请降低扫描上限或稍后重试。
- 原始 blob 需要作者 PDS 公开可读；若 PDS 拒绝匿名访问或未部署 sync 接口，会回退到 CDN / HLS 转码版本。
- 内置封装器支持 H.264 视频 + AAC 音频（Bluesky 当前全部转码流均为该组合）；其他编码（如 HEVC）会保留 `.ts` 并提示。
- 受 DRM / 加密保护的 HLS 流不支持下载。
- 自动登录仅在 Windows 桌面版可用；浏览器模式不会保存 App Password。

## 免责声明

- 本工具仅用于备份你有权保存的内容，请遵守原作者版权与 Bluesky 社区规则。
- 请勿将本工具用于批量抓取、骚扰或任何违反 Bluesky 平台条款的用途。
- Bsky-Spider 与 Bluesky, PBC 无隶属关系。
- 请遵守你所在国家的法律、法规和监管要求。

## 更新日志

- **1.2.5**：新增 Linux 版本（`.AppImage` 与 `.deb`）与 Windows 安装程序；新增流畅模式（适配低配置电脑）；启动进度条并修复 Linux 首次启动卡在 92% 的问题；Linux 系统代理检测；设置页布局与彩色图标优化；Windows 保存路径支持网络位置；性能优化与代码清理。
- **1.2.0**：第一个公开发布的 Bsky-Spider 版本。

## 开源致谢与许可

- 界面与交互蓝本、下载思路参考：[X-Spider](https://github.com/MiningCattiva/x-spider) by [MiningCattiva](https://github.com/MiningCattiva)（GPL-3.0）
- App Password 登录与媒体抓取参考：[Bluesky-Media-Downloader](https://github.com/maxreinartz/Bluesky-Media-Downloader) by [maxreinartz](https://github.com/maxreinartz)（MIT）
- 内置 MP4 合并引擎：本项目自行实现，仅做流复制，不包含 FFmpeg 代码

Bsky-Spider 以 **GPL-3.0-only** 发布，完整文本见 [LICENSE](LICENSE)。
