import { beforeEach, describe, expect, it } from 'vitest';
import { getCorsOptions, getHelmetOptions } from '../src/config/security';

describe('HTTP security configuration', () => {
  beforeEach(() => {
    delete process.env.APP_ORIGIN;
    delete process.env.ALLOWED_ORIGINS;
    process.env.NODE_ENV = 'production';
  });

  it('allows configured production origins and rejects unknown origins', () => {
    process.env.APP_ORIGIN = 'https://taxbot.example.com';
    process.env.ALLOWED_ORIGINS = 'https://admin.taxbot.example.com';
    const options = getCorsOptions();
    const origin = options.origin as Function;

    origin('https://taxbot.example.com', (err: Error | null, allowed: boolean) => {
      expect(err).toBeNull();
      expect(allowed).toBe(true);
    });

    origin('https://evil.example.com', (err: Error | null) => {
      expect(err).toBeInstanceOf(Error);
    });
  });

  it('enables a content security policy', () => {
    const helmetOptions = getHelmetOptions();

    expect(helmetOptions.contentSecurityPolicy).toBeTruthy();
  });
});
