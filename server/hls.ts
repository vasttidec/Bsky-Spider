export interface HlsVariant {
  url: string;
  bandwidth: number;
  width?: number;
  height?: number;
}

export interface HlsMediaPlaylist {
  segments: string[];
  initSegment?: string;
  isFmp4: boolean;
  duration: number;
  encrypted: boolean;
}

function resolveUri(uri: string, baseUrl: string): string {
  return new URL(uri.trim(), baseUrl).toString();
}

function attrsOf(line: string): Record<string, string> {
  const result: Record<string, string> = {};
  const attrText = line.slice(line.indexOf(':') + 1);
  const regex = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(attrText)) !== null) {
    result[match[1]] = match[2].replace(/^"|"$/g, '');
  }
  return result;
}

export function isMasterPlaylist(content: string): boolean {
  return /#EXT-X-STREAM-INF:/i.test(content);
}

export function parseMasterPlaylist(
  content: string,
  baseUrl: string,
): HlsVariant[] {
  const lines = content.split(/\r?\n/);
  const variants: HlsVariant[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.toLowerCase().startsWith('#ext-x-stream-inf:')) continue;
    const attrs = attrsOf(line);
    let uri = '';
    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      if (!candidate) continue;
      if (candidate.startsWith('#')) continue;
      uri = candidate;
      break;
    }
    if (!uri) continue;
    const resolution = (attrs.RESOLUTION || '').match(/^(\d+)x(\d+)$/);
    variants.push({
      url: resolveUri(uri, baseUrl),
      bandwidth: Number(attrs.BANDWIDTH) || 0,
      width: resolution ? Number(resolution[1]) : undefined,
      height: resolution ? Number(resolution[2]) : undefined,
    });
  }
  return variants;
}

export function chooseBestVariant(variants: HlsVariant[]): HlsVariant | null {
  if (variants.length === 0) return null;
  return [...variants].sort((a, b) => {
    const bandwidthDiff = b.bandwidth - a.bandwidth;
    if (bandwidthDiff !== 0) return bandwidthDiff;
    return (b.height || 0) - (a.height || 0);
  })[0];
}

export function parseMediaPlaylist(
  content: string,
  baseUrl: string,
): HlsMediaPlaylist {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const segments: string[] = [];
  let initSegment: string | undefined;
  let duration = 0;
  let encrypted = false;

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = attrsOf(line);
      if (
        attrs.METHOD &&
        attrs.METHOD.toUpperCase() !== 'NONE' &&
        attrs.METHOD.toUpperCase() !== 'AES-128'
      ) {
        encrypted = true;
      }
      if (attrs.METHOD?.toUpperCase() === 'AES-128') {
        // Bluesky's public HLS streams are unencrypted. Surface a useful
        // error rather than saving an unplayable file if that ever changes.
        encrypted = true;
      }
      continue;
    }
    if (line.startsWith('#EXT-X-MAP:')) {
      const attrs = attrsOf(line);
      if (attrs.URI) initSegment = resolveUri(attrs.URI, baseUrl);
      continue;
    }
    if (line.startsWith('#EXTINF:')) {
      duration += Number.parseFloat(line.slice('#EXTINF:'.length)) || 0;
      continue;
    }
    if (line.startsWith('#')) continue;
    segments.push(resolveUri(line, baseUrl));
  }

  const isFmp4 =
    Boolean(initSegment) || segments.some((segment) => /\.m4s(\?|$)/i.test(segment));

  return { segments, initSegment, isFmp4, duration, encrypted };
}
