import type {
  AuthUser,
  BskyAuthor,
  BskyProfile,
  FeedPage,
  FollowUser,
  FollowsResponse,
  MediaItem,
  MediaKind,
} from '../shared/types';
import { postRkey } from '../shared/templates';
import { APPVIEW_URL, DEFAULT_PDS } from './config';
import { ApiError, fetchJson } from './http';

interface DidService {
  id?: string;
  type?: string;
  serviceEndpoint?: string;
}

interface DidDocument {
  service?: DidService[];
}

interface CreateSessionResponse {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
  didDoc?: DidDocument;
  active?: boolean;
  status?: string;
}

interface RawProfile {
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

interface RawAuthor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface RawImageView {
  thumb: string;
  fullsize: string;
  alt?: string;
  aspectRatio?: { width: number; height: number };
}

interface RawVideoView {
  cid?: string;
  playlist?: string;
  thumbnail?: string;
  alt?: string;
  aspectRatio?: { width: number; height: number };
}

interface RawEmbed {
  $type?: string;
  cid?: string;
  images?: RawImageView[];
  playlist?: string;
  thumbnail?: string;
  alt?: string;
  aspectRatio?: { width: number; height: number };
  media?: RawEmbed;
  [key: string]: unknown;
}

interface RawPostView {
  uri: string;
  cid?: string;
  author: RawAuthor;
  record: {
    text?: string;
    createdAt?: string;
    [key: string]: unknown;
  };
  embed?: RawEmbed;
  indexedAt?: string;
  [key: string]: unknown;
}

interface RawFeedResponse {
  feed: Array<{
    post: RawPostView;
    reply?: unknown;
    reason?: unknown;
  }>;
  cursor?: string;
}

export interface SessionRecord {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
  pds: string;
  profile: BskyProfile;
  refreshPromise?: Promise<void>;
}

function trimPds(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function normalizePds(value?: string): string {
  const candidate = trimPds(value || '');
  if (!candidate) return DEFAULT_PDS;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new ApiError('PDS 地址格式不正确', 400, 'invalid_pds');
  }
  const isLocal =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new ApiError('PDS 地址必须使用 HTTPS', 400, 'invalid_pds');
  }
  return url.toString().replace(/\/+$/, '');
}

/** Accepts a handle, @handle, DID, or a pasted bsky.app profile URL. */
export function normalizeIdentifier(value: string): string {
  let text = (value || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const parts = url.pathname.split('/').filter(Boolean);
      const profileIndex = parts.indexOf('profile');
      if (profileIndex >= 0 && parts[profileIndex + 1]) {
        text = decodeURIComponent(parts[profileIndex + 1]);
      }
    } catch {
      // Keep the original text and let the API produce the error.
    }
  }
  if (text.startsWith('@')) text = text.slice(1);
  return text.trim();
}

function didDocPds(doc?: DidDocument): string | undefined {
  const service = doc?.service?.find(
    (item) =>
      item?.type === 'AtprotoPersonalDataServer' ||
      item?.id === '#atproto_pds',
  );
  if (!service?.serviceEndpoint) return undefined;
  return trimPds(service.serviceEndpoint);
}

async function resolvePds(identifier: string): Promise<string | undefined> {
  if (identifier.includes('@') || identifier.startsWith('did:')) {
    return undefined;
  }
  try {
    const resolved = await fetchJson<{ did: string }>(
      `${APPVIEW_URL}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(
        identifier,
      )}`,
      {},
      undefined,
    );
    let docUrl: string;
    if (resolved.did.startsWith('did:plc:')) {
      docUrl = `https://plc.directory/${encodeURIComponent(resolved.did)}`;
    } else if (resolved.did.startsWith('did:web:')) {
      const didWeb = resolved.did.slice('did:web:'.length);
      const [host, ...segments] = didWeb.split(':');
      docUrl =
        segments.length > 0
          ? `https://${host}/${segments.join('/')}/did.json`
          : `https://${host}/.well-known/did.json`;
    } else {
      return undefined;
    }
    const document = await fetchJson<DidDocument>(docUrl, {}, undefined);
    return didDocPds(document);
  } catch {
    return undefined;
  }
}

async function createSession(
  identifier: string,
  password: string,
  pds: string,
): Promise<CreateSessionResponse> {
  return fetchJson<CreateSessionResponse>(
    `${pds}/xrpc/com.atproto.server.createSession`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    },
    undefined,
  );
}

function toProfile(raw: RawProfile): BskyProfile {
  return {
    did: raw.did,
    handle: raw.handle,
    displayName: raw.displayName,
    description: raw.description,
    avatar: raw.avatar,
    banner: raw.banner,
    followersCount: raw.followersCount,
    followsCount: raw.followsCount,
    postsCount: raw.postsCount,
    createdAt: raw.createdAt,
  };
}

