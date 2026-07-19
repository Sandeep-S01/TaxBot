import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import crypto from 'crypto';
import { updateCA } from '../db/cas';

const JWT_EXPIRES_IN = '12h';
const SESSION_COOKIE_NAME = 'taxbot_ca_session';
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface CAJwtPayload {
  caId: string;
  email: string;
  csrfToken?: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.includes('your_') || secret.includes('placeholder') || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a non-placeholder value of at least 32 characters.');
  }
  return secret;
}

export function issueCAToken(ca: { id: string; email: string }, csrfToken?: string): string {
  return jwt.sign({ caId: ca.id, email: ca.email, csrfToken }, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
    subject: ca.id,
  });
}

export function issueCASession(ca: { id: string; email: string }): { token: string; csrfToken: string } {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  return {
    token: issueCAToken(ca, csrfToken),
    csrfToken,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
  });
}

export async function verifyPasswordAndMaybeMigrate(
  ca: { id: string; password_hash: string },
  password: string
): Promise<boolean> {
  if (ca.password_hash.startsWith('$argon2')) {
    return argon2.verify(ca.password_hash, password);
  }

  // Legacy SHA-256 compatibility for existing prototype accounts.
  if (/^[0-9a-f]{64}$/i.test(ca.password_hash)) {
    const inputHash = crypto.createHash('sha256').update(password).digest('hex');
    if (inputHash !== ca.password_hash) {
      return false;
    }

    const migratedHash = await hashPassword(password);
    await updateCA(ca.id, { password_hash: migratedHash });
    return true;
  }

  return false;
}

export function requireCAAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req) || getCookieValue(req, SESSION_COOKIE_NAME);

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing CA session' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as CAJwtPayload;
    if (!payload.caId) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
    }
    (req as any).caId = payload.caId;
    (req as any).caEmail = payload.email;
    (req as any).caCsrfToken = payload.csrfToken || null;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

export function requireCACsrf(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const expected = (req as any).caCsrfToken;
  const provided = req.headers['x-csrf-token'];

  if (!expected) {
    return res.status(403).json({ error: 'Forbidden: CSRF token missing from session' });
  }
  if (Array.isArray(provided) || provided !== expected) {
    return res.status(403).json({ error: 'Forbidden: Invalid CSRF token' });
  }

  return next();
}

export function setCASessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  });
}

export function clearCASessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

export function getAuthenticatedCAId(req: Request): string {
  const caId = (req as any).caId;
  if (!caId) {
    throw new Error('Authenticated CA id missing from request context');
  }
  return caId;
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

function getCookieValue(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((part) => part.trim());
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator === -1) continue;
    const key = cookie.slice(0, separator);
    if (key === name) {
      return decodeURIComponent(cookie.slice(separator + 1));
    }
  }

  return null;
}
