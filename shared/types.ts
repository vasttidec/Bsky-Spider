export type MediaKind = 'image' | 'video';

export type ThemeName = 'system' | 'default' | 'dark' | 'cyberpunk';
export type LanguageSetting =
  | 'system'
  | 'zh-CN'
  | 'zh-TW'
  | 'en'
  | 'ru';

export type TaskStatus =
  | 'waiting'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'error';

export interface BskyAuthor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface MediaItem {
  /** Stable id for the media inside a post. */
  id: string;
  kind: MediaKind;
  /** Full-size source. Images are JPEG/PNG URLs, videos are HLS playlists. */
  url: string;
  thumbUrl: string;
  alt?: string;
  width?: number;
  height?: number;
  /**
   * CID of the original PDS blob. The public CDN URLs are often transcoded
   * (WebP images, HLS video); the original blob preserves format and quality.
   */
  blobCid?: string;
  /** 1-based position of the media inside its post. */
  index: number;
  postUri: string;
  postUrl: string;
  postText: string;
  createdAt: string;
  author: BskyAuthor;
}

export interface BskyProfile {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  banner?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  createdAt?: string;
}

export interface FollowUser {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
}

export interface FollowsResponse {
  follows: FollowUser[];
  cursor?: string;
}

export interface AuthUser extends BskyProfile {
  pds: string;
}

export interface FeedPage {
  items: MediaItem[];
  cursor: string | null;
  /** Number of raw feed entries scanned for this page. */
  postCount?: number;
}

export interface DownloadTask {
  id: string;
  media: MediaItem;
  status: TaskStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number | null;
  fileName: string;
  relativePath: string;
  filePath?: string;
  error?: string;
  note?: string;
  detail?: string;
  skipped: boolean;
  createdAt: string;
  completedAt?: string;
}

export type TaskBatchAction =
  | 'pauseAll'
  | 'resumeAll'
  | 'retryErrors'
  | 'removeActive'
  | 'removeErrors'
  | 'removeCompleted'
  | 'removeFinished'
  | 'removeAll';

export interface AppSettings {
  theme: ThemeName;
  language: LanguageSetting;
  saveDir: string;
  folderTemplate: string;
  fileNameTemplate: string;
  skipExisting: boolean;
  concurrency: number;
  proxyEnabled: boolean;
  /** Internal flag: user has explicitly changed the proxy switch. */
  proxyChoiceMade: boolean;
  /** Use the operating system's proxy configuration instead of proxyUrl. */
  proxyUseSystem: boolean;
  proxyUrl: string;
  requestTimeout: number;
  desktopNotifications: boolean;
  /** Disables animations and other non-essential effects to save resources. */
  smoothMode: boolean;
}

export interface SystemInfo {
  version: string;
  platform: string;
  nodeVersion: string;
  homeDir: string;
  downloadsDir: string;
  dataDir: string;
  /** `exe` when the data folder sits next to the executable, `user` for the fallback. */
  dataDirSource?: 'exe' | 'user';
  defaultSaveDir: string;
  /** Human readable name of the built-in video muxer. */
  videoEngineName: string;
  /** The built-in muxer never depends on an external binary, so this is true. */
  videoEngineReady: boolean;
  appView: string;
  /** Resolved system proxy, if one is configured. */
  systemProxyUrl: string | null;
  systemProxySource: 'environment' | 'windows' | 'linux' | 'none';
  systemProxyNote?: string;
}

export interface UpdateCheckResult {
  current: string;
  /** Newest published release, or null when the repository has none yet. */
  latest: string | null;
  updateAvailable: boolean;
  url: string;
  publishedAt?: string;
  notes?: string;
  repository: string;
}

export interface SessionResponse {
  user: AuthUser | null;
  /** True when saved desktop credentials existed but could not sign in. */
  autoLoginFailed?: boolean;
}

export interface SearchHistoryResponse {
  history: string[];
}

export interface TaskCounts {
  downloading: number;
  waiting: number;
  paused: number;
  error: number;
  completed: number;
}

export interface BatchDownloadRequest {
  actor: string;
  mediaTypes: MediaKind[];
  from?: string | null;
  to?: string | null;
  maxPosts?: number;
  /** Download only these already-loaded media items instead of scanning the feed. */
  items?: MediaItem[];
}

export interface BatchDownloadResult {
  added: number;
  skipped: number;
  scannedPosts: number;
  tasks: DownloadTask[];
}

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  directories: DirectoryEntry[];
  drives: DirectoryEntry[];
}

export interface LoginRequest {
  identifier: string;
  password: string;
  pds?: string;
}
