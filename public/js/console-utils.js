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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getStatusVariant(status) {
  const normalized = String(status || '').toLowerCase();
  if (['needs-review', 'confirmed', 'draft', 'rejected'].includes(normalized)) return normalized;
  if (normalized.includes('reject')) return 'rejected';
  if (normalized.includes('review') || normalized.includes('high')) return 'needs-review';
  if (normalized.includes('verified') || normalized.includes('confirmed') || normalized.includes('ready') || normalized.includes('filed') || normalized === 'info') return 'confirmed';
  return 'draft';
}

function renderStatusPill(status, label = null) {
  const text = label || (() => {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('review')) return 'Needs review';
    if (normalized.includes('reject')) return 'Rejected';
    if (normalized.includes('verified') || normalized.includes('confirmed') || normalized.includes('ready') || normalized.includes('filed')) return 'Confirmed';
    if (normalized.includes('high')) return 'High severity';
    if (normalized.includes('medium')) return 'Medium';
    if (normalized === 'info') return 'Info';
    return status || 'Draft';
  })();
  return `<span class="status-pill ${getStatusVariant(status)}">${escapeHtml(text)}</span>`;
}

function renderSourcePill(source) {
  const label = source || 'Manual';
  const variant = String(label).toLowerCase().includes('whatsapp') ? 'confirmed' : 'draft';
  return `<span class="status-pill ${variant}">${escapeHtml(label)}</span>`;
}

function renderEmptyState(message, actionHtml = '') {
  return `
    <div class="dashboard-empty-state">
      <p>${escapeHtml(message)}</p>
      ${actionHtml ? `<div class="dashboard-empty-action">${actionHtml}</div>` : ''}
    </div>
  `;
}

function renderTableEmptyState(colspan, message, actionHtml = '') {
  return `<tr><td colspan="${Number(colspan) || 1}">${renderEmptyState(message, actionHtml)}</td></tr>`;
}

function renderErrorState(message, actionHtml = '') {
  return `
    <div class="dashboard-error-state" role="alert">
      <p>${escapeHtml(message)}</p>
      ${actionHtml ? `<div class="dashboard-empty-action">${actionHtml}</div>` : ''}
    </div>
  `;
}

function renderTableErrorState(colspan, message, actionHtml = '') {
  return `<tr><td colspan="${Number(colspan) || 1}">${renderErrorState(message, actionHtml)}</td></tr>`;
}

function renderLoadingRows(colspan, count = 3) {
  return Array.from({ length: count }, () => `
    <tr>
      <td colspan="${Number(colspan) || 1}"><div class="skeleton-row" aria-hidden="true"></div></td>
    </tr>
  `).join('');
}

async function withButtonState(button, busyLabel, action) {
  if (!button || button.disabled) return undefined;
  const previous = {
    html: button.innerHTML,
    disabled: button.disabled,
    ariaBusy: button.getAttribute('aria-busy'),
  };

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.classList.add('is-loading');
  if (busyLabel) {
    button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${escapeHtml(busyLabel)}</span>`;
  }

  try {
    return await action();
  } finally {
    button.innerHTML = previous.html;
    button.disabled = previous.disabled;
    if (previous.ariaBusy === null) {
      button.removeAttribute('aria-busy');
    } else {
      button.setAttribute('aria-busy', previous.ariaBusy);
    }
    button.classList.remove('is-loading');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function setFieldStatus(input, message, type = 'error') {
  if (!input) return;
  const fieldWrap = input.closest('div') || input.parentElement;
  if (!fieldWrap) return;

  fieldWrap.querySelectorAll('.field-feedback').forEach(el => el.remove());
  input.classList.toggle('field-invalid', type === 'error');
  input.setAttribute('aria-invalid', String(type === 'error'));

  if (message) {
    const feedback = document.createElement('p');
    feedback.className = `field-feedback field-feedback-${type}`;
    feedback.textContent = message;
    fieldWrap.appendChild(feedback);
  }
}

function parseMarkdown(text) {
  if (!text) return '';
  let html = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(
    /```([\s\S]*?)```/g,
    '<pre style="background: var(--paper); border: 1px solid var(--rule); padding: var(--space-8); border-radius: var(--radius-6); overflow-x: auto; font-family: monospace; font-size: 13px; margin: var(--space-8) 0;"><code>$1</code></pre>'
  );
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="background: var(--paper); border: 1px solid var(--rule); padding: 2px 4px; border-radius: var(--radius-4); font-family: monospace; font-size: 13px;">$1</code>'
  );

  html = html.replace(/^\s*###\s+(.+)$/gm, '<h5 style="margin: var(--space-12) 0 var(--space-6) 0; font-size: 14px; font-weight: 600; color: var(--ink);">$1</h5>');
  html = html.replace(/^\s*##\s+(.+)$/gm, '<h4 style="margin: var(--space-16) 0 var(--space-8) 0; font-size: 15px; font-weight: 600; color: var(--ink);">$1</h4>');
  html = html.replace(/^\s*#\s+(.+)$/gm, '<h3 style="margin: var(--space-16) 0 var(--space-8) 0; font-size: 16px; font-weight: 700; color: var(--ink);">$1</h3>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li style="margin-left: var(--space-16); list-style-type: disc; color: var(--ink); font-size: 13.5px; line-height: 1.5; margin-bottom: 4px;">$1</li>');
  html = html.replace(/^\s*(\d+)\.\s+(.+)$/gm, '<li style="margin-left: var(--space-16); list-style-type: decimal; color: var(--ink); font-size: 13.5px; line-height: 1.5; margin-bottom: 4px;">$2</li>');

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
