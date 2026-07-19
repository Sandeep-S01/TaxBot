import fs from 'fs';
import path from 'path';

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');

interface Finding {
  file: string;
  message: string;
}

const findings: Finding[] = [];

const riskyPatterns: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /console\.(log|error|warn)\([^)]*JSON\.stringify\([^)]*(data|transactions|client|response)[^)]*\)/i,
    message: 'Avoid printing raw database/API objects with JSON.stringify in diagnostic scripts.',
  },
  {
    pattern: /console\.(log|error|warn)\([^)]*err\.response\??\.data/i,
    message: 'Avoid printing raw provider error response bodies; use logProviderError/logData.',
  },
  {
    pattern: /console\.(log|error|warn)\([^)]*res\.data/i,
    message: 'Avoid printing raw response data; use logData or a count/status summary.',
  },
  {
    pattern: /console\.(log|error|warn)\([^)]*headers/i,
    message: 'Avoid printing raw response headers; they may include provider metadata or secrets.',
  },
];

for (const file of fs.readdirSync(SCRIPTS_DIR).filter((name) => name.endsWith('.ts'))) {
  if (file === 'check_script_safety.ts') continue;
  const relativeFile = path.join('scripts', file);
  const content = fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8');

  for (const { pattern, message } of riskyPatterns) {
    if (pattern.test(content)) {
      findings.push({ file: relativeFile, message });
    }
  }
}

if (findings.length > 0) {
  console.error('Script safety check failed:');
  findings.forEach((finding) => {
    console.error(`${finding.file}: ${finding.message}`);
  });
  process.exit(1);
}

console.log('Script safety checks passed.');
