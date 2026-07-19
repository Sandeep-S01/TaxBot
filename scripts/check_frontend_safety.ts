import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PUBLIC_JS_DIR = path.join(ROOT, 'public', 'js');

interface Finding {
  file: string;
  message: string;
}

const findings: Finding[] = [];

function readPublicJsFiles() {
  return fs
    .readdirSync(PUBLIC_JS_DIR)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({
      file: path.join('public', 'js', file),
      content: fs.readFileSync(path.join(PUBLIC_JS_DIR, file), 'utf8'),
    }));
}

for (const source of readPublicJsFiles()) {
  if (/Authorization\s*:?\s*[`'"]Bearer/i.test(source.content) || /Authorization['"]?\s*:\s*[^,\n]*caSession\.token/i.test(source.content)) {
    findings.push({
      file: source.file,
      message: 'Frontend must not attach CA JWT bearer tokens; use HttpOnly cookie session plus CSRF.',
    });
  }

  if (/localStorage\.setItem\(\s*['"]taxbot_ca_session['"][\s\S]{0,220}\btoken\b/i.test(source.content)) {
    findings.push({
      file: source.file,
      message: 'Frontend must not store CA JWTs in localStorage.',
    });
  }
}

const consoleJs = fs.readFileSync(path.join(PUBLIC_JS_DIR, 'console.js'), 'utf8');
const showToastMatch = consoleJs.match(/function\s+showToast\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
if (showToastMatch && /\.innerHTML\s*=/.test(showToastMatch[0])) {
  findings.push({
    file: path.join('public', 'js', 'console.js'),
    message: 'showToast must render message text with textContent, not innerHTML.',
  });
}

if (findings.length > 0) {
  console.error('Frontend safety check failed:');
  findings.forEach((finding) => {
    console.error(`${finding.file}: ${finding.message}`);
  });
  process.exit(1);
}

console.log('Frontend safety checks passed.');
