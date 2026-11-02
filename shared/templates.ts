import type { MediaItem } from './types';

export interface TemplateVariable {
  key: string;
  label: string;
  description: string;
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: 'POST_ID', label: '帖子 ID', description: '帖子的 rkey，例如 3l5x...' },
  { key: 'POST_TIME', label: '发布时间', description: '发布日期与时间，可用 ,d=1 只保留日期' },
  { key: 'USER_HANDLE', label: '用户 Handle', description: '例如 alice.bsky.social' },
  { key: 'USER_NAME', label: '用户昵称', description: 'Bluesky 上显示的昵称' },
  { key: 'USER_DID', label: '用户 DID', description: '账号的永久标识' },
  { key: 'MEDIA_ID', label: '媒体 ID', description: '该媒体在本地的唯一标识' },
  { key: 'MEDIA_INDEX', label: '媒体序号', description: '媒体在帖子中的序号，从 1 开始' },
  { key: 'MEDIA_TYPE', label: '媒体类型', description: 'image 或 video' },
  { key: 'MEDIA_WIDTH', label: '宽度', description: '媒体宽度（如有）' },
  { key: 'MEDIA_HEIGHT', label: '高度', description: '媒体高度（如有）' },
  { key: 'TEXT', label: '帖子文本', description: '可用 ,t=16 截断到指定字符数' },
  { key: 'EXT', label: '扩展名', description: '带点的扩展名，例如 .jpg' },
];

export const DEFAULT_FILE_TEMPLATE = '%POST_TIME%_%USER_HANDLE%_%MEDIA_ID%%EXT%';
export const DEFAULT_FOLDER_TEMPLATE = '%USER_HANDLE%';

export const EXAMPLE_MEDIA: MediaItem = {
  id: '3l5xyzabc-img1',
  kind: 'image',
  url: 'https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:example/bafyexample@jpeg',
  thumbUrl:
    'https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:example/bafyexample@jpeg',
  alt: '傍晚的云层与远处的山',
  width: 1600,
  height: 1200,
  index: 1,
  postUri: 'at://did:plc:example/app.bsky.feed.post/3l5xyzabc',
  postUrl: 'https://bsky.app/profile/example.bsky.social/post/3l5xyzabc',
  postText: '今天在 Bluesky 上看到了一层很特别的云。',
  createdAt: '2026-10-28T08:30:00.000Z',
  author: {
    did: 'did:plc:example',
    handle: 'example.bsky.social',
    displayName: '示例用户',
  },
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatPostDate(createdAt: string, dateOnly = false): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'unknown-date';
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  if (dateOnly) return `${year}-${month}-${day}`;
  return `${year}-${month}-${day}_${pad(date.getHours())}-${pad(
    date.getMinutes(),
  )}-${pad(date.getSeconds())}`;
}

export function postRkey(uri: string): string {
  const parts = uri.split('/');
  return parts[parts.length - 1] || 'post';
}

function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  if (chars.length <= max) return value;
  return chars.slice(0, Math.max(0, max)).join('');
}

function parseParams(raw?: string): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const chunk of raw.split(',')) {
    const [key, ...rest] = chunk.split('=');
    if (key && rest.length > 0) out[key.trim()] = rest.join('=').trim();
  }
  return out;
}

function rawVariable(
  key: string,
  params: Record<string, string>,
  media: MediaItem,
  ext: string,
): string {
  switch (key.toUpperCase()) {
    case 'POST_ID':
      return postRkey(media.postUri);
    case 'POST_TIME': {
      const dateOnly = params.d === '1' || params.d === 'true';
      return formatPostDate(media.createdAt, dateOnly);
    }
    case 'USER_HANDLE':
      return media.author.handle;
    case 'USER_NAME':
      return media.author.displayName || media.author.handle;
    case 'USER_DID':
      return media.author.did;
    case 'MEDIA_ID':
      return media.id;
    case 'MEDIA_INDEX':
      return String(media.index);
    case 'MEDIA_TYPE':
      return media.kind;
    case 'MEDIA_WIDTH':
      return media.width ? String(media.width) : '';
    case 'MEDIA_HEIGHT':
      return media.height ? String(media.height) : '';
    case 'TEXT': {
      const requested = Number(params.t ?? 24);
      const max = Number.isFinite(requested)
        ? Math.max(0, Math.min(160, Math.floor(requested)))
        : 24;
      return truncate(media.postText.replace(/\s+/g, ' ').trim(), max);
    }
    case 'EXT':
      return ext.startsWith('.') ? ext : `.${ext}`;
    default:
      return '';
  }
}

function renderRaw(template: string, media: MediaItem, ext: string): string {
  return template.replace(
    /%([A-Z_]+)((?:,[a-zA-Z]+=[^,%]+)*)%/g,
    (_match, key: string, rawParams: string | undefined) =>
      rawVariable(key, parseParams(rawParams?.slice(1)), media, ext),
  );
}

const WINDOWS_RESERVED =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/** Turns user-controlled text into one safe path component. */
export function sanitizeSegment(input: string): string {
  let value = (input || '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .trim();

  if (!value || value === '.' || value === '..') value = 'untitled';
  if (WINDOWS_RESERVED.test(value)) value = `_${value}`;
  if (value.length > 120) {
    value = Array.from(value).slice(0, 120).join('').replace(/[. ]+$/g, '');
  }
  return value || 'untitled';
}

export function renderFolderTemplate(
  template: string,
  media: MediaItem,
  ext = '.jpg',
): string[] {
  const rendered = renderRaw(template || '', media, ext);
  return rendered
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter((part) => part && part !== '.' && part !== '..')
    .map(sanitizeSegment);
}

export function ensureExtension(fileName: string, ext: string): string {
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
  if (fileName.toLowerCase().endsWith(normalizedExt.toLowerCase())) {
    return fileName;
  }
  return `${fileName}${normalizedExt}`;
}

export function renderFileTemplate(
  template: string,
  media: MediaItem,
  ext: string,
): string {
  const rendered = renderRaw(template || '', media, ext);
  const safe = sanitizeSegment(rendered);
  return ensureExtension(safe, ext);
}

/** Best-effort extension from a Bluesky CDN URL. */
export function guessExtension(url: string, kind: 'image' | 'video'): string {
  if (kind === 'video') {
    return /\.m3u8(\?|$)/i.test(url) ? '.mp4' : '.mp4';
  }
  const at = url.match(/@([a-zA-Z0-9]+)(?:\?|$)/);
  if (at) {
    const tag = at[1].toLowerCase();
    if (tag === 'jpeg' || tag === 'jpg') return '.jpg';
    if (tag === 'png') return '.png';
    if (tag === 'webp') return '.webp';
    if (tag === 'gif') return '.gif';
    if (tag === 'avif') return '.avif';
  }
  const pathname = url.split('?')[0];
  const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
  if (match) {
    const ext = `.${match[1].toLowerCase()}`;
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext;
    }
  }
  return '.jpg';
}

export function previewTemplate(
  fileTemplate: string,
  folderTemplate: string,
  media: MediaItem = EXAMPLE_MEDIA,
): { folder: string; file: string } {
  const ext = guessExtension(media.url, media.kind);
  const folder = renderFolderTemplate(folderTemplate, media, ext).join('/');
  return {
    folder: folder || '（保存路径根目录）',
    file: renderFileTemplate(fileTemplate, media, ext),
  };
}