function friendlyLoginError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    const message = error.message.toLowerCase();
    if (
      error.status === 401 ||
      message.includes('invalid identifier') ||
      message.includes('invalid password') ||
      message.includes('authentication')
    ) {
      return new ApiError(
        '账号或 App Password 不正确。请确认使用的是 App Password，而不是账号主密码。',
        401,
        'auth_failed',
        { upstream: error.code },
      );
    }
    if (message.includes('account takedown') || message.includes('suspended')) {
      return new ApiError('该账号目前不可用', 403, 'account_unavailable');
    }
    if (error.code === 'network_error' || error.code === 'timeout') {
      return new ApiError(
        '无法连接到 Bluesky，请检查网络或代理设置。',
        502,
        'network_error',
      );
    }
    return error;
  }
  return new ApiError('登录失败，请稍后重试。', 500, 'login_failed');
}

export interface LoginResult {
  session: SessionRecord;
  user: AuthUser;
}

export async function loginWithAppPassword(
  rawIdentifier: string,
  password: string,
  rawPds?: string,
): Promise<LoginResult> {
  const identifier = normalizeIdentifier(rawIdentifier);
  if (!identifier) {
    throw new ApiError('请输入 Bluesky 账号', 400, 'invalid_identifier');
  }
  if (!password.trim()) {
    throw new ApiError('请输入 App Password', 400, 'invalid_password');
  }

  let pds = normalizePds(rawPds);
  let created: CreateSessionResponse;
  try {
    created = await createSession(identifier, password.trim(), pds);
  } catch (firstError) {
    const friendly = friendlyLoginError(firstError);
    // Accounts hosted on a custom PDS can still sign in after discovering
    // their PDS from the DID document. Only do this for handle logins.
    if (
      pds === DEFAULT_PDS &&
      !identifier.includes('@') &&
      friendly.code === 'auth_failed'
    ) {
      const discovered = await resolvePds(identifier);
      if (discovered && discovered !== pds) {
        pds = discovered;
        try {
          created = await createSession(identifier, password.trim(), pds);
        } catch (secondError) {
          throw friendlyLoginError(secondError);
        }
      } else {
        throw friendly;
      }
    } else {
      throw friendly;
    }
  }

  if (!created.accessJwt || !created.refreshJwt) {
    throw new ApiError('登录响应不完整，请重试', 502, 'invalid_session');
  }

  pds = didDocPds(created.didDoc) || pds;
  const minimalProfile: BskyProfile = {
    did: created.did,
    handle: created.handle,
  };

  const session: SessionRecord = {
    accessJwt: created.accessJwt,
    refreshJwt: created.refreshJwt,
    did: created.did,
    handle: created.handle,
    pds,
    profile: minimalProfile,
  };

  try {
    session.profile = await getProfileWithSession(session, created.handle);
  } catch {
    // A profile lookup failure should not invalidate an otherwise good login.
  }

  return { session, user: toAuthUser(session) };
}

export function toAuthUser(session: SessionRecord): AuthUser {
  return {
    ...session.profile,
    did: session.did,
    handle: session.profile.handle || session.handle,
    pds: session.pds,
  };
}

