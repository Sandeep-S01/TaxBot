import { execFileSync } from 'child_process';
import path from 'path';
import { describe, expect, it } from 'vitest';

const scriptPath = path.join(process.cwd(), 'scripts', 'check_env.ts');

function runCheckEnv(env: Record<string, string | undefined>) {
  return execFileSync(
    process.execPath,
    ['-r', 'tsx/cjs', scriptPath],
    {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        ...env,
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
}

function validProductionEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://taxbot-prod.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service_role_key_abcdefghijklmnopqrstuvwxyz_1234567890',
    JWT_SECRET: 'jwt_secret_abcdefghijklmnopqrstuvwxyz_1234567890',
    EXPORT_TOKEN_SECRET: 'export_token_secret_abcdefghijklmnopqrstuvwxyz_1234567890',
    META_APP_SECRET: 'meta_app_secret_abcdefghijklmnopqrstuvwxyz_1234567890',
    EMAIL_WEBHOOK_SECRET: 'email_webhook_secret_abcdefghijklmnopqrstuvwxyz_1234567890',
    APP_ORIGIN: 'https://taxbot.example.com',
    ALLOWED_ORIGINS: 'https://taxbot.example.com,https://console.taxbot.example.com',
    GEMINI_API_KEY: 'gemini_api_key_123456',
    ...overrides,
  };
}

describe('check_env script', () => {
  it('accepts valid production URLs and secrets', () => {
    const output = runCheckEnv(validProductionEnv());

    expect(output).toContain('Environment check passed.');
  });

  it('rejects non-https production application origins', () => {
    expect(() => runCheckEnv(validProductionEnv({
      APP_ORIGIN: 'http://taxbot.example.com',
    }))).toThrow(/APP_ORIGIN/);
  });

  it('allows localhost origins outside production', () => {
    const output = runCheckEnv(validProductionEnv({
      NODE_ENV: 'development',
      APP_ORIGIN: 'http://localhost:3000',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    }));

    expect(output).toContain('Environment check passed.');
  });
});
