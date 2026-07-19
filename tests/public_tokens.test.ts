import { describe, expect, it, beforeEach } from 'vitest';
import { createPaymentLink, generatePaymentToken, validatePaymentToken } from '../src/utils/publicTokens';

describe('Public signed tokens', () => {
  beforeEach(() => {
    process.env.EXPORT_TOKEN_SECRET = 'test_export_token_secret_32_chars_minimum';
  });

  it('generates and validates signed payment links', () => {
    const txId = 'tx-public-123';
    const issued = new Date().toISOString().split('T')[0];
    const token = generatePaymentToken(txId, issued);

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(validatePaymentToken(txId, issued, token)).toBe(true);
    expect(createPaymentLink('https://taxbot.example.com/', txId, issued)).toContain(`/pay/${txId}?issued=${issued}&token=${token}`);
  });

  it('rejects tampered, mismatched, and expired payment tokens', () => {
    const txId = 'tx-public-123';
    const issued = new Date().toISOString().split('T')[0];
    const expired = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const token = generatePaymentToken(txId, issued);
    const expiredToken = generatePaymentToken(txId, expired);

    expect(validatePaymentToken(txId, issued, 'invalid-token')).toBe(false);
    expect(validatePaymentToken('other-tx', issued, token)).toBe(false);
    expect(validatePaymentToken(txId, expired, expiredToken)).toBe(false);
  });
});
