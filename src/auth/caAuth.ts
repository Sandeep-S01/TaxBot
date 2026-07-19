import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import crypto from 'crypto';
import { updateCA } from '../db/cas';

const JWT_EXPIRES_IN = '12h';

export interface CAJwtPayload {
  caId: string;
  email: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.includes('your_') || secret.includes('placeholder') || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a non-placeholder value of at least 32 characters.');
  }
  return secret;
}

export function issueCAToken(ca: { id: string; email: string }): string {
  return jwt.sign({ caId: ca.id, email: ca.email }, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
    subject: ca.id,
  });
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
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized: Missing bearer token' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as CAJwtPayload;
    if (!payload.caId) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
    }
    (req as any).caId = payload.caId;
    (req as any).caEmail = payload.email;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

export function getAuthenticatedCAId(req: Request): string {
  const caId = (req as any).caId;
  if (!caId) {
    throw new Error('Authenticated CA id missing from request context');
  }
  return caId;
}
