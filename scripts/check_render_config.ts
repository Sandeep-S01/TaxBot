import fs from 'fs';
import path from 'path';

const renderPath = path.join(process.cwd(), 'render.yaml');

if (!fs.existsSync(renderPath)) {
  console.error('render.yaml is required so production deployment commands are version controlled.');
  process.exit(1);
}

const content = fs.readFileSync(renderPath, 'utf8');

const requiredSnippets = [
  'type: web',
  'runtime: node',
  'branch: main',
  'rootDir: .',
  'buildCommand: npm ci && npm run build',
  'startCommand: npm start',
  'healthCheckPath: /health',
  'autoDeployTrigger: commit',
  'key: NODE_ENV',
  'value: production',
  'key: SUPABASE_SERVICE_ROLE_KEY',
  'key: JWT_SECRET',
  'key: EXPORT_TOKEN_SECRET',
  'key: GEMINI_API_KEY',
  'key: META_APP_SECRET',
  'key: EMAIL_WEBHOOK_SECRET',
  'key: APP_ORIGIN',
];

const missing = requiredSnippets.filter((snippet) => !content.includes(snippet));

if (missing.length > 0) {
  console.error('Render config check failed. Missing required deployment settings:');
  missing.forEach((snippet) => console.error(`- ${snippet}`));
  process.exit(1);
}

const syncFalseSecretKeys = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'JWT_SECRET',
  'EXPORT_TOKEN_SECRET',
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'META_APP_SECRET',
  'EMAIL_WEBHOOK_SECRET',
  'APP_ORIGIN',
  'ALLOWED_ORIGINS',
];

for (const key of syncFalseSecretKeys) {
  const pattern = new RegExp(`key:\\s*${key}[\\s\\S]{0,80}sync:\\s*false`);
  if (!pattern.test(content)) {
    console.error(`Render config check failed. ${key} must be declared with sync: false.`);
    process.exit(1);
  }
}

console.log('Render config checks passed.');
