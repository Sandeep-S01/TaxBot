/* ==========================================================================
   TaxBot CA Partner Console - Redesigned JS Controller (console.js)
   Coordinates SPA routing, auth checks, and real Express API integration
   ========================================================================== */

// --------------------------------------------------------------------------
// 1. Session & Global State Coordinator
// --------------------------------------------------------------------------
let activeClientId = null;
let selectedDocId = null;
let currentClientsViewMode = 'table';
let globalClientsList = []; // loaded from backend
let globalTransactions = []; // compiled from clients
let globalDocuments = []; // compiled client files
let globalInsights = []; // AI insights calculated dynamically

// Check CA Authentication session
function checkAuth() {
  const sessionStr = localStorage.getItem('taxbot_ca_session');
  const authLayout = document.getElementById('auth-layout');
  const consoleLayout = document.getElementById('console-layout');

  if (sessionStr) {
    try {
      const caSession = JSON.parse(sessionStr);
      if (!caSession.csrfToken) {
        throw new Error('Legacy session missing CSRF token');
      }
      authLayout.classList.add('hidden');
      consoleLayout.style.display = 'flex';
      
      // Update profile info
      document.getElementById('ca-display-name').textContent = caSession.name;
      document.getElementById('ca-display-header-name').textContent = caSession.name;
      document.getElementById('ca-display-email').textContent = caSession.email || caSession.firm_name || 'Partner Account';
      document.getElementById('ca-avatar-letter').textContent = caSession.name.charAt(0).toUpperCase();

      // Initialize workspace
      initConsole();
    } catch (e) {
      localStorage.removeItem('taxbot_ca_session');
      showAuthScreen();
    }
  } else {
    showAuthScreen();
  }
}

function showAuthScreen() {
  document.getElementById('auth-layout').classList.remove('hidden');
  document.getElementById('console-layout').style.display = 'none';
}

// --------------------------------------------------------------------------
// 2. SPA Router & App Init
// --------------------------------------------------------------------------
function initConsole() {
  initRouter();
  initModals();
  initCommandBar();
  initNotifications();
}

function initRouter() {
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.view-section');

  function handleRoute(hash) {
    let targetView = hash.replace('#', '') || 'overview';
    
    // Override if we are opening a client workspace specifically
    if (targetView.startsWith('client/')) {
      const parts = targetView.split('/');
      activeClientId = parts[1];
      targetView = 'client-workspace';
    }

    // Toggle active classes
    sections.forEach(sec => {
      sec.classList.remove('active');
      sec.classList.add('hidden');
    });

    const activeSec = document.getElementById(`view-${targetView}`);
    if (activeSec) {
      activeSec.classList.add('active');
      activeSec.classList.remove('hidden');
    }

    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('data-view') === targetView) {
        link.classList.add('active');
      }
    });

    // Page-specific render trigger
    triggerPageRender(targetView);
    window.scrollTo(0, 0);
  }

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      window.location.hash = view;
    });
  });

  window.addEventListener('hashchange', () => {
    handleRoute(window.location.hash);
  });

  // Initial routing load
  handleRoute(window.location.hash);
}

async function triggerPageRender(viewName) {
  initIcons();
  
  // Make sure we load client directory first as it populates dropdowns
  if (globalClientsList.length === 0) {
    await fetchClientsList();
  }

  switch (viewName) {
    case 'overview':
      renderOverview();
      break;
    case 'clients':
      renderClients();
      break;
    case 'client-workspace':
      renderClientWorkspace(activeClientId);
      break;
    case 'transactions':
      renderTransactions();
      break;
    case 'documents':
      renderDocuments();
      break;
    case 'gst':
      renderGSTCenter();
      break;
    case 'insights':
      renderAIInsights();
      break;
    case 'exports':
      renderExports();
      break;
    case 'billing':
      renderBilling();
      break;
    case 'settings':
      renderSettings();
      break;
  }
}

function initIcons() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// --------------------------------------------------------------------------
// 4. API Live Connectors
// --------------------------------------------------------------------------

