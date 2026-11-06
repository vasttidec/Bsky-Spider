/**
 * Network save locations. A save directory may be a WebDAV endpoint expressed
 * as `davs://user:pass@host/path` (HTTPS), `dav://` (HTTP) or a plain
 * `http(s)://` URL. Windows UNC shares (`\\server\share`) are handled as
 * ordinary local paths by Node, so they do not need special parsing here.
 */
export interface RemoteTarget {
  /** Base URL without credentials, always ending with a slash. */
  baseUrl: string;
  /** Value for the HTTP `Authorization` header, when the URL has credentials. */
  auth?: string;
}

export function parseRemoteTarget(value: string): RemoteTarget | null {
  const trimmed = (value || '').trim();
  if (!/^(davs?|https?):\/\//i.test(trimmed)) return null;
  let original: URL;
  try {
    original = new URL(trimmed);
  } catch {
    return null;
  }
  // `dav:` / `davs:` are not "special" URL schemes, so re-parse the address
  // with http(s) to get a usable origin.
  const scheme = original.protocol.toLowerCase();
  const mapped =
    scheme === 'davs:' ? 'https:' : scheme === 'dav:' ? 'http:' : scheme;
  const source = trimmed.replace(/^[a-z][a-z0-9+.-]*:/i, mapped);
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (!url.hostname) return null;

  let auth: string | undefined;
  if (url.username || url.password) {
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    auth = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
    url.username = '';
    url.password = '';
  }

  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
  return { baseUrl: url.toString(), auth };
}

export function isRemoteTarget(value: string): boolean {
  return parseRemoteTarget(value) !== null;
}

/** Joins folder segments and a file name onto a WebDAV base URL. */
export function joinRemoteUrl(
  baseUrl: string,
  folderParts: string[],
  fileName: string,
): string {
  const url = new URL(baseUrl);
  const parts = [...folderParts, fileName]
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => encodeURIComponent(part).replace(/%2F/gi, '/'));
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${parts.join('/')}`;
  return url.toString();
}

/** Directory URL of a file URL (keeps the trailing slash). */
export function remoteDirUrl(fileUrl: string): string {
  const url = new URL(fileUrl);
  url.pathname = url.pathname.replace(/\/[^/]*$/, '/');
  return url.toString();
}

