import { describe, expect, it, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { hashPassword, issueCAToken, verifyPasswordAndMaybeMigrate } from '../src/auth/caAuth';

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
});