async function refreshSession(session: SessionRecord): Promise<void> {
  if (session.refreshPromise) return session.refreshPromise;
  session.refreshPromise = (async () => {
    const data = await fetchJson<{
      accessJwt: string;
      refreshJwt: string;
      handle?: string;
      did?: string;
    }>(
      `${session.pds}/xrpc/com.atproto.server.refreshSession`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${session.refreshJwt}` },
      },
      undefined,
    );
    session.accessJwt = data.accessJwt;
    session.refreshJwt = data.refreshJwt;
    if (data.handle) session.handle = data.handle;
    if (data.did) session.did = data.did;
  })().finally(() => {
    session.refreshPromise = undefined;
  });
  return session.refreshPromise;
}

async function authorizedGet<T>(
  session: SessionRecord,
  base: string,
  nsid: string,
  params: Record<string, string | number | undefined>,
  retry = true,
): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const url = `${base}/xrpc/${nsid}${
    query.size > 0 ? `?${query.toString()}` : ''
  }`;
  try {
    return await fetchJson<T>(
      url,
      {
        headers: { authorization: `Bearer ${session.accessJwt}` },
      },
      undefined,
    );
  } catch (error) {
    if (
      retry &&
      error instanceof ApiError &&
      (error.status === 401 || error.code === 'ExpiredToken')
    ) {
      await refreshSession(session);
      return authorizedGet<T>(session, base, nsid, params, false);
    }
    throw error;
  }
}

export async function getProfileWithSession(
  session: SessionRecord,
  actor: string,
): Promise<BskyProfile> {
  const data = await authorizedGet<RawProfile>(
    session,
    APPVIEW_URL,
    'app.bsky.actor.getProfile',
    { actor },
  );
  return toProfile(data);
}

export async function getProfile(
  session: SessionRecord,
  actor: string,
): Promise<BskyProfile> {
  const normalized = normalizeIdentifier(actor);
  if (!normalized) {
    throw new ApiError('请输入用户 Handle', 400, 'invalid_actor');
  }
  return getProfileWithSession(session, normalized);
}

export async function getFollows(
  session: SessionRecord,
  actor: string,
  cursor?: string,
  limit = 50,
): Promise<FollowsResponse> {
  const normalized = normalizeIdentifier(actor);
  if (!normalized) {
    throw new ApiError('请输入用户 Handle', 400, 'invalid_actor');
  }
  const data = await authorizedGet<{
    follows: RawProfile[];
    cursor?: string;
  }>(session, APPVIEW_URL, 'app.bsky.graph.getFollows', {
    actor: normalized,
    cursor,
    limit: Math.min(100, Math.max(1, limit)),
  });
  const follows: FollowUser[] = (data.follows || []).map((raw) => ({
    did: raw.did,
    handle: raw.handle,
    displayName: raw.displayName,
    description: raw.description,
    avatar: raw.avatar,
  }));
  return { follows, cursor: data.cursor };
}

function aspectRatioSize(ratio?: {
  width: number;
  height: number;
}): { width?: number; height?: number } {
  if (!ratio || !ratio.width || !ratio.height) return {};
  const base = 1000;
  return {
    width: Math.round(base * (ratio.width / ratio.height)),
    height: base,
  };
}

function videoFromEmbed(
  post: RawPostView,
  author: BskyAuthor,
  embed: RawEmbed,
  index: number,
): MediaItem | null {
  if (!embed.playlist) return null;
  const size = aspectRatioSize(embed.aspectRatio);
  const rkey = postRkey(post.uri);
  return {
    id: `${rkey}-video`,
    kind: 'video',
    url: embed.playlist,
    blobCid: embed.cid,
    thumbUrl: embed.thumbnail || '',
    alt: embed.alt,
    width: size.width,
    height: size.height,
    index,
    postUri: post.uri,
    postUrl: postWebUrl(author, rkey),
    postText: post.record?.text || '',
    createdAt: post.record?.createdAt || post.indexedAt || new Date().toISOString(),
    author,
  };
}

export function blobCidFromCdnUrl(url: string): string | undefined {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const plainIndex = parts.lastIndexOf('plain');
    if (plainIndex < 0 || parts.length < plainIndex + 3) return undefined;
    const cid = parts[plainIndex + 2].split('@')[0];
    return cid || undefined;
  } catch {
    return undefined;
  }
}

function imagesFromEmbed(
  post: RawPostView,
  author: BskyAuthor,
  embed: RawEmbed,
): MediaItem[] {
  if (!Array.isArray(embed.images)) return [];
  const rkey = postRkey(post.uri);
  return embed.images
    .filter((image) => image && (image.fullsize || image.thumb))
    .map((image, index) => {
      const size = aspectRatioSize(image.aspectRatio);
      const url = image.fullsize || image.thumb;
      return {
        id: `${rkey}-img${index + 1}`,
        kind: 'image' as MediaKind,
        url,
        blobCid: blobCidFromCdnUrl(url),
        thumbUrl: image.thumb || image.fullsize,
        alt: image.alt,
        width: size.width,
        height: size.height,
        index: index + 1,
        postUri: post.uri,
        postUrl: postWebUrl(author, rkey),
        postText: post.record?.text || '',
        createdAt:
          post.record?.createdAt || post.indexedAt || new Date().toISOString(),
        author,
      };
    });
}

function postWebUrl(author: BskyAuthor, rkey: string): string {
  const handle = author.handle || author.did;
  return `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${rkey}`;
}

export function extractMediaFromPost(post: RawPostView): MediaItem[] {
  if (!post?.uri || !post.author) return [];
  const author: BskyAuthor = {
    did: post.author.did,
    handle: post.author.handle,
    displayName: post.author.displayName,
    avatar: post.author.avatar,
  };

  let embed = post.embed;
  if (!embed) return [];

  if (embed.$type === 'app.bsky.embed.recordWithMedia#view' && embed.media) {
    embed = embed.media;
  }

  if (embed.$type === 'app.bsky.embed.images#view' || embed.images) {
    return imagesFromEmbed(post, author, embed);
  }

  if (embed.$type === 'app.bsky.embed.video#view' || embed.playlist) {
    const video = videoFromEmbed(post, author, embed, 1);
    return video ? [video] : [];
  }

  return [];
}

export interface FeedOptions {
  actor: string;
  cursor?: string;
  limit?: number;
  mediaTypes?: MediaKind[];
}

export async function getAuthorFeed(
  session: SessionRecord,
  options: FeedOptions,
): Promise<FeedPage> {
  const actor = normalizeIdentifier(options.actor);
  if (!actor) throw new ApiError('请输入用户 Handle', 400, 'invalid_actor');
  const requestedKinds = options.mediaTypes?.length
    ? options.mediaTypes
    : (['image', 'video'] as MediaKind[]);
  const onlyVideo =
    requestedKinds.length === 1 && requestedKinds[0] === 'video';
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);

  let data: RawFeedResponse;
  try {
    data = await authorizedGet<RawFeedResponse>(
      session,
      APPVIEW_URL,
      'app.bsky.feed.getAuthorFeed',
      {
        actor,
        limit,
        cursor: options.cursor,
        filter: onlyVideo ? 'posts_with_video' : 'posts_with_media',
      },
    );
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === 'InvalidRequest' || error.status === 400)
    ) {
      // Older AppView implementations may not know the media filters.
      data = await authorizedGet<RawFeedResponse>(
        session,
        APPVIEW_URL,
        'app.bsky.feed.getAuthorFeed',
        {
          actor,
          limit,
          cursor: options.cursor,
        },
      );
    } else {
      throw error;
    }
  }

  const items: MediaItem[] = [];
  const seen = new Set<string>();
  for (const entry of data.feed || []) {
    for (const media of extractMediaFromPost(entry.post)) {
      if (seen.has(media.url)) continue;
      seen.add(media.url);
      items.push(media);
    }
  }

  return {
    items,
    cursor: data.cursor || null,
    postCount: (data.feed || []).length,
  };
}

/**
 * Pages through the author feed and returns every matching media item up to
 * maxPosts scanned (or the end of the feed).
 */
export async function collectMedia(
  session: SessionRecord,
  options: {
    actor: string;
    mediaTypes: MediaKind[];
    from?: string | null;
    to?: string | null;
    maxPosts: number;
    onProgress?: (scanned: number) => void;
  },
): Promise<{ items: MediaItem[]; scannedPosts: number }> {
  const fromTime = options.from
    ? new Date(`${options.from}T00:00:00`).getTime()
    : null;
  const toTime = options.to
    ? new Date(`${options.to}T23:59:59.999`).getTime()
    : null;
  const wanted = new Set(options.mediaTypes);
  const all: MediaItem[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let scanned = 0;
  let pages = 0;
  // 0 means "all": page until the feed ends, with a safety ceiling for
  // pathological accounts or an API that keeps returning a cursor.
  const unlimited = options.maxPosts === 0;
  const maxPages = 100;
  const maxScan = unlimited ? Number.POSITIVE_INFINITY : options.maxPosts;

  while (scanned < maxScan && pages < maxPages) {
    const pageLimit = unlimited
      ? 100
      : Math.min(100, options.maxPosts - scanned);
    const page = await getAuthorFeed(session, {
      actor: options.actor,
      cursor,
      limit: pageLimit,
      mediaTypes: options.mediaTypes,
    });
    pages += 1;
    scanned += page.postCount ?? pageLimit;
    options.onProgress?.(scanned);

    for (const media of page.items) {
      if (!wanted.has(media.kind)) continue;
      const time = new Date(media.createdAt).getTime();
      if (fromTime !== null && Number.isFinite(time) && time < fromTime) {
        continue;
      }
      if (toTime !== null && Number.isFinite(time) && time > toTime) {
        continue;
      }
      if (seen.has(media.url)) continue;
      seen.add(media.url);
      all.push(media);
    }

    cursor = page.cursor || undefined;
    if (!cursor || (page.postCount ?? 0) === 0) break;
  }

  return { items: all, scannedPosts: scanned };
}

export async function deleteRemoteSession(
  session: SessionRecord,
): Promise<void> {
  try {
    await fetchJson<unknown>(
      `${session.pds}/xrpc/com.atproto.server.deleteSession`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${session.refreshJwt}` },
      },
      10_000,
    );
  } catch {
    // Local logout must succeed even if the remote token is already gone.
  }
}

export async function validateSession(
  session: SessionRecord,
): Promise<boolean> {
  try {
    const profile = await getProfileWithSession(session, session.did);
    session.profile = profile;
    return true;
  } catch {
    return false;
  }
}
