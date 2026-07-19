import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPasswordAndMaybeMigrate } from '../src/auth/caAuth';

describe('CA Authentication and Password Security', () => {
  it('stores new passwords as Argon2 hashes', async () => {
    const hash = await hashPassword('secure_ca_password_2026');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('secure_ca_password_2026');
  });

  it('verifies matching Argon2 hashes and rejects mismatches', async () => {
    const dbStoredHash = await hashPassword('password123');

    await expect(
      verifyPasswordAndMaybeMigrate({ id: 'ca-test', password_hash: dbStoredHash }, 'password123')
    ).resolves.toBe(true);

    await expect(
      verifyPasswordAndMaybeMigrate({ id: 'ca-test', password_hash: dbStoredHash }, 'Password123')
    ).resolves.toBe(false);
  });
});
