/* ==========================================================================
   TaxBot CA Console - Audit Trail & AI Auditor Helpers
   Owns frontend audit logging, settings audit trail, and workspace audit chat.
   ========================================================================== */

async function logFrontendAction(actionType, description, clientId = null) {
  const caSession = getCASession();
  if (!caSession) return;
  try {
    const response = await fetch('/api/ca/audit/log', {
      method: 'POST',
      headers: {
        ...getAuthHeaders({ 'Content-Type': 'application/json' })
      },
      body: JSON.stringify({ actionType, description, clientId })
    });
    if (!response.ok) {
      console.warn('[Audit] Failed to log frontend action to backend');
    }
  } catch (err) {
    console.error('[Audit] Error logging frontend action:', err);
  }
}

async function fetchAndRenderAuditTrail() {
  const tbody = document.getElementById('settings-audit-tbody');
  if (!tbody) return;

  const caSession = getCASession();
  if (!caSession) {
    tbody.innerHTML = renderTableEmptyState(3, 'Sign in to view audit trail events.');
    return;
  }

  tbody.innerHTML = renderLoadingRows(3, 4);

  try {
    const response = await fetch('/api/ca/audit/logs', {
      method: 'GET',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to fetch audit logs');
    }

    const logs = await response.json();

    if (!logs || logs.length === 0) {
      tbody.innerHTML = renderTableEmptyState(3, 'No audit trail events yet. Administrative activity will appear here.');
      return;
    }

    tbody.innerHTML = logs.map(log => {
      const dateStr = log.created_at ? new Date(log.created_at).toLocaleString('en-IN') : 'N/A';
      let actionBadgeClass = 'draft';
      if (log.action_type === 'LOGIN' || log.action_type === 'REGISTER') {
        actionBadgeClass = 'confirmed';
      } else if (log.action_type === 'TRANSACTION_APPROVED') {
        actionBadgeClass = 'confirmed';
      } else if (log.action_type === 'PDF_DOWNLOADED') {
        actionBadgeClass = 'needs-review';
      } else if (log.action_type === 'AI_AUDIT_QUERY') {
        actionBadgeClass = 'draft';
      }

      return `
        <tr class="ledger-row">
          <td class="audit-date">${dateStr}</td>
          <td>${renderStatusPill(actionBadgeClass, log.action_type)}</td>
          <td>${escapeHtml(log.description)}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error(err);
    tbody.innerHTML = renderTableErrorState(3, 'Audit logs failed to load. Retry from the Audit Trail tab.');
  }
}

function initAuditChatTab(clientId, cTx) {
  const chatFeed = document.getElementById('ws-audit-chat-feed');
  const chatForm = document.getElementById('ws-audit-chat-form');
  const chatInput = document.getElementById('ws-audit-chat-input');
  const simIndicator = document.getElementById('ws-audit-simulated-indicator');

  if (!chatFeed || !chatForm || !chatInput) return;

  const clientObj = globalClientsList.find(c => c.id === clientId);
  const clientName = clientObj ? (clientObj.business_name || clientObj.name) : 'Client';

  chatFeed.innerHTML = `
    <!-- Welcome message -->
    <div class="chat-msg system-msg" style="align-self: flex-start; max-width: 80%; background-color: #fff; border: 1px solid var(--rule); border-radius: var(--radius-8) var(--radius-8) var(--radius-8) 0; padding: var(--space-12) var(--space-16); box-shadow: none;">
      <div style="font-weight: 600; color: var(--sage); font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
        <i data-lucide="bot" style="width: 14px; height: 14px;"></i> AI Auditor
      </div>
      <p style="margin: 0; font-size: 14px; color: var(--ink);">
        Hello! I have loaded **${escapeHtml(clientName)}**'s transaction ledger (containing ${cTx.length} records). Ask me any auditing questions, such as:
      </p>
      <ul style="margin: var(--space-8) 0 0 var(--space-16); padding: 0; font-size: 13px; color: var(--ink-soft); display: flex; flex-direction: column; gap: 4px; list-style-type: disc;">
        <li><em>"Check for anomalies or unverified items"</em></li>
        <li><em>"What is their GST liability and compliance status?"</em></li>
        <li><em>"Identify any duplicate entries"</em></li>
      </ul>
    </div>
  `;

  if (simIndicator) simIndicator.style.display = 'none';
  initIcons();

  chatForm.onsubmit = async (e) => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    chatInput.value = '';

    const userMsgHtml = `
      <div class="chat-msg user-msg" style="align-self: flex-end; max-width: 80%; background-color: var(--ink); color: var(--paper); border-radius: var(--radius-8) var(--radius-8) 0 var(--radius-8); padding: var(--space-12) var(--space-16); box-shadow: none;">
        <div style="font-weight: 600; font-size: 11px; margin-bottom: 4px; text-align: right; color: var(--paper-dim);">
          You
        </div>
        <div style="margin: 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;">${escapeHtml(message)}</div>
      </div>
    `;
    chatFeed.insertAdjacentHTML('beforeend', userMsgHtml);
    chatFeed.scrollTop = chatFeed.scrollHeight;

    const loadingId = 'bot-loading-' + Date.now();
    const loadingMsgHtml = `
      <div class="chat-msg system-msg" id="${loadingId}" style="align-self: flex-start; max-width: 80%; background-color: #fff; border: 1px solid var(--rule); border-radius: var(--radius-8) var(--radius-8) var(--radius-8) 0; padding: var(--space-12) var(--space-16); box-shadow: none; display: flex; align-items: center; gap: 8px;">
        <span class="btn-spinner" aria-hidden="true"></span>
        <span style="font-size: 13px; color: var(--ink-soft);">Auditing ledger transactions...</span>
      </div>
    `;
    chatFeed.insertAdjacentHTML('beforeend', loadingMsgHtml);
    chatFeed.scrollTop = chatFeed.scrollHeight;

    const caSession = getCASession();
    if (!caSession) return;

    try {
      const response = await fetch('/api/ca/audit/chat', {
        method: 'POST',
        headers: {
          ...getAuthHeaders({ 'Content-Type': 'application/json' })
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          clientId,
          message
        })
      });

      const data = await response.json();
      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get audit response');
      }

      if (simIndicator) {
        simIndicator.style.display = data.simulated ? 'inline-flex' : 'none';
      }

      const botMsgHtml = `
        <div class="chat-msg system-msg" style="align-self: flex-start; max-width: 80%; background-color: #fff; border: 1px solid var(--rule); border-radius: var(--radius-8) var(--radius-8) var(--radius-8) 0; padding: var(--space-12) var(--space-16); box-shadow: none;">
          <div style="font-weight: 600; color: var(--sage); font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
            <i data-lucide="bot" style="width: 14px; height: 14px;"></i> AI Auditor
          </div>
          <div style="margin: 0; font-size: 14px; color: var(--ink); line-height: 1.5; word-break: break-word;">
            ${parseMarkdown(data.response)}
          </div>
        </div>
      `;
      chatFeed.insertAdjacentHTML('beforeend', botMsgHtml);
      initIcons();
      chatFeed.scrollTop = chatFeed.scrollHeight;

    } catch (err) {
      console.error(err);
      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();

      const errorMsgHtml = `
        <div class="chat-msg system-msg" style="align-self: flex-start; max-width: 80%; background-color: #fff; border: 1px solid var(--rule); border-radius: var(--radius-8) var(--radius-8) var(--radius-8) 0; padding: var(--space-12) var(--space-16); box-shadow: none; color: var(--stamp);">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; color: var(--stamp);">
            <i data-lucide="alert-circle" style="width: 14px; height: 14px;"></i> Error
          </div>
          <p style="margin: 0; font-size: 13px;">${escapeHtml(err.message)}</p>
        </div>
      `;
      chatFeed.insertAdjacentHTML('beforeend', errorMsgHtml);
      initIcons();
      chatFeed.scrollTop = chatFeed.scrollHeight;
    }
  };
}
