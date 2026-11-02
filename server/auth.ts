import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { AuthUser } from '../shared/types';
import {
  deleteRemoteSession,
  loginWithAppPassword,
  toAuthUser,
  type SessionRecord,
} from './bsky';
import { ApiError } from './http';

const COOKIE_NAME = 'bsky_spider_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

interface StoredSession {
  id: string;
  session: SessionRecord;
  createdAt: number;
  lastUsedAt: number;
}

const sessions = new Map<string, StoredSession>();

function parseCookies(header?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

function cookieHeader(sessionId: string, maxAge: number): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ].join('; ');
}

function cleanupSessions(): void {
  const cutoff = Date.now() - MAX_AGE_SECONDS * 1000;
  for (const [id, entry] of sessions) {
    if (entry.lastUsedAt < cutoff) sessions.delete(id);
  }
}

export async function login(
  identifier: string,
  password: string,
  pds: string | undefined,
): Promise<{ user: AuthUser; cookie: string }> {
  const result = await loginWithAppPassword(identifier, password, pds);
  cleanupSessions();
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  sessions.set(sessionId, {
    id: sessionId,
    session: result.session,
    createdAt: now,
    lastUsedAt: now,
  });
  return {
    user: result.user,
    cookie: cookieHeader(sessionId, MAX_AGE_SECONDS),
  };
}

export function getSessionFromRequest(req: Request): SessionRecord | null {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[COOKIE_NAME];
  if (!sessionId) return null;
  const entry = sessions.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.lastUsedAt > MAX_AGE_SECONDS * 1000) {
    sessions.delete(sessionId);
    return null;
  }
  entry.lastUsedAt = Date.now();
  return entry.session;
}

export function requireSession(req: Request): SessionRecord {
  const session = getSessionFromRequest(req);
  if (!session) {
    throw new ApiError('登录已过期，请重新登录', 401, 'unauthorized');
  }
  return session;
}

export function sessionUser(req: Request): AuthUser | null {
  const session = getSessionFromRequest(req);
  return session ? toAuthUser(session) : null;
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', cookieHeader('', 0));
}

export async function logout(req: Request, res: Response): Promise<void> {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[COOKIE_NAME];
  if (sessionId) {
    const entry = sessions.get(sessionId);
    if (entry) {
      await deleteRemoteSession(entry.session);
      sessions.delete(sessionId);
    }
  }
  clearSessionCookie(res);
}

export function setSessionCookie(res: Response, cookie: string): void {
  res.setHeader('Set-Cookie', cookie);
}

// A tiny in-memory guard against password brute-force attempts on the local
// HTTP endpoint. This is deliberately simple; the server binds to localhost.
const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return;
  }
  entry.count += 1;
  if (entry.count > 12) {
    throw new ApiError(
      '登录尝试过于频繁，请稍后再试。',
      429,
      'too_many_attempts',
    );
  }
}

export function resetLoginRateLimit(ip: string): void {
  attempts.delete(ip);
}
