/* ==========================================================================
   TaxBot CA Console - Browser Utility Helpers
   Shared escaping, export, and lightweight markdown helpers for console.js.
   ========================================================================== */

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function safeExportFilename(value, fallback = 'TaxBot_Export') {
  const cleaned = String(value ?? '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
  return cleaned || fallback;
}

function parseMarkdown(text) {
  if (!text) return '';
  let html = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(
    /```([\s\S]*?)```/g,
    '<pre style="background: var(--bg-app); border: 1px solid var(--border); padding: var(--space-8); border-radius: var(--radius-6); overflow-x: auto; font-family: monospace; font-size: 13px; margin: var(--space-8) 0;"><code>$1</code></pre>'
  );
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="background: var(--bg-app); border: 1px solid var(--border); padding: 2px 4px; border-radius: var(--radius-4); font-family: monospace; font-size: 13px;">$1</code>'
  );

  html = html.replace(/^\s*###\s+(.+)$/gm, '<h5 style="margin: var(--space-12) 0 var(--space-6) 0; font-size: 14px; font-weight: 600; color: var(--text-primary);">$1</h5>');
  html = html.replace(/^\s*##\s+(.+)$/gm, '<h4 style="margin: var(--space-16) 0 var(--space-8) 0; font-size: 15px; font-weight: 600; color: var(--text-primary);">$1</h4>');
  html = html.replace(/^\s*#\s+(.+)$/gm, '<h3 style="margin: var(--space-16) 0 var(--space-8) 0; font-size: 16px; font-weight: 700; color: var(--text-primary);">$1</h3>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li style="margin-left: var(--space-16); list-style-type: disc; color: var(--text-primary); font-size: 13.5px; line-height: 1.5; margin-bottom: 4px;">$1</li>');
  html = html.replace(/^\s*(\d+)\.\s+(.+)$/gm, '<li style="margin-left: var(--space-16); list-style-type: decimal; color: var(--text-primary); font-size: 13.5px; line-height: 1.5; margin-bottom: 4px;">$2</li>');

  const lines = html.split('\n');
  let insidePre = false;
  const processedLines = lines.map(line => {
    if (line.includes('<pre')) insidePre = true;
    const isPreClosingLine = line.includes('</pre>');
    if (insidePre) {
      if (isPreClosingLine) insidePre = false;
      return line;
    }

    if (line.startsWith('<li') || line.startsWith('<h') || line.startsWith('<code') || line.trim() === '') {
      return line;
    }
    return line + '<br>';
  });

  return processedLines.join('\n');
}
