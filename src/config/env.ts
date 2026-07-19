const REQUIRED_PRODUCTION_URLS = [
  'SUPABASE_URL',
  'APP_ORIGIN',
];

const REQUIRED_PRODUCTION_SECRETS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'EXPORT_TOKEN_SECRET',
  'META_APP_SECRET',
  'EMAIL_WEBHOOK_SECRET',
];

function isUnsafeSecret(value: string | undefined): boolean {
  return (
    !value ||
    value.includes('placeholder') ||
    value.includes('your_') ||
    value === 'default-secret' ||
    value.length < 32
  );
}

function isUnsafeProductionUrl(value: string | undefined): boolean {
  if (
    !value ||
    value.includes('placeholder') ||
    value.includes('your_') ||
    value.includes('xxx')
  ) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol !== 'https:' || !parsed.hostname.includes('.');
  } catch {
    return true;
  }
}

export function validateEnvironment() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const unsafeSecrets = REQUIRED_PRODUCTION_SECRETS.filter((name) =>
    isUnsafeSecret(process.env[name])
  );
  const unsafeUrls = REQUIRED_PRODUCTION_URLS.filter((name) =>
    isUnsafeProductionUrl(process.env[name])
  );
  const missing = [...unsafeSecrets, ...unsafeUrls];

  if (missing.length > 0) {
    throw new Error(
      `Missing or unsafe production environment variables: ${missing.join(', ')}`
    );
  }
}

export function getExportTokenSecret(): string {
  const secret = process.env.EXPORT_TOKEN_SECRET;
  if (process.env.NODE_ENV === 'test' && !secret) {
    return 'test_export_token_secret_32_chars_minimum';
  }
  if (isUnsafeSecret(secret)) {
    throw new Error('EXPORT_TOKEN_SECRET must be set to a non-placeholder value of at least 32 characters.');
  }
  return secret as string;
}
