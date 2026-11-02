import http from 'node:http';

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (
    req.method === 'POST' &&
    url.pathname === '/xrpc/com.atproto.server.createSession'
  ) {
    let body = '';
    req.on('data', (chunk) => {
      body += String(chunk);
    });
    req.on('end', () => {
      const data = JSON.parse(body || '{}');
      if (data.password !== 'abcd-efgh-ijkl-mnop') {
        send(401, {
          error: 'AuthenticationRequired',
          message: 'Invalid identifier or password',
        });
        return;
      }
      send(200, {
        accessJwt: 'access-1',
        refreshJwt: 'refresh-1',
        did: 'did:plc:alice',
        handle: 'alice.test',
        didDoc: {
          service: [
            {
              id: '#atproto_pds',
              type: 'AtprotoPersonalDataServer',
              serviceEndpoint: 'http://127.0.0.1:5192',
            },
          ],
        },
      });
    });
    return;
  }

  if (
    req.method === 'POST' &&
    url.pathname === '/xrpc/com.atproto.server.refreshSession'
  ) {
    if (req.headers.authorization !== 'Bearer refresh-1') {
      send(401, { error: 'InvalidToken', message: 'bad refresh token' });
      return;
    }
    send(200, {
      accessJwt: 'access-2',
      refreshJwt: 'refresh-2',
      did: 'did:plc:alice',
      handle: 'alice.test',
    });
    return;
  }

  if (url.pathname === '/xrpc/app.bsky.actor.getProfile') {
    if (req.headers.authorization !== 'Bearer access-1' && req.headers.authorization !== 'Bearer access-2') {
      send(401, { error: 'ExpiredToken', message: 'token expired' });
      return;
    }
    const upgraded = req.headers.authorization === 'Bearer access-2';
    send(200, {
      did: 'did:plc:alice',
      handle: 'alice.test',
      displayName: upgraded ? 'Alice Refreshed' : 'Alice',
      avatar: 'https://cdn.bsky.app/avatar/alice.jpg',
      followersCount: 42,
      followsCount: 7,
      postsCount: 9,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    return;
  }

  if (url.pathname === '/xrpc/app.bsky.feed.getAuthorFeed') {
    send(200, {
      cursor: 'next-cursor',
      feed: [
        {
          post: {
            uri: 'at://did:plc:alice/app.bsky.feed.post/abc123',
            author: {
              did: 'did:plc:alice',
              handle: 'alice.test',
              displayName: 'Alice',
              avatar: 'https://cdn.bsky.app/avatar/alice.jpg',
            },
            record: {
              text: 'hello sky',
              createdAt: '2026-10-01T10:00:00.000Z',
              embed: {},
            },
            embed: {
              $type: 'app.bsky.embed.images#view',
              images: [
                {
                  thumb: 'https://cdn.bsky.app/thumb1.jpg',
                  fullsize: 'https://cdn.bsky.app/full1.jpg',
                  alt: 'cloud',
                  aspectRatio: { width: 4, height: 3 },
                },
              ],
            },
            indexedAt: '2026-10-01T10:00:01.000Z',
          },
        },
        {
          post: {
            uri: 'at://did:plc:alice/app.bsky.feed.post/def456',
            author: {
              did: 'did:plc:alice',
              handle: 'alice.test',
              displayName: 'Alice',
            },
            record: {
              text: 'video and quote',
              createdAt: '2026-10-02T10:00:00.000Z',
            },
            embed: {
              $type: 'app.bsky.embed.recordWithMedia#view',
              record: { $type: 'app.bsky.embed.record#view' },
              media: {
                $type: 'app.bsky.embed.video#view',
                playlist: 'https://video.bsky.app/watch/alice/playlist.m3u8',
                thumbnail: 'https://video.bsky.app/thumb.jpg',
                alt: 'a short video',
                aspectRatio: { width: 16, height: 9 },
              },
            },
          },
        },
      ],
    });
    return;
  }

  send(404, { error: 'NotFound', message: `missing ${url.pathname}` });
});

await new Promise<void>((resolve) => server.listen(5192, '127.0.0.1', resolve));
process.env.BSKY_SPIDER_APPVIEW = 'http://127.0.0.1:5192';

const {
  getAuthorFeed,
  getProfile,
  loginWithAppPassword,
  normalizeIdentifier,
} = await import('../server/bsky');

if (normalizeIdentifier('https://bsky.app/profile/alice.test/post/abc') !== 'alice.test') {
  throw new Error('normalizeIdentifier failed for profile URL');
}
if (normalizeIdentifier('@alice.test') !== 'alice.test') {
  throw new Error('normalizeIdentifier failed for @handle');
}

const login = await loginWithAppPassword(
  'alice.test',
  'abcd-efgh-ijkl-mnop',
  'http://127.0.0.1:5192',
);
if (login.user.handle !== 'alice.test' || login.user.did !== 'did:plc:alice') {
  throw new Error('login user mismatch');
}
if (login.session.profile.displayName !== 'Alice') {
  throw new Error('profile was not loaded during login');
}
if (login.session.pds !== 'http://127.0.0.1:5192') {
  throw new Error(`unexpected pds ${login.session.pds}`);
}

let authFailure = '';
try {
  await loginWithAppPassword(
    'alice.test',
    'wrong-password',
    'http://127.0.0.1:5192',
  );
} catch (error) {
  authFailure = (error as Error).message;
}
if (!authFailure.includes('App Password')) {
  throw new Error(`login error was not friendly: ${authFailure}`);
}

// Force a 401, which should transparently refresh the session and retry.
login.session.accessJwt = 'expired';
const refreshedProfile = await getProfile(login.session, 'alice.test');
if (refreshedProfile.displayName !== 'Alice Refreshed') {
  throw new Error('session refresh did not update the access token');
}
if (login.session.accessJwt !== 'access-2') {
  throw new Error('session access token not rotated');
}

const feed = await getAuthorFeed(login.session, {
  actor: 'alice.test',
  limit: 20,
});
if (feed.items.length !== 2) {
  throw new Error(`expected 2 media items, got ${feed.items.length}`);
}
const image = feed.items.find((item) => item.kind === 'image');
const video = feed.items.find((item) => item.kind === 'video');
if (!image || image.width !== 1333 || image.height !== 1000) {
  throw new Error('image media shape mismatch');
}
if (!video || video.url !== 'https://video.bsky.app/watch/alice/playlist.m3u8') {
  throw new Error('video media shape mismatch');
}
if (feed.cursor !== 'next-cursor') throw new Error('cursor mismatch');

console.log('PASS: App Password login, session refresh and feed media extraction');
server.close();
