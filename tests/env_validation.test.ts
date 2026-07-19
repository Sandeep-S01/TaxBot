import { afterEach, describe, expect, it } from 'vitest';
import { validateEnvironment } from '../src/config/env';

const ORIGINAL_ENV = { ...process.env };

function setValidProductionEnv() {
  process.env.NODE_ENV = 'production';
  process.env.SUPABASE_URL = 'https://taxbot-prod.supabase.co';
  process.env.APP_ORIGIN = 'https://taxbot.example.com';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_abcdefghijklmnopqrstuvwxyz_1234567890';
  process.env.JWT_SECRET = 'jwt_secret_abcdefghijklmnopqrstuvwxyz_1234567890';
  process.env.EXPORT_TOKEN_SECRET = 'export_token_secret_abcdefghijklmnopqrstuvwxyz_1234567890';
  process.env.META_APP_SECRET = 'meta_app_secret_abcdefghijklmnopqrstuvwxyz_1234567890';
  process.env.EMAIL_WEBHOOK_SECRET = 'email_webhook_secret_abcdefghijklmnopqrstuvwxyz_1234567890';
}

describe('production environment validation', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('accepts valid https URLs and long random secrets', () => {
    setValidProductionEnv();

    expect(() => validateEnvironment()).not.toThrow();
  });

  it('rejects placeholder Supabase URLs', () => {
    setValidProductionEnv();
    process.env.SUPABASE_URL = 'https://xxx.supabase.co';

    expect(() => validateEnvironment()).toThrow(/SUPABASE_URL/);
  });

  it('rejects non-https application origins in production', () => {
    setValidProductionEnv();
    process.env.APP_ORIGIN = 'http://taxbot.example.com';

    expect(() => validateEnvironment()).toThrow(/APP_ORIGIN/);
  });

  it('rejects short or placeholder secrets', () => {
    setValidProductionEnv();
    process.env.JWT_SECRET = 'short';

    expect(() => validateEnvironment()).toThrow(/JWT_SECRET/);
  });
});
