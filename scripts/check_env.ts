import dotenv from 'dotenv';

dotenv.config();

type EnvCheck = {
  name: string;
  required: boolean;
  minLength?: number;
  kind?: 'secret' | 'url';
  requireHttpsInProduction?: boolean;
};

const checks: EnvCheck[] = [
  { name: 'SUPABASE_URL', required: true, kind: 'url', requireHttpsInProduction: true },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', required: true, minLength: 32, kind: 'secret' },
  { name: 'JWT_SECRET', required: true, minLength: 32, kind: 'secret' },
  { name: 'EXPORT_TOKEN_SECRET', required: true, minLength: 32, kind: 'secret' },
  { name: 'META_APP_SECRET', required: true, minLength: 32, kind: 'secret' },
  { name: 'EMAIL_WEBHOOK_SECRET', required: true, minLength: 32, kind: 'secret' },
  { name: 'APP_ORIGIN', required: true, kind: 'url', requireHttpsInProduction: true },
  { name: 'ALLOWED_ORIGINS', required: false, kind: 'url', requireHttpsInProduction: true },
  { name: 'GEMINI_API_KEY', required: true, minLength: 16 },
  { name: 'ANTHROPIC_API_KEY', required: false, minLength: 20 },
  { name: 'SUPABASE_ANON_KEY', required: false, minLength: 16 },
  { name: 'WA_TOKEN', required: false, minLength: 16 },
  { name: 'WA_PHONE_ID', required: false },
  { name: 'WA_VERIFY_TOKEN', required: false, minLength: 8 },
  { name: 'RENDER_EXTERNAL_URL', required: false, kind: 'url', requireHttpsInProduction: true },
];

const isProduction = process.env.NODE_ENV === 'production';

function isPlaceholder(value: string): boolean {
  const lowered = value.toLowerCase();
  return (
    lowered.includes('placeholder') ||
    lowered.includes('your_') ||
    lowered.includes('replace_with') ||
    lowered.includes('xxx.supabase.co') ||
    value === 'default-secret'
  );
}

function isLocalhostUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function validateUrlValue(value: string, check: EnvCheck): string[] {
  const problems: string[] = [];
  const values = check.name === 'ALLOWED_ORIGINS'
    ? value.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [value];

  for (const candidate of values) {
    try {
      const parsed = new URL(candidate);
      if (check.requireHttpsInProduction && isProduction && parsed.protocol !== 'https:') {
        problems.push(`${candidate} must use https in production`);
      }
      if (isProduction && !parsed.hostname.includes('.') && !isLocalhostUrl(candidate)) {
        problems.push(`${candidate} must use a fully qualified host in production`);
      }
    } catch {
      problems.push(`${candidate} is not a valid URL`);
    }
  }

  return problems;
}

let hasFailure = false;

for (const check of checks) {
  const value = process.env[check.name];
  const problems: string[] = [];

  if (!value) {
    if (check.required) {
      problems.push('missing');
    }
  } else {
    if (check.minLength && value.length < check.minLength) {
      problems.push(`too short, expected at least ${check.minLength} chars`);
    }
    if (isPlaceholder(value)) {
      problems.push('placeholder value');
    }
    if (check.kind === 'url') {
      problems.push(...validateUrlValue(value, check));
    }
  }

  if (problems.length > 0) {
    hasFailure = true;
    console.error(`FAIL ${check.name}: ${problems.join(', ')}`);
  } else if (value) {
    console.log(`OK   ${check.name}: present`);
  } else {
    console.log(`SKIP ${check.name}: optional and not set`);
  }
}

if (hasFailure) {
  console.error('\nEnvironment check failed. Add real values to .env locally or to your deployment provider.');
  process.exit(1);
}

console.log('\nEnvironment check passed.');
