import { httpFetch } from './http';

interface PdsCacheEntry {
  pds: string | null;
  at: number;
}

const cache = new Map<string, PdsCacheEntry>();
const SUCCESS_TTL = 6 * 60 * 60 * 1000;
const FAILURE_TTL = 60 * 1000;

function didDocumentUrl(did: string): string | null {
  if (did.startsWith('did:plc:')) {
    return `https://plc.directory/${encodeURIComponent(did)}`;
  }
  if (did.startsWith('did:web:')) {
    const didWeb = did.slice('did:web:'.length);
    const [host, ...segments] = didWeb.split(':');
    if (!host) return null;
    return segments.length > 0
      ? `https://${host}/${segments.join('/')}/did.json`
      : `https://${host}/.well-known/did.json`;
  }
  return null;
}

function pdsFromDocument(document: unknown): string | null {
  const services = (document as { service?: Array<Record<string, unknown>> })
    ?.service;
  if (!Array.isArray(services)) return null;
  const service = services.find(
    (entry) =>
      entry.type === 'AtprotoPersonalDataServer' ||
      entry.id === '#atproto_pds',
  );
  const endpoint = service?.serviceEndpoint;
  if (typeof endpoint !== 'string' || !endpoint) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve an author's PDS so original blobs can be fetched with
 * com.atproto.sync.getBlob. Results are cached because download queues often
 * contain many posts from the same account. Transient failures are retried:
 * falling back to a transcoded video just because the DID document was briefly
 * unreachable would silently reduce quality.
 */
export async function resolvePdsForDid(did: string): Promise<string | null> {
  if (!did || !did.startsWith('did:')) return null;
  const cached = cache.get(did);
  if (cached) {
    const ttl = cached.pds ? SUCCESS_TTL : FAILURE_TTL;
    if (Date.now() - cached.at < ttl) return cached.pds;
  }

  const docUrl = didDocumentUrl(did);
  if (!docUrl) return null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await httpFetch(docUrl, {}, undefined);
      if (response.ok) {
        const document = await response.json();
        const pds = pdsFromDocument(document);
        cache.set(did, { pds, at: Date.now() });
        return pds;
      }
      if (response.status >= 400 && response.status < 500) {
        // A permanent lookup failure will not improve on a retry.
        cache.set(did, { pds: null, at: Date.now() });
        return null;
      }
    } catch {
      // Network error / timeout: retry before giving up.
    }
    if (attempt < 3) await sleep(300 * attempt);
  }

  cache.set(did, { pds: null, at: Date.now() });
  return null;
}

export function blobUrlForPds(
  pds: string,
  did: string,
  cid: string,
): string {
  const params = new URLSearchParams({ did, cid });
  return `${pds}/xrpc/com.atproto.sync.getBlob?${params.toString()}`;
}

/**
 * Returns a public PDS URL for the original JPEG/PNG/MP4 blob behind a Bluesky
 * image or video. The CDN "fullsize" URL is often a WebP transcode, so using
 * the original blob is the only way to preserve the source format and quality.
 */
export async function getOriginalBlobUrl(
  did: string,
  cid: string,
): Promise<string | null> {
  if (!did || !cid) return null;
  const pds = await resolvePdsForDid(did);
  if (!pds) return null;
  return blobUrlForPds(pds, did, cid);
}