async function fetchClientsList() {
  const caSession = getCASession();
  if (!caSession) return;

  try {
    const res = await fetch('/api/ca/clients', {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to load client directory');
    
    const dbClients = await res.json();
    
    // Map backend schema to UI schema
    globalClientsList = dbClients.map(c => ({
      id: c.id,
      name: escapeHtml(c.business_name || c.name || 'Unnamed Business'),
      gstin: escapeHtml(c.gstin || 'N/A'),
      owner: escapeHtml(c.name || 'N/A'),
      phone: escapeHtml('+' + c.phone),
      plan: c.plan === 'pro' ? 'Partner Pro' : (c.plan === 'starter' ? 'Starter Plan' : 'Trial Plan'),
      lastActivity: 'Active',
      health: c.gstin ? 95 : 68,
      status: 'Active',
      filedStatus: c.plan === 'pro' ? 'Ready' : (c.plan === 'starter' ? 'Review Required' : 'Missing Data')
    }));

    // Update global counters in HTML
    document.getElementById('clients-count').textContent = globalClientsList.length;

    // Now fetch real transactions from aggregated API
    await fetchGlobalTransactions();

    // Setup mock notifications linked to actual clients
    setupMockNotifications();
  } catch (err) {
    showToast(err.message);
  }
}

async function fetchGlobalTransactions() {
  const caSession = getCASession();
  if (!caSession) return;

  // Reset global arrays
  globalTransactions = [];
  globalDocuments = [];
  globalInsights = [];

  try {
    const res = await fetch('/api/ca/transactions', {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to load transactions');

    const data = await res.json();
    const apiTx = data.transactions || [];

    // Map backend Transaction schema to UI schema
    globalTransactions = apiTx.map(t => {
      const sourceMap = {
        'whatsapp_text': 'WhatsApp',
        'whatsapp_image': 'WhatsApp Image',
        'whatsapp_pdf': 'WhatsApp PDF',
        'manual': 'Manual'
      };
      const categoryLabel = (t.category || 'other').charAt(0).toUpperCase() + (t.category || 'other').slice(1);

      return {
        id: t.id,
        clientId: t.client_id,
        clientName: escapeHtml(t.client_name || 'Unknown'),
        date: escapeHtml(t.date),
        type: t.category === 'sales' ? 'Sale' : 'Expense',
        source: escapeHtml(sourceMap[t.source] || t.source || 'WhatsApp'),
        category: escapeHtml(t.description || categoryLabel),
        gstRate: t.gst_rate ? `${t.gst_rate}%` : '0%',
        gst_rate: t.gst_rate,
        amount: Number(t.amount),
        taxAmount: Number(t.tax_amount || 0),
        status: t.confidence === 'high' ? 'Verified' : (t.confidence === 'medium' ? 'Auto-Categorized' : 'Review Required'),
        vendorName: t.vendor_name ? escapeHtml(t.vendor_name) : null,
        invoiceNumber: t.invoice_number ? escapeHtml(t.invoice_number) : null
      };
    });

    // Build documents from transactions that came from image/pdf sources
    globalDocuments = globalTransactions
      .filter(t => t.source === 'WhatsApp Image' || t.source === 'WhatsApp PDF')
      .map(t => ({
        id: `doc-${t.id}`,
        clientId: t.clientId,
        clientName: t.clientName,
        name: t.invoiceNumber ? `INV_${t.invoiceNumber}.pdf` : `Doc_${t.id.substring(0, 8)}.pdf`,
        folder: t.type === 'Sale' ? 'invoices' : 'receipts',
        size: '—',
        received: t.date,
        status: 'Parsed',
        total: `₹${(t.amount + t.taxAmount).toLocaleString('en-IN')}`,
        subtotal: `₹${t.amount.toLocaleString('en-IN')}`,
        gst: `₹${t.taxAmount.toLocaleString('en-IN')}`,
        vendor: t.vendorName || 'Unknown Vendor',
        gstin: 'N/A'
      }));

    // Build AI insights from clients that need attention
    globalClientsList.forEach(c => {
      if (c.filedStatus !== 'Ready') {
        const clientTx = globalTransactions.filter(t => t.clientId === c.id);
        const lowConfidence = clientTx.filter(t => t.status === 'Review Required');

        if (lowConfidence.length > 0) {
          globalInsights.push({
            id: `ins-${c.id}`,
            clientId: c.id,
            clientName: c.name,
            severity: 'high',
            title: `${lowConfidence.length} Transaction(s) Need Review`,
            desc: `${lowConfidence.length} auto-extracted entries have low confidence and require manual verification before filing.`,
            suggestion: 'Review and approve each transaction in the client workspace.'
          });
        } else if (c.filedStatus === 'Missing Data') {
          globalInsights.push({
            id: `ins-${c.id}`,
            clientId: c.id,
            clientName: c.name,
            severity: clientTx.length === 0 ? 'high' : 'medium',
            title: clientTx.length === 0 ? 'No Transactions Logged' : 'Missing Expense Invoices',
            desc: clientTx.length === 0 
              ? 'This client has not sent any transaction data via WhatsApp yet.'
              : 'Auto-extracted ledger entries lack supporting receipts.',
            suggestion: clientTx.length === 0 
              ? 'Send a WhatsApp onboarding message to the client.'
              : 'Send automated WhatsApp prompt requesting receipt.'
          });
        } else {
          globalInsights.push({
            id: `ins-${c.id}`,
            clientId: c.id,
            clientName: c.name,
            severity: 'medium',
            title: 'Input Tax Credit (ITC) Reconciliation Pending',
            desc: 'GSTR-2B claims need verification against logged WhatsApp invoices.',
            suggestion: 'Reconcile ledger with bank statement data.'
          });
        }
      }
    });
  } catch (err) {
    console.error('Failed to fetch global transactions:', err);
  }

  // Update badges
  const pendingCount = globalTransactions.filter(t => t.status === 'Review Required').length;
  document.getElementById('pending-transactions-badge').textContent = pendingCount || globalTransactions.length;
  document.getElementById('documents-count-badge').textContent = globalDocuments.length;
  document.getElementById('insights-count-badge').textContent = globalInsights.length;
}

// --------------------------------------------------------------------------
// 5. Page Rendering Logics
// --------------------------------------------------------------------------

// Screen 1: Overview Dashboard
function renderOverview() {
  document.getElementById('kpi-active-clients').textContent = globalClientsList.length;
  const readyCount = globalClientsList.filter(c => c.filedStatus === 'Ready').length;
  document.getElementById('kpi-gst-ready').textContent = readyCount;
  document.getElementById('kpi-gst-ready-sub').textContent = `${readyCount} / ${globalClientsList.length} reconciled`;
  
  const actionCount = globalClientsList.filter(c => c.filedStatus !== 'Ready').length;
  document.getElementById('kpi-pending-filings').textContent = actionCount;
  document.getElementById('kpi-docs-today').textContent = globalDocuments.length;
  document.getElementById('kpi-trans-today').textContent = globalTransactions.length;
  
  // Calculate real transaction totals for revenue display
  let totalSales = 0;
  let totalExpenses = 0;
  globalTransactions.forEach(t => {
    const amt = Math.abs(t.amount);
    if (t.type === 'Sale') {
      totalSales += amt;
    } else {
      totalExpenses += amt;
    }
  });

  // Calculate total monthly revenue based on reseller tiers
  let totalRev = 0;
  globalClientsList.forEach(c => {
    let rate = 149;
    if (globalClientsList.length >= 50) rate = 99;
    else if (globalClientsList.length >= 10) rate = 119;
    totalRev += rate;
  });
  document.getElementById('kpi-monthly-rev').textContent = `₹${totalRev.toLocaleString('en-IN')}`;

  // Urgent actions count text
  document.getElementById('kpi-urgent-actions-count').textContent = `${globalInsights.length} Action Items`;

  // Render business health counts — use real transaction data to compute health
  globalClientsList.forEach(c => {
    const clientTx = globalTransactions.filter(t => t.clientId === c.id);
    const verified = clientTx.filter(t => t.status === 'Verified').length;
    const total = clientTx.length;
    if (total > 0) {
      c.health = Math.round((verified / total) * 100);
    } else {
      c.health = c.gstin ? 50 : 30; // No data = lower health
    }
  });

  const healthyCount = globalClientsList.filter(c => c.health >= 80).length;
  const reviewCount = globalClientsList.filter(c => c.health >= 50 && c.health < 80).length;
  const criticalCount = globalClientsList.filter(c => c.health < 50).length;

  document.getElementById('health-metric-healthy').textContent = healthyCount;
  document.getElementById('health-metric-review').textContent = reviewCount;
  document.getElementById('health-metric-critical').textContent = criticalCount;

  // Render health bar segment ratios
  const totalBar = globalClientsList.length || 1;
  const healthyPct = (healthyCount / totalBar) * 100;
  const reviewPct = (reviewCount / totalBar) * 100;
  const criticalPct = (criticalCount / totalBar) * 100;

  document.getElementById('health-visual-bar-root').innerHTML = `
    <div class="bar-segment bg-success" style="width: ${healthyPct}%;"></div>
    <div class="bar-segment bg-warning" style="width: ${reviewPct}%;"></div>
    <div class="bar-segment bg-danger" style="width: ${criticalPct}%;"></div>
  `;

  // Render recent activities from real transactions
  const activityContainer = document.getElementById('overview-activity-feed');
  if (globalTransactions.length === 0) {
    activityContainer.innerHTML = `
      <div class="empty-state">
        <i data-lucide="inbox" style="width:40px;height:40px;color:var(--text-secondary);margin-bottom:12px;"></i>
        <p class="text-secondary">No transactions yet. Clients can send invoices via WhatsApp to start logging.</p>
      </div>
    `;
  } else {
    activityContainer.innerHTML = globalTransactions.slice(0, 5).map((t, idx) => `
      <div class="feed-item">
        <div class="feed-marker ${t.type === 'Sale' ? 'bg-success' : 'bg-primary'}"></div>
        <div class="feed-content">
          <p class="feed-text"><strong>${t.clientName}</strong> logged a ${t.type.toLowerCase()} of ₹${Math.abs(t.amount).toLocaleString('en-IN')} — ${t.category}</p>
          <span class="feed-time">${t.date} via ${t.source}</span>
        </div>
      </div>
    `).join('');
  }

  // Bind CTA clicks
  document.querySelector('.btn-view-gst-mismatch').onclick = () => { window.location.hash = 'insights'; };
  document.querySelector('.btn-view-missing-docs').onclick = () => { window.location.hash = 'documents'; };
  document.querySelector('.btn-view-gst-filing').onclick = () => { window.location.hash = 'gst'; };
  
  renderOverviewCharts();
  initIcons();
}

// Screen 2: Client Management CRM
function renderClients(filterType = 'all', searchQuery = '') {
  const container = document.getElementById('clients-list-container');
  const query = searchQuery.toLowerCase();

  let filtered = globalClientsList.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(query) || 
                          c.gstin.toLowerCase().includes(query) || 
                          c.owner.toLowerCase().includes(query);
    
    if (filterType === 'all') return matchesSearch;
    if (filterType === 'needs-review') return matchesSearch && c.filedStatus !== 'Ready';
    if (filterType === 'filed') return matchesSearch && c.filedStatus === 'Ready';
    return matchesSearch;
  });

  if (currentClientsViewMode === 'table') {
    container.innerHTML = `
      <div class="card overflow-x">
        <table class="data-table">
          <thead>
            <tr>
              <th>Business Name</th>
              <th>GSTIN</th>
              <th>Owner / WhatsApp</th>
              <th>Active Plan</th>
              <th>Last Activity</th>
              <th class="text-right">Health</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0 ? `
              <tr><td colspan="7" class="text-secondary" style="text-align:center;">No clients found matching the criteria.</td></tr>
            ` : filtered.map(c => `
              <tr data-client-id="${c.id}" class="client-row-link">
                <td>
                  <div class="client-meta-wrap">
                    <span class="client-name-cell">${c.name}</span>
                    <span class="client-gstin-cell">${c.plan}</span>
                  </div>
                </td>
                <td><code>${c.gstin}</code></td>
                <td>
                  <div class="client-meta-wrap">
                    <span>${c.owner}</span>
                    <span class="client-gstin-cell">${c.phone}</span>
                  </div>
                </td>
                <td>${c.plan}</td>
                <td>${c.lastActivity}</td>
                <td class="text-right font-semibold ${c.health > 80 ? 'text-success' : c.health > 50 ? 'text-warning' : 'text-danger'}">${c.health}%</td>
                <td>
                  <span class="badge ${c.filedStatus === 'Ready' ? 'badge-success' : c.filedStatus === 'Review Required' ? 'badge-warning' : 'badge-error'}">
                    ${c.filedStatus}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="clients-grid">
        ${filtered.length === 0 ? `
          <p class="text-secondary">No clients found matching criteria.</p>
        ` : filtered.map(c => `
          <div class="card client-card-crm" data-client-id="${c.id}">
            <div class="client-card-header">
              <div>
                <h3 class="client-card-name">${c.name}</h3>
                <span class="client-gstin-cell">GSTIN: ${c.gstin}</span>
              </div>
              <span class="badge ${c.filedStatus === 'Ready' ? 'badge-success' : c.filedStatus === 'Review Required' ? 'badge-warning' : 'badge-error'}">
                ${c.filedStatus}
              </span>
            </div>
            <div class="client-card-details">
              <div class="client-detail-row">
                <span class="client-detail-label">Owner</span>
                <span class="client-detail-value">${c.owner}</span>
              </div>
              <div class="client-detail-row">
                <span class="client-detail-label">WhatsApp</span>
                <span class="client-detail-value">${c.phone}</span>
              </div>
              <div class="client-detail-row">
                <span class="client-detail-label">Health Score</span>
                <strong class="${c.health > 80 ? 'text-success' : c.health > 50 ? 'text-warning' : 'text-danger'}">${c.health}%</strong>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Bind workspace clicks
  document.querySelectorAll('.client-row-link, .client-card-crm').forEach(el => {
    el.onclick = () => {
      const cid = el.getAttribute('data-client-id');
      window.location.hash = `client/${cid}`;
    };
  });
  
  initIcons();
}

// Screen 3: Client Workspace (360)
async function renderClientWorkspace(clientId) {
  const clientObj = globalClientsList.find(c => c.id === clientId);
  if (!clientObj) return;

  // Set workspace headers
  document.getElementById('workspace-client-name').textContent = clientObj.name;
  document.getElementById('workspace-client-gstin').textContent = `GSTIN: ${clientObj.gstin}`;
  document.getElementById('workspace-client-plan').textContent = `Plan: ${clientObj.plan}`;

  // Fetch client transactions from real Express API
  const caSession = getCASession();
  if (!caSession) return;

  let apiTransactions = [];
  try {
    const res = await fetch(`/api/ca/clients/${clientId}/transactions`, {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      apiTransactions = data.transactions || [];
    }
  } catch (err) {
    console.error('Failed to query client transactions API:', err);
  }

  // Use real API data — fallback to filtered global list if API returned nothing
  const cTx = apiTransactions.length > 0 ? apiTransactions.map(t => ({
    id: t.id,
    clientId: t.client_id,
    clientName: escapeHtml(clientObj.name),
    date: escapeHtml(t.date),
    type: t.category === 'sales' ? 'Sale' : 'Expense',
    source: escapeHtml(({ 'whatsapp_text': 'WhatsApp', 'whatsapp_image': 'WhatsApp Image', 'whatsapp_pdf': 'WhatsApp PDF', 'manual': 'Manual' })[t.source] || t.source),
    category: escapeHtml(t.description || t.category),
    gstRate: t.gst_rate ? `${t.gst_rate}%` : '0%',
    gst_rate: t.gst_rate,
    amount: Number(t.amount),
    taxAmount: Number(t.tax_amount || 0),
    status: getTransactionStatusLabel(t),
    reviewReason: t.review_reason || null,
  })) : globalTransactions.filter(t => t.clientId === clientId);
  
  // Calculate Workspace KPIs
  let salesVal = 0;
  let expenseVal = 0;
  cTx.forEach(t => {
    const amt = Math.abs(t.amount);
    if (t.type === 'Sale' || t.category === 'sales') {
      salesVal += amt;
    } else {
      expenseVal += amt;
    }
  });

  const gstDueVal = Math.max(0, (salesVal - expenseVal) * 0.18);
  const itcVal = expenseVal * 0.18;

  document.getElementById('ws-kpi-sales').textContent = `₹${salesVal.toLocaleString('en-IN')}`;
  document.getElementById('ws-kpi-expenses').textContent = `₹${expenseVal.toLocaleString('en-IN')}`;
  document.getElementById('ws-kpi-gst-payable').textContent = `₹${gstDueVal.toLocaleString('en-IN')}`;
  document.getElementById('ws-kpi-itc').textContent = `₹${itcVal.toLocaleString('en-IN')}`;

  // Setup sub-tabs
  const tabLinks = document.querySelectorAll('[data-ws-tab]');
  const panels = document.querySelectorAll('.ws-tab-panel');
  const activateWorkspaceTab = (btn) => {
    tabLinks.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
      b.setAttribute('tabindex', '-1');
    });
    panels.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    btn.removeAttribute('tabindex');
    const activeTab = btn.getAttribute('data-ws-tab');
    document.getElementById(`ws-panel-${activeTab}`).classList.add('active');
    renderWorkspaceTabPanel(activeTab, clientId, cTx);
  };
  
  tabLinks.forEach((btn, index) => {
    btn.setAttribute('tabindex', index === 0 ? '0' : '-1');
    btn.onclick = () => {
      activateWorkspaceTab(btn);
    };
    btn.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = Array.from(tabLinks).indexOf(btn);
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabLinks.length;
      if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabLinks.length) % tabLinks.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabLinks.length - 1;
      const nextTab = tabLinks[nextIndex];
      nextTab.focus();
      activateWorkspaceTab(nextTab);
    };
  });

  // WhatsApp owner action
  document.getElementById('btn-whatsapp-owner-direct').onclick = () => {
    showToast(`Opening WhatsApp chat with ${clientObj.owner}`);
    window.open(`https://wa.me/${clientObj.phone.replace(/[^0-9]/g, '')}`, '_blank');
  };

  // Export actions
  document.getElementById('btn-workspace-export-tally').onclick = () => {
    downloadClientFile(clientId, 'xml', cTx);
  };

  // Render workspace overview
  renderWorkspaceTabPanel('overview', clientId, cTx);
}

function renderWorkspaceTabPanel(tabName, clientId, cTx) {
  initIcons();
  
  const clientObj = globalClientsList.find(c => c.id === clientId);

  switch (tabName) {
    case 'overview':
      renderClientWorkspaceGstChart(clientId, cTx);
      const pendingContainer = document.getElementById('ws-overview-pending-transactions');
      const pTx = cTx.filter(t => t.status === 'Review Required');

      if (pTx.length === 0) {
        pendingContainer.innerHTML = '<p class="text-secondary">All transactions verified!</p>';
      } else {
        pendingContainer.innerHTML = pTx.map(t => `
          <div class="action-item border-warning">
            <div class="action-details">
              <span class="action-title">${t.category || 'Expense Ledger'} | ₹${t.amount.toLocaleString('en-IN')}</span>
              <span class="action-desc">Logged on ${t.date || 'Today'} via ${t.source || 'WhatsApp'}</span>
            </div>
            <button class="btn btn-sm btn-primary btn-approve-ws-tx" data-tx-id="${t.id}">Approve</button>
          </div>
        `).join('');

        document.querySelectorAll('.btn-approve-ws-tx').forEach(btn => {
          btn.onclick = () => {
            const tid = btn.getAttribute('data-tx-id');
            const target = globalTransactions.find(t => t.id === tid);
            if (target) {
              target.status = 'Verified';
              logFrontendAction('TRANSACTION_APPROVED', `Approved transaction ${target.category || 'Ledger Item'} worth ₹${Math.abs(target.amount).toLocaleString('en-IN')} for client ${target.clientName || 'Workspace Client'}`, clientId);
            }
            showToast('Transaction approved!');
            renderClientWorkspace(clientId);
          };
        });
      }

      // WhatsApp Feed
      const cDocs = globalDocuments.filter(d => d.clientId === clientId);
      document.getElementById('ws-overview-whatsapp-feed').innerHTML = cDocs.map(d => `
        <div class="feed-item">
          <div class="feed-marker bg-success"></div>
          <div class="feed-content">
            <p class="feed-text"><strong>${d.name}</strong> received via WhatsApp.</p>
            <span class="feed-time">${d.received} &bull; Size: ${d.size}</span>
          </div>
        </div>
      `).join('');
      break;

    case 'transactions':
      const txBody = document.querySelector('#ws-transactions-table tbody');
      txBody.innerHTML = cTx.map(t => `
        <tr>
          <td>${t.date}</td>
          <td><span class="badge ${t.type === 'Sale' || t.category === 'sales' ? 'badge-success' : 'badge-secondary'}">${t.type || t.category}</span></td>
          <td>${t.category}</td>
          <td>${t.gstRate || t.gst_rate + '%'}</td>
          <td><strong>₹${t.amount.toLocaleString('en-IN')}</strong></td>
          <td><span class="badge badge-accent">${t.source}</span></td>
          <td>
            <span class="badge ${t.status === 'Verified' ? 'badge-success' : t.status === 'Review Required' ? 'badge-warning' : 'badge-accent'}">
              ${t.status}
            </span>
          </td>
        </tr>
      `).join('');
      break;

    case 'documents':
      const docBody = document.querySelector('#ws-docs-table tbody');
      const clientDocsList = globalDocuments.filter(d => d.clientId === clientId);
      docBody.innerHTML = clientDocsList.map(d => `
        <tr class="doc-row-ws" data-doc-id="${d.id}">
          <td><strong>${d.name}</strong></td>
          <td>${d.received}</td>
          <td><span class="badge badge-secondary">${d.folder}</span></td>
          <td>${d.size}</td>
        </tr>
      `).join('');
      
      document.querySelectorAll('.doc-row-ws').forEach(row => {
        row.onclick = () => {
          selectedDocId = row.getAttribute('data-doc-id');
          window.location.hash = 'documents';
        };
      });
      break;

    case 'gst':
      document.querySelector('.gst-recon-results').innerHTML = `
        <div class="action-list">
          <div class="action-item ${clientObj.filedStatus === 'Ready' ? 'border-success' : 'border-error'}">
            <div class="action-details">
              <span class="action-title">GSTR-2B Automated Match Progress</span>
              <span class="action-desc">${clientObj.filedStatus === 'Ready' ? 'All invoices match exactly.' : 'Mismatches detected in purchase register files.'}</span>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="showToast('Re-running matching algorithms...')">Re-Scan</button>
          </div>
        </div>
      `;
      break;

    case 'reconciliation':
      renderWorkspaceReconciliation(clientId);
      break;

    case 'reports':
      // Bind Workspace report triggers
      document.querySelector('.btn-ws-dl-pl').onclick = () => {
        const caSession = getCASession();
        if (!caSession) return;
        showToast('Generating P&L Statement PDF...');
        openAuthenticatedPdf(`/api/ca/reports/pdf?clientId=${clientId}&reportType=pl`);
      };
      document.querySelector('.btn-ws-dl-bs').onclick = () => {
        const caSession = getCASession();
        if (!caSession) return;
        showToast('Generating GST Return Summary PDF...');
        openAuthenticatedPdf(`/api/ca/reports/pdf?clientId=${clientId}&reportType=gst`);
      };
      document.querySelector('.btn-ws-dl-xlsx').onclick = () => {
        showToast('Downloading Ledger XLSX... (Coming Soon)');
      };
      break;

    case 'exports':
      document.querySelector('.btn-ws-export-tally-xml').onclick = () => {
        downloadClientFile(clientId, 'xml', cTx);
      };
      break;

    case 'audit':
      initAuditChatTab(clientId, cTx);
      break;
  }
}

function getTransactionStatusLabel(t) {
  if (t.status === 'needs_review') return 'Review Required';
  if (t.status === 'rejected') return 'Rejected';
  if (t.status === 'draft') return 'Draft';
  if (t.status === 'confirmed') return 'Verified';
  return t.confidence === 'high' ? 'Verified' : (t.confidence === 'medium' ? 'Auto-Categorized' : 'Review Required');
}

async function renderWorkspaceReconciliation(clientId) {
  const container = document.getElementById('ws-recon-summary');
  if (!container) return;

  container.innerHTML = '<p class="text-secondary">Loading reconciliation results...</p>';

  try {
    const res = await fetch(`/api/ca/clients/${clientId}/reconciliation`, {
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      throw new Error(`Reconciliation request failed with ${res.status}`);
    }

    const data = await res.json();
    const recon = data.reconciliation || {};
    const unmatchedBankLines = recon.unmatchedBankLines || [];
    const unmatchedLedgerEntries = recon.unmatchedLedgerEntries || [];
    const matchRate = recon.totalBankLines
      ? Math.round((Number(recon.matchedBankLines || 0) / Number(recon.totalBankLines)) * 100)
      : 0;

    container.innerHTML = `
      <div class="kpi-grid mb-24">
        <div class="kpi-card">
          <span class="kpi-label">Bank Lines</span>
          <span class="kpi-value">${Number(recon.totalBankLines || 0).toLocaleString('en-IN')}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Matched</span>
          <span class="kpi-value">${Number(recon.matchedBankLines || 0).toLocaleString('en-IN')}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Match Rate</span>
          <span class="kpi-value">${matchRate}%</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Needs Review</span>
          <span class="kpi-value">${(unmatchedBankLines.length + unmatchedLedgerEntries.length).toLocaleString('en-IN')}</span>
        </div>
      </div>
      <div class="dashboard-split">
        <div class="split-left">
          <h4 class="mb-16">Unmatched Bank Lines</h4>
          ${renderReconciliationTable(unmatchedBankLines, 'No unmatched bank statement lines.')}
        </div>
        <div class="split-right">
          <h4 class="mb-16">Unmatched Ledger Entries</h4>
          ${renderReconciliationTable(unmatchedLedgerEntries, 'No unmatched ledger entries.')}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load reconciliation results:', err);
    container.innerHTML = '<p class="text-secondary">Unable to load reconciliation results right now.</p>';
  }
}

function renderReconciliationTable(rows, emptyText) {
  if (!rows.length) {
    return `<p class="text-secondary">${emptyText}</p>`;
  }

  return `
    <div class="overflow-x">
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Category</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${escapeHtml(row.date || '-')}</td>
              <td>${escapeHtml(row.description || row.raw_text || '-')}</td>
              <td><span class="badge badge-secondary">${escapeHtml(row.category || '-')}</span></td>
              <td><strong>Rs ${Number(row.amount || 0).toLocaleString('en-IN')}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Screen 4: Transactions Center
function renderTransactions() {
  const tbody = document.getElementById('global-transactions-table-body');
  const searchInput = document.getElementById('transactions-global-search');
  const clientFilter = document.getElementById('tx-filter-client');
  const channelFilter = document.getElementById('tx-filter-channel');

  // Populate client filter dropdown options
  clientFilter.innerHTML = '<option value="all">All Clients</option>' + 
    globalClientsList.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  function filterAndRender() {
    const query = searchInput.value.toLowerCase();
    const clientVal = clientFilter.value;
    const channelVal = channelFilter.value;

    let filtered = globalTransactions.filter(t => {
      const matchesSearch = t.clientName.toLowerCase().includes(query) || 
                            t.category.toLowerCase().includes(query) || 
                            t.amount.toString().includes(query);
      const matchesClient = clientVal === 'all' || t.clientId === clientVal;
      const matchesChannel = channelVal === 'all' || t.source.toLowerCase().includes(channelVal);
      return matchesSearch && matchesClient && matchesChannel;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center;padding:48px 24px;">
            <div class="empty-state" style="padding:0;">
              <i data-lucide="receipt" style="width:40px;height:40px;color:var(--text-secondary);margin-bottom:12px;"></i>
              <p class="text-secondary">${globalTransactions.length === 0 ? 'No transactions have been logged yet. Clients can send invoices via WhatsApp to start.' : 'No transactions match the current filters.'}</p>
            </div>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = filtered.map(t => `
        <tr>
          <td><input type="checkbox" class="tx-checkbox" data-tx-id="${t.id}"></td>
          <td>${t.date}</td>
          <td><strong>${t.clientName}</strong></td>
          <td><span class="badge ${t.type === 'Sale' ? 'badge-success' : 'badge-secondary'}">${t.type}</span></td>
          <td><span class="badge badge-accent">${t.source}</span></td>
          <td>${t.category}</td>
          <td>${t.gstRate}</td>
          <td><strong>₹${Math.abs(t.amount).toLocaleString('en-IN')}</strong></td>
          <td>
            <span class="badge ${t.status === 'Verified' ? 'badge-success' : t.status === 'Review Required' ? 'badge-warning' : 'badge-accent'}">
              ${t.status}
            </span>
          </td>
        </tr>
      `).join('');
    }
    
    initIcons();
  }

  searchInput.oninput = filterAndRender;
  clientFilter.onchange = filterAndRender;
  channelFilter.onchange = filterAndRender;

  document.getElementById('select-all-transactions').onchange = (e) => {
    document.querySelectorAll('.tx-checkbox').forEach(box => box.checked = e.target.checked);
  };

  document.getElementById('btn-bulk-approve-transactions').onclick = () => {
    const selected = document.querySelectorAll('.tx-checkbox:checked');
    if (selected.length === 0) {
      showToast('Select one or more transactions to approve.');
      return;
    }
    selected.forEach(box => {
      const tid = box.getAttribute('data-tx-id');
      const match = globalTransactions.find(t => t.id === tid);
      if (match) {
        match.status = 'Verified';
        logFrontendAction('TRANSACTION_APPROVED', `Approved transaction ${match.category || 'Ledger Item'} worth ₹${Math.abs(match.amount).toLocaleString('en-IN')} for client ${match.clientName || 'Workspace Client'}`, match.clientId);
      }
    });
    showToast(`Approved ${selected.length} transactions!`);
    filterAndRender();
  };

  document.getElementById('btn-export-transactions').onclick = () => {
    showToast('CSV ledger exported!');
  };

  filterAndRender();
}

// Screen 5: Document Center
function renderDocuments() {
  const tbody = document.getElementById('global-documents-table-body');
  const searchInput = document.getElementById('doc-global-search');
  const folderChips = document.querySelectorAll('.doc-folder-chip');
  
  let currentFolder = 'all';

  function filterAndRender() {
    const query = searchInput.value.toLowerCase();
    let filtered = globalDocuments.filter(d => {
      const matchesSearch = d.name.toLowerCase().includes(query) || d.clientName.toLowerCase().includes(query);
      const matchesFolder = currentFolder === 'all' || d.folder === currentFolder;
      return matchesSearch && matchesFolder;
    });

    tbody.innerHTML = filtered.map(d => `
      <tr class="document-list-row ${selectedDocId === d.id ? 'active-row' : ''}" data-doc-id="${d.id}">
        <td><strong>${d.name}</strong></td>
        <td>${d.clientName}</td>
        <td><span class="badge badge-secondary">${d.folder}</span></td>
        <td>${d.received}</td>
      </tr>
    `).join('');

    document.querySelectorAll('.document-list-row').forEach(row => {
      row.onclick = () => {
        selectedDocId = row.getAttribute('data-doc-id');
        document.querySelectorAll('.document-list-row').forEach(r => r.classList.remove('active-row'));
        row.classList.add('active-row');
        renderDocPreview(selectedDocId);
      };
    });
  }

  folderChips.forEach(chip => {
    chip.onclick = () => {
      folderChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFolder = chip.getAttribute('data-doc-folder');
      filterAndRender();
    };
  });

  searchInput.oninput = filterAndRender;

  if (selectedDocId) {
    renderDocPreview(selectedDocId);
  }

  filterAndRender();
}

function renderDocPreview(docId) {
  const doc = globalDocuments.find(d => d.id === docId);
  if (!doc) return;

  const previewPanel = document.getElementById('doc-preview-panel');
  previewPanel.innerHTML = `
    <div class="preview-content-view" id="doc-preview-content">
      <div class="preview-header-meta">
        <h4 id="preview-filename">${doc.name}</h4>
        <span class="badge badge-success" id="preview-status">${doc.status}</span>
      </div>
      
      <div class="preview-ocr-fields mt-24">
        <div class="form-group">
          <label>Client</label>
          <input type="text" id="preview-field-client" value="${doc.clientName}" class="form-input" disabled>
        </div>
        <div class="form-group mt-16">
          <label>Vendor Name</label>
          <input type="text" id="preview-field-vendor" value="${doc.vendor}" class="form-input">
        </div>
        <div class="form-group mt-16">
          <label>Vendor GSTIN</label>
          <input type="text" id="preview-field-gstin" value="${doc.gstin}" class="form-input">
        </div>
        <div class="form-grid-2 mt-16">
          <div class="form-group">
            <label>Subtotal</label>
            <input type="text" id="preview-field-subtotal" value="${doc.subtotal}" class="form-input">
          </div>
          <div class="form-group">
            <label>GST Amount</label>
            <input type="text" id="preview-field-gst" value="${doc.gst}" class="form-input">
          </div>
        </div>
        <div class="form-group mt-16">
          <label>Total Amount</label>
          <input type="text" id="preview-field-total" value="${doc.total}" class="form-input input-highlight">
        </div>
      </div>

      <div class="preview-actions-panel mt-24">
        <button class="btn btn-primary btn-block" id="btn-preview-accept-ledger">Approve & Log Ledger</button>
        <button class="btn btn-outline-success btn-block mt-8" id="btn-preview-ask-whatsapp">Ask Client on WhatsApp</button>
      </div>
    </div>
  `;

  document.getElementById('btn-preview-accept-ledger').onclick = () => {
    const val = parseFloat(doc.total.replace(/[^0-9.-]/g, ''));
    globalTransactions.unshift({
      id: 'tx-' + Math.floor(Math.random() * 1000),
      clientId: doc.clientId,
      clientName: doc.clientName,
      date: new Date().toISOString().split('T')[0],
      type: 'Expense',
      source: doc.folder === 'voice' ? 'Voice Note' : 'WhatsApp',
      category: 'Office Expenses',
      gstRate: '18%',
      amount: -val,
      status: 'Verified'
    });

    logFrontendAction('TRANSACTION_CREATED', `Logged expense transaction of ₹${val.toLocaleString('en-IN')} from document ${doc.name} for client ${doc.clientName}`, doc.clientId);

    globalDocuments = globalDocuments.filter(d => d.id !== docId);
    selectedDocId = null;
    showToast('Transaction logged!');
    renderDocuments();
  };

  document.getElementById('btn-preview-ask-whatsapp').onclick = () => {
    const client = globalClientsList.find(c => c.id === doc.clientId);
    if (client) {
      window.open(`https://wa.me/${client.phone.replace(/[^0-9]/g, '')}?text=Hi ${client.owner}, checking invoice details for ${doc.name}.`, '_blank');
    }
  };

  initIcons();
}

// Screen 6: GST Center
async function renderGSTCenter() {
  const tbody = document.getElementById('gst-center-table-body');
  const picker = document.getElementById('gst-period-picker');
  
  if (!picker.value) {
    picker.value = new Date().toISOString().substring(0, 7);
  }

  // Load live consolidated reports from Express API
  const caSession = getCASession();
  if (!caSession) return;

  let report = { totalOutwardTaxableValue: 0, totalInwardTaxAmount: 0, netGstPayable: 0, clientBreakdown: [], incomplete: false, warnings: [] };
  try {
    const res = await fetch(`/api/ca/reports/gst?period=${picker.value}`, {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      report = await res.json();
    }
  } catch (err) {
    console.error('Failed GSTR report compilation:', err);
  }

  // Render top metrics
  document.getElementById('gst-total-liability-metric').textContent = `₹${report.totalOutwardTaxableValue.toLocaleString('en-IN')}`;
  document.getElementById('gst-total-itc-metric').textContent = `₹${report.totalInwardTaxAmount.toLocaleString('en-IN')}`;
  
  const readyCount = globalClientsList.filter(c => c.filedStatus === 'Ready').length;
  document.getElementById('gst-ready-to-file-metric').textContent = readyCount;
  document.getElementById('gst-needs-review-metric').textContent = globalClientsList.length - readyCount;

  if (report.incomplete && report.warnings?.length) {
    showToast('GSTR report compiled with review-needed client calculations.', 'warning');
  }

  // Render table body
  if (report.clientBreakdown.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 30px;">
          No client filing records available for this month.
        </td>
      </tr>`;
  } else {
    tbody.innerHTML = report.clientBreakdown.map(client => {
      const netLiability = Math.max(0, client.outwardTax - client.inwardTax);
      const cObj = globalClientsList.find(c => c.id === client.clientId) || { filedStatus: 'Review Required' };
      const filedStatus = client.calculationStatus === 'error' ? 'Review Required' : cObj.filedStatus;

      return `
        <tr>
          <td><strong>${escapeHtml(client.businessName || client.clientName || 'Unknown Client')}</strong><br><code style="font-size:12px;color:var(--text-secondary);">${escapeHtml(client.gstin || 'N/A')}</code></td>
          <td>₹${client.outwardTaxable.toLocaleString('en-IN')}</td>
          <td>₹${client.inwardTaxable.toLocaleString('en-IN')}</td>
          <td><strong>₹${netLiability.toLocaleString('en-IN')}</strong></td>
          <td>
            <span class="badge ${filedStatus === 'Ready' ? 'badge-success' : filedStatus === 'Filed' ? 'badge-success' : 'badge-warning'}">
              ${escapeHtml(filedStatus)}
            </span>
          </td>
          <td>
            <button class="btn btn-sm ${filedStatus === 'Ready' ? 'btn-primary' : 'btn-secondary'} btn-gst-file-action" data-client-id="${client.clientId}">
              ${filedStatus === 'Ready' ? 'File GSTR-1' : 'Verify'}
            </button>
          </td>
        </tr>
      `;
    }).join('');

    document.querySelectorAll('.btn-gst-file-action').forEach(btn => {
      btn.onclick = () => {
        const cid = btn.getAttribute('data-client-id');
        const c = globalClientsList.find(cl => cl.id === cid);
        if (c.filedStatus === 'Ready') {
          c.filedStatus = 'Filed';
          showToast(`GSTR-1 returns filed for ${c.name}!`);
          renderGSTCenter();
        } else {
          window.location.hash = 'insights';
        }
      };
    });
  }

  picker.onchange = renderGSTCenter;
  initIcons();
}

// Screen 7: AI Insights Dashboard
function renderAIInsights(filterSeverity = 'all') {
  const container = document.getElementById('ai-insights-cards-container');
  
  let filtered = globalInsights.filter(ins => {
    if (filterSeverity === 'all') return true;
    return ins.severity === filterSeverity;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-secondary">No risk alerts detected matching this filter.</p>';
    return;
  }

  container.innerHTML = filtered.map(ins => `
    <div class="card insight-card severity-${ins.severity}">
      <div class="insight-header">
        <span class="badge ${ins.severity === 'high' ? 'badge-error' : ins.severity === 'medium' ? 'badge-warning' : 'badge-info'} insight-severity-label">
          ${ins.severity} Severity
        </span>
        <strong class="text-primary">${ins.clientName}</strong>
      </div>
      <h3 class="mt-8" style="font-size: 16px; font-weight: 600;">${ins.title}</h3>
      <p class="card-subtitle mt-8">${ins.desc}</p>
      <div class="insight-rec-box">
        <span class="insight-rec-text"><strong>AI Recommendation:</strong> ${ins.suggestion}</span>
        <button class="btn btn-sm btn-primary btn-resolve-insight" data-insight-id="${ins.id}">Resolve</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.btn-resolve-insight').forEach(btn => {
    btn.onclick = () => {
      const iid = btn.getAttribute('data-insight-id');
      globalInsights = globalInsights.filter(ins => ins.id !== iid);
      showToast('Insight resolved!');
      renderAIInsights(filterSeverity);
    };
  });

  // Re-bind insight severity clicks
  const tabs = document.querySelectorAll('#view-insights .filter-tab');
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderAIInsights(tab.getAttribute('data-severity'));
    };
  });

  initIcons();
}

// Screen 8: Export Center
function renderExports() {
  const tallySelect = document.getElementById('export-tally-client');
  const csvSelect = document.getElementById('export-csv-client');

  const optHtml = globalClientsList.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.business_name || 'Unnamed Client')}</option>`).join('');
  tallySelect.innerHTML = optHtml;
  csvSelect.innerHTML = optHtml;

  document.getElementById('btn-action-export-tally').onclick = () => {
    const cid = tallySelect.value;
    downloadClientFile(cid, 'xml');
  };

  document.getElementById('btn-action-export-csv').onclick = () => {
    const cid = csvSelect.value;
    downloadClientFile(cid, 'csv');
  };

  document.getElementById('btn-action-export-gst').onclick = () => {
    showToast('Compiling GSTR reports...');
    setTimeout(() => { showToast('Excel sheet downloaded!'); }, 1000);
  };

  document.getElementById('btn-action-export-pdf').onclick = () => {
    showToast('Generating P&L and Balance Sheet PDF...');
    setTimeout(() => { showToast('Financial Statement downloaded!'); }, 1200);
  };
}

// Screen 9: Billing
function renderBilling() {
  const clientCount = globalClientsList.length;
  document.getElementById('billing-subtitle-count').textContent = `Currently managing ${clientCount} clients on TaxBot Partner API.`;
  
  let unitRate = 149;
  if (clientCount >= 50) unitRate = 99;
  else if (clientCount >= 10) unitRate = 119;

  document.getElementById('billing-marginal-rate-display').textContent = `₹${(clientCount * unitRate).toLocaleString('en-IN')} / month`;
  document.getElementById('billing-limit-label').textContent = `Client Limit (${clientCount} / 200)`;
  
  const pct = (clientCount / 200) * 100;
  document.getElementById('billing-limit-pct').textContent = `${Math.round(pct)}% Used`;
  document.getElementById('billing-progress-fill').style.width = `${pct}%`;

  // Highlight active tier
  document.getElementById('tier-1-card').classList.remove('active');
  document.getElementById('tier-2-card').classList.remove('active');
  document.getElementById('tier-3-card').classList.remove('active');

  if (clientCount >= 50) {
    document.getElementById('tier-3-card').classList.add('active');
  } else if (clientCount >= 10) {
    document.getElementById('tier-2-card').classList.add('active');
  } else {
    document.getElementById('tier-1-card').classList.add('active');
  }
}

// Screen 10: Settings
function renderSettings() {
  const settingsLinks = document.querySelectorAll('.settings-tab-link');
  const settingsPanels = document.querySelectorAll('.settings-panel');

  settingsLinks.forEach(link => {
    link.onclick = () => {
      settingsLinks.forEach(l => l.classList.remove('active'));
      settingsPanels.forEach(p => p.classList.remove('active'));
      
      link.classList.add('active');
      const targetPanel = link.getAttribute('data-settings-tab');
      document.getElementById(`settings-panel-${targetPanel}`).classList.add('active');
      
      if (targetPanel === 'users') {
        renderSettingsUsers();
      } else if (targetPanel === 'audit-trail') {
        fetchAndRenderAuditTrail();
      }
    };
  });
}

function renderSettingsUsers() {
  const container = document.querySelector('#settings-panel-users .user-list');
  const session = getCASession();
  
  container.innerHTML = `
    <div class="user-item-row">
      <div class="user-item-info">
        <div class="firm-avatar">SS</div>
        <div class="user-item-text">
          <strong>${escapeHtml(session ? session.name : 'Sandeep Sharma')}</strong>
          <span class="firm-role-text">FCA Principal &amp; Owner</span>
        </div>
      </div>
      <span class="badge badge-accent">Admin</span>
    </div>
    <div class="user-item-row mt-8">
      <div class="user-item-info">
        <div class="firm-avatar" style="background-color: var(--primary);">RG</div>
        <div class="user-item-text">
          <strong>Rohan Gupta</strong>
          <span class="firm-role-text">Assistant Auditor</span>
        </div>
      </div>
      <span class="badge badge-secondary">Edit Access</span>
    </div>
  `;
}

// --------------------------------------------------------------------------
// 6. Tally XML & CSV Compilation Helper
// --------------------------------------------------------------------------
function downloadClientFile(clientId, format, preloadedTx = null) {
  const period = new Date().toISOString().substring(0, 7);
  const clientObj = globalClientsList.find(c => c.id === clientId);
  if (!clientObj) return;

  const txList = preloadedTx || globalTransactions.filter(t => t.clientId === clientId);
  
  let fileContent = '';
  let mimeType = '';
  let fileName = safeExportFilename(`TaxBot_${clientObj.name || clientObj.business_name || 'Client'}_${period}`);

  if (format === 'csv') {
    mimeType = 'text/csv;charset=utf-8;';
    fileName += '.csv';
    
    const headers = ['Date', 'Type', 'Category', 'GST Rate', 'Amount', 'Source', 'Status'];
    const rows = txList.map(t => [
      csvCell(t.date),
      csvCell(t.type || 'Expense'),
      csvCell(t.category),
      t.gstRate,
      t.amount,
      csvCell(t.source),
      csvCell(t.status)
    ].join(','));
    fileContent = [headers.join(','), ...rows].join('\r\n');
  } else {
    // Tally XML
    mimeType = 'application/xml;charset=utf-8;';
    fileName += '.xml';

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>\n  <HEADER>\n    <TALLYREQUEST>Import Data</TALLYREQUEST>\n  </HEADER>\n  <BODY>\n    <IMPORTDATA>\n      <REQUESTDESC>\n        <REPORTNAME>Vouchers</REPORTNAME>\n      </REQUESTDESC>\n      <REQUESTDATA>\n`;

    txList.forEach(t => {
      const tallyDate = t.date.replace(/-/g, '');
      const amount = Math.abs(t.amount);
      const tax = amount * 0.18; // 18% tax calculation
      const total = amount + tax;
      const vchType = t.type === 'Sale' ? 'Sales' : 'Purchase';
      
      xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n          <VOUCHER VCHTYPE="${escapeXml(vchType)}" ACTION="Create">\n            <DATE>${escapeXml(tallyDate)}</DATE>\n            <VOUCHERTYPENAME>${escapeXml(vchType)}</VOUCHERTYPENAME>\n            <NARRATION>${escapeXml(`${t.category} recorded via TaxBot`)}</NARRATION>\n            <EFFECTIVEDATE>${escapeXml(tallyDate)}</EFFECTIVEDATE>\n`;
      xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${escapeXml(vchType === 'Sales' ? 'Sales Account' : 'Purchase Account')}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>${vchType === 'Sales' ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>\n              <AMOUNT>${amount.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
      xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>Cash/Bank Account</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>${vchType === 'Sales' ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>\n              <AMOUNT>-${total.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
      xml += `          </VOUCHER>\n        </TALLYMESSAGE>\n`;
    });

    xml += `      </REQUESTDATA>\n    </IMPORTDATA>\n  </BODY>\n</ENVELOPE>`;
    fileContent = xml;
  }

  // Download Trigger
  const blob = new Blob([fileContent], { type: mimeType });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Redirection complete. ${format.toUpperCase()} export downloaded!`);
  }
}

// --------------------------------------------------------------------------
// 7. Modals & Sidebars
// --------------------------------------------------------------------------
function initModals() {
  const addClientModal = document.getElementById('add-client-modal');
  const openTriggers = [
    document.getElementById('overview-add-client-btn'),
    document.getElementById('qa-add-client'),
    document.getElementById('btn-add-client-modal-trigger')
  ];
  
  const closeBtn = document.getElementById('btn-close-add-client');
  const cancelBtn = document.getElementById('btn-cancel-add-client');
  const form = document.getElementById('form-add-client');

  openTriggers.forEach(btn => {
    if (btn) btn.onclick = () => addClientModal.classList.remove('hidden');
  });

  function closeClientModal() {
    addClientModal.classList.add('hidden');
    form.reset();
  }

  closeBtn.onclick = closeClientModal;
  cancelBtn.onclick = closeClientModal;

  // Add Client Form Submission to live API
  form.onsubmit = async (e) => {
    e.preventDefault();
    const caSession = getCASession();
    if (!caSession) return;

    const ownerName = document.getElementById('new-client-owner').value;
    const phone = document.getElementById('new-client-phone').value;
    const businessName = document.getElementById('new-client-name').value;
    const gstin = document.getElementById('new-client-gstin').value;
    const plan = document.getElementById('new-client-plan').value;
    const gstRegistered = document.getElementById('new-client-gst-registered').value === 'true';

    try {
      const res = await fetch('/api/ca/clients', {
        method: 'POST',
        headers: {
          ...getAuthHeaders({ 'Content-Type': 'application/json' })
        },
        body: JSON.stringify({ name: ownerName, phone, businessName, gstin, plan, gstRegistered })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to link client');

      showToast('Client linked and authorisations established.');
      closeClientModal();
      
      // Refresh list
      await fetchClientsList();
      window.location.hash = 'clients';
    } catch (err) {
      showToast(err.message);
    }
  };

  // Sidebar toggle collapse
  const sidebar = document.getElementById('app-sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  toggleBtn.onclick = () => {
    sidebar.classList.toggle('collapsed');
  };

  // Mobile sidebar menu toggle handlers
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  
  if (mobileMenuToggle && sidebarBackdrop) {
    mobileMenuToggle.onclick = () => {
      sidebar.classList.add('drawer-open');
      sidebarBackdrop.classList.add('active');
    };
    
    sidebarBackdrop.onclick = () => {
      sidebar.classList.remove('drawer-open');
      sidebarBackdrop.classList.remove('active');
    };

    // Auto-close drawer when clicking links in mobile view
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        sidebar.classList.remove('drawer-open');
        sidebarBackdrop.classList.remove('active');
      });
    });
  }
}

// --------------------------------------------------------------------------
// 8. Interactive Toast & App Bindings
// --------------------------------------------------------------------------
function showToast(message) {
  const root = document.getElementById('toast-root');
  const toast = document.createElement('div');
  toast.className = 'toast';
  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', 'info');
  icon.style.width = '16px';
  icon.style.height = '16px';
  const label = document.createElement('span');
  label.textContent = String(message || '');
  toast.append(icon, label);
  root.appendChild(toast);
  initIcons();

  setTimeout(() => {
    toast.style.animation = 'toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse';
    setTimeout(() => { root.removeChild(toast); }, 300);
  }, 3000);
}

// Initialization bootstrap
document.addEventListener('DOMContentLoaded', () => {
  // Theme toggle initialization & check
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeToggleIcon = document.getElementById('theme-toggle-icon');
  const savedTheme = localStorage.getItem('taxbot_theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    if (themeToggleIcon) {
      themeToggleIcon.setAttribute('data-lucide', 'sun');
    }
  }

  if (themeToggleBtn) {
    themeToggleBtn.onclick = () => {
      const isDark = document.body.classList.toggle('dark-theme');
      localStorage.setItem('taxbot_theme', isDark ? 'dark' : 'light');
      if (themeToggleIcon) {
        themeToggleIcon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      }
      // Dynamically update active Chart.js colors
      updateChartsTheme();
    };
  }

  setupAuthHandlers();
  checkAuth();

  // Layout switcher list vs card
  const btnTable = document.getElementById('layout-toggle-table');
  const btnGrid = document.getElementById('layout-toggle-grid');
  
  if (btnTable && btnGrid) {
    btnTable.onclick = () => {
      btnTable.classList.add('active');
      btnGrid.classList.remove('active');
      currentClientsViewMode = 'table';
      renderClients();
    };

    btnGrid.onclick = () => {
      btnGrid.classList.add('active');
      btnTable.classList.remove('active');
      currentClientsViewMode = 'grid';
      renderClients();
    };
  }

  // Client search input
  const clientSearchInput = document.getElementById('client-search');
  if (clientSearchInput) {
    clientSearchInput.oninput = (e) => {
      const activeTab = document.querySelector('#view-clients .filter-tab.active');
      const filterVal = activeTab ? activeTab.getAttribute('data-filter') : 'all';
      renderClients(filterVal, e.target.value);
    };
  }

  // Client filter tabs
  const filterTabs = document.querySelectorAll('#view-clients .filter-tab');
  filterTabs.forEach(tab => {
    tab.onclick = () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderClients(tab.getAttribute('data-filter'), clientSearchInput ? clientSearchInput.value : '');
    };
  });

  // Client workspace back btn
  document.getElementById('btn-back-to-clients').onclick = () => {
    window.location.hash = 'clients';
  };

  // Quick Action binds
  document.getElementById('qa-upload-docs').onclick = () => { window.location.hash = 'documents'; };
  document.getElementById('qa-gen-report').onclick = () => { window.location.hash = 'exports'; };
  document.getElementById('qa-export-tally').onclick = () => { window.location.hash = 'exports'; };
});


