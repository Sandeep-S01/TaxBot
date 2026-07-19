import { describe, expect, it, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  hashPassword,
  issueCASession,
  issueCAToken,
  requireCAAuth,
  requireCACsrf,
  verifyPasswordAndMaybeMigrate,
} from '../src/auth/caAuth';

describe('CA authentication helpers', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test_jwt_secret_32_characters_minimum';
  });

  it('hashes and verifies passwords with Argon2', async () => {
    const passwordHash = await hashPassword('correct-password');

    await expect(
      verifyPasswordAndMaybeMigrate({ id: 'ca-1', password_hash: passwordHash }, 'correct-password')
    ).resolves.toBe(true);

    await expect(
      verifyPasswordAndMaybeMigrate({ id: 'ca-1', password_hash: passwordHash }, 'wrong-password')
    ).resolves.toBe(false);
  });

  it('issues signed CA JWTs with the CA id in the payload', () => {
    const token = issueCAToken({ id: 'ca-123', email: 'ca@example.com' });
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;

    expect(payload.caId).toBe('ca-123');
    expect(payload.email).toBe('ca@example.com');
    expect(payload.sub).toBe('ca-123');
  });

  it('authenticates CA requests from HttpOnly session cookies', () => {
    const { token, csrfToken } = issueCASession({ id: 'ca-cookie', email: 'cookie@example.com' });
    const req: any = {
      method: 'GET',
      headers: {
        cookie: `other=value; taxbot_ca_session=${encodeURIComponent(token)}`,
      },
    };
    const res: any = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    let nextCalled = false;

    requireCAAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.caId).toBe('ca-cookie');
    expect(req.caCsrfToken).toBe(csrfToken);
  });

  it('requires matching CSRF token for mutating cookie-authenticated CA requests', () => {
    const req: any = {
      method: 'POST',
      headers: {
        'x-csrf-token': 'correct-csrf',
      },
      caCsrfToken: 'correct-csrf',
    };
    const res: any = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    let nextCalled = false;

    requireCACsrf(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);

    req.headers['x-csrf-token'] = 'wrong-csrf';
    nextCalled = false;
    requireCACsrf(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});
