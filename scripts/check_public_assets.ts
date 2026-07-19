import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');

interface Finding {
  file: string;
  message: string;
}

const findings: Finding[] = [];

function walkHtmlFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkHtmlFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

function isExternalOrInlineAsset(value: string): boolean {
  return /^(https?:)?\/\//i.test(value)
    || /^(data|mailto|tel):/i.test(value)
    || value.startsWith('#')
    || value.trim() === '';
}

function assetPathFor(htmlFile: string, rawValue: string): string {
  const cleanValue = rawValue.split('#')[0].split('?')[0];
  if (cleanValue.startsWith('/')) {
    return path.join(PUBLIC_DIR, cleanValue.slice(1));
  }
  return path.resolve(path.dirname(htmlFile), cleanValue);
}

for (const htmlFile of walkHtmlFiles(PUBLIC_DIR)) {
  const relativeHtml = path.relative(ROOT, htmlFile);
  const content = fs.readFileSync(htmlFile, 'utf8');
  const assetRefs = content.matchAll(/<(script|link|img)\b[^>]*\s(?:src|href)=["']([^"']+)["']/gi);

  for (const match of assetRefs) {
    const rawValue = match[2].trim();
    if (isExternalOrInlineAsset(rawValue)) continue;

    const resolved = assetPathFor(htmlFile, rawValue);
    if (!resolved.startsWith(PUBLIC_DIR) || !fs.existsSync(resolved)) {
      findings.push({
        file: relativeHtml,
        message: `Missing local asset reference: ${rawValue}`,
      });
    }
  }
}

const consoleHtmlPath = path.join(PUBLIC_DIR, 'console.html');
if (fs.existsSync(consoleHtmlPath)) {
  const content = fs.readFileSync(consoleHtmlPath, 'utf8');
  const requiredConsoleScripts = [
    'js/console-utils.js',
    'js/console-api.js',
    'js/console-auth.js',
    'js/console-command.js',
    'js/console-exports.js',
    'js/console-charts.js',
    'js/console-notifications.js',
    'js/console.js',
  ];
  const scriptIndexes = requiredConsoleScripts.map((script) => content.indexOf(`src="${script}"`));

  scriptIndexes.forEach((index, idx) => {
    if (index === -1) {
      findings.push({
        file: path.relative(ROOT, consoleHtmlPath),
        message: `Missing required console script: ${requiredConsoleScripts[idx]}`,
      });
    }
  });

  for (let i = 1; i < scriptIndexes.length; i++) {
    if (scriptIndexes[i - 1] !== -1 && scriptIndexes[i] !== -1 && scriptIndexes[i - 1] > scriptIndexes[i]) {
      findings.push({
        file: path.relative(ROOT, consoleHtmlPath),
        message: `${requiredConsoleScripts[i - 1]} must load before ${requiredConsoleScripts[i]}`,
      });
    }
  }
}

if (findings.length > 0) {
  console.error('Public asset check failed:');
  findings.forEach((finding) => {
    console.error(`${finding.file}: ${finding.message}`);
  });
  process.exit(1);
}

console.log('Public asset checks passed.');