// --------------------------------------------------------------------------
// Phase 7: Context-Aware AI Chat Auditor & Audit Trail Helpers
// --------------------------------------------------------------------------

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
    tbody.innerHTML = `<tr><td colspan="3" class="text-secondary" style="text-align:center; padding: 24px;">Please login to view audit trail.</td></tr>`;
    return;
  }

  tbody.innerHTML = `<tr><td colspan="3" class="text-secondary" style="text-align:center; padding: 24px;">
    <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
      <div class="spinner" style="width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--primary); border-radius: 50%;"></div>
      Loading audit trail...
    </div>
  </td></tr>`;

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
      tbody.innerHTML = `<tr><td colspan="3" class="text-secondary" style="text-align:center; padding: 24px;">No audit trail events found.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(log => {
      const dateStr = log.created_at ? new Date(log.created_at).toLocaleString('en-IN') : 'N/A';
      let actionBadgeClass = 'badge-secondary';
      if (log.action_type === 'LOGIN' || log.action_type === 'REGISTER') {
        actionBadgeClass = 'badge-success';
      } else if (log.action_type === 'TRANSACTION_APPROVED') {
        actionBadgeClass = 'badge-info';
      } else if (log.action_type === 'PDF_DOWNLOADED') {
        actionBadgeClass = 'badge-accent';
      } else if (log.action_type === 'AI_AUDIT_QUERY') {
        actionBadgeClass = 'badge-secondary';
      }

      return `
        <tr>
          <td style="white-space: nowrap; font-size: 13px; color: var(--text-secondary);">${dateStr}</td>
          <td><span class="badge ${actionBadgeClass}" style="text-transform: uppercase; font-size: 11px;">${escapeHtml(log.action_type)}</span></td>
          <td style="font-size: 13.5px; color: var(--text-primary); line-height: 1.4;">${escapeHtml(log.description)}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 24px; color: var(--text-error);">Error loading audit logs: ${escapeHtml(err.message)}</td></tr>`;
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
    <div class="chat-msg system-msg" style="align-self: flex-start; max-width: 80%; background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-12) var(--radius-12) var(--radius-12) 0; padding: var(--space-12) var(--space-16); box-shadow: var(--shadow-sm); animation: fadeIn 0.2s ease-out;">
      <div style="font-weight: 600; color: var(--primary); font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
        <i data-lucide="bot" style="width: 14px; height: 14px;"></i> AI Auditor
      </div>
      <p style="margin: 0; font-size: 14px; color: var(--text-primary);">
        Hello! I have loaded **${escapeHtml(clientName)}**'s transaction ledger (containing ${cTx.length} records). Ask me any auditing questions, such as:
      </p>
      <ul style="margin: var(--space-8) 0 0 var(--space-16); padding: 0; font-size: 13px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px; list-style-type: disc;">
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

    // Render User Message
    const userMsgHtml = `
      <div class="chat-msg user-msg" style="align-self: flex-end; max-width: 80%; background-color: var(--primary); color: white; border-radius: var(--radius-12) var(--radius-12) 0 var(--radius-12); padding: var(--space-12) var(--space-16); box-shadow: var(--shadow-sm); animation: fadeIn 0.2s ease-out;">
        <div style="font-weight: 600; font-size: 11px; margin-bottom: 4px; text-align: right; color: rgba(255, 255, 255, 0.8);">
          You
        </div>
        <div style="margin: 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;">${escapeHtml(message)}</div>
      </div>
    `;
    chatFeed.insertAdjacentHTML('beforeend', userMsgHtml);
    chatFeed.scrollTop = chatFeed.scrollHeight;

    // Render Loading Spinner
    const loadingId = 'bot-loading-' + Date.now();
    const loadingMsgHtml = `
      <div class="chat-msg system-msg" id="${loadingId}" style="align-self: flex-start; max-width: 80%; background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-12) var(--radius-12) var(--radius-12) 0; padding: var(--space-12) var(--space-16); box-shadow: var(--shadow-sm); display: flex; align-items: center; gap: 8px;">
        <div class="spinner" style="width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--primary); border-radius: 50%;"></div>
        <span style="font-size: 13px; color: var(--text-secondary);">Auditing ledger transactions...</span>
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

      // Render Bot response
      const botMsgHtml = `
        <div class="chat-msg system-msg" style="align-self: flex-start; max-width: 80%; background-color: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-12) var(--radius-12) var(--radius-12) 0; padding: var(--space-12) var(--space-16); box-shadow: var(--shadow-sm); animation: fadeIn 0.2s ease-out;">
          <div style="font-weight: 600; color: var(--primary); font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
            <i data-lucide="bot" style="width: 14px; height: 14px;"></i> AI Auditor
          </div>
          <div style="margin: 0; font-size: 14px; color: var(--text-primary); line-height: 1.5; word-break: break-word;">
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
        <div class="chat-msg system-msg" style="align-self: flex-start; max-width: 80%; background-color: var(--bg-card); border: 1px solid var(--border-error); border-radius: var(--radius-12) var(--radius-12) var(--radius-12) 0; padding: var(--space-12) var(--space-16); box-shadow: var(--shadow-sm); color: var(--text-error);">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; color: var(--error);">
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
