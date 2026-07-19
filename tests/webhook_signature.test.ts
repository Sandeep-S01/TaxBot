import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { isValidMetaSignature } from '../src/webhook/signature';

describe('Meta webhook signature verification', () => {
  const secret = 'meta_app_secret_32_characters_minimum';
  const rawBody = Buffer.from(JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [],
  }));

  it('accepts a valid X-Hub-Signature-256 header', () => {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    expect(isValidMetaSignature(rawBody, `sha256=${signature}`, secret)).toBe(true);
  });

  it('rejects missing, malformed, and tampered signatures', () => {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    expect(isValidMetaSignature(rawBody, undefined, secret)).toBe(false);
    expect(isValidMetaSignature(rawBody, signature, secret)).toBe(false);
    expect(isValidMetaSignature(rawBody, 'sha256=not-hex', secret)).toBe(false);
    expect(isValidMetaSignature(Buffer.from('tampered'), `sha256=${signature}`, secret)).toBe(false);
  });
});
