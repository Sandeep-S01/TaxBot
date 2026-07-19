import dotenv from 'dotenv';

dotenv.config();

type EnvCheck = {
  name: string;
  required: boolean;
  minLength?: number;
};

const checks: EnvCheck[] = [
  { name: 'SUPABASE_URL', required: true },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', required: true, minLength: 32 },
  { name: 'JWT_SECRET', required: true, minLength: 32 },
  { name: 'EXPORT_TOKEN_SECRET', required: true, minLength: 32 },
  { name: 'META_APP_SECRET', required: true, minLength: 32 },
  { name: 'APP_ORIGIN', required: true },
  { name: 'ALLOWED_ORIGINS', required: false },
  { name: 'GEMINI_API_KEY', required: true, minLength: 16 },
  { name: 'SUPABASE_ANON_KEY', required: false, minLength: 16 },
  { name: 'WA_TOKEN', required: false, minLength: 16 },
  { name: 'WA_PHONE_ID', required: false },
  { name: 'WA_VERIFY_TOKEN', required: false, minLength: 8 },
  { name: 'RENDER_EXTERNAL_URL', required: false },
];

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
