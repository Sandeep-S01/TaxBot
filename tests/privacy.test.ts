import { describe, expect, it } from 'vitest';
import { hashIdentifier, summarizeHttpError } from '../src/utils/privacy';

describe('Privacy-safe logging helpers', () => {
  it('hashes identifiers into stable short correlation ids', () => {
    const first = hashIdentifier('+919999999999');
    const second = hashIdentifier('+919999999999');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{12}$/);
    expect(first).not.toContain('9999');
  });

  it('summarizes HTTP errors without returning response bodies', () => {
    const summary = summarizeHttpError({
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: {
          access_token: 'secret',
          recipient: '+919999999999',
        },
      },
    });

    expect(summary).toEqual({
      status: 400,
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 400',
    });
    expect(JSON.stringify(summary)).not.toContain('secret');
    expect(JSON.stringify(summary)).not.toContain('+919999999999');
  });
});
