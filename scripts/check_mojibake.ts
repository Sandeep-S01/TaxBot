import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const EXTENSIONS = new Set(['.ts', '.js', '.html', '.css', '.md', '.json']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const MOJIBAKE_PATTERNS = [
  /\u00c3\u00a2/,
  /\u00c3\u00b0/,
  /\u00c3\u0192[^\s]/,
  /\u00c3\u00a0/,
  /\u00c2[^\s]/,
  /\u00e2[\u0080-\u00bf]/,
  /\u00f0[\u0080-\u00bf]/,
];

interface Finding {
  file: string;
  line: number;
  text: string;
}

function walk(dir: string, findings: Finding[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, findings);
      continue;
    }

    if (path.relative(ROOT, fullPath) === path.join('scripts', 'check_mojibake.ts')) {
      continue;
    }

    if (!EXTENSIONS.has(path.extname(entry.name))) continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    content.split(/\r?\n/).forEach((line, index) => {
      if (MOJIBAKE_PATTERNS.some((pattern) => pattern.test(line))) {
        findings.push({
          file: path.relative(ROOT, fullPath),
          line: index + 1,
          text: line.trim().slice(0, 160),
        });
      }
    });
  }
}

const findings: Finding[] = [];
walk(ROOT, findings);

if (findings.length > 0) {
  console.error('Potential mojibake detected:');
  findings.slice(0, 50).forEach((finding) => {
    console.error(`${finding.file}:${finding.line}: ${finding.text}`);
  });
  if (findings.length > 50) {
    console.error(`...and ${findings.length - 50} more`);
  }
  process.exit(1);
}

console.log('No mojibake patterns detected.');
