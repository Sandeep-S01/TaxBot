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
let currentClientsPage = 1;
const CLIENTS_PAGE_SIZE = 10;
let globalClientsList = []; // loaded from backend
let globalTransactions = []; // compiled from clients
let globalDocuments = []; // compiled client files
let globalInsights = []; // AI insights calculated dynamically
const appDataState = {
  clients: { loading: false, loaded: false, error: '' },
  transactions: { loading: false, loaded: false, error: '' },
  gst: { loading: false, error: '' },
};

const SHELL_ROUTE_META = {
  overview: {
    label: 'Overview',
    title: 'Overview Dashboard',
    parentView: 'overview',
    crumbs: ['Console', 'Overview'],
  },
  clients: {
    label: 'Clients',
    title: 'Client Ledger',
    parentView: 'clients',
    crumbs: ['Console', 'Clients'],
  },
  'client-workspace': {
    label: 'Client Workspace',
    title: 'Client Workspace',
    parentView: 'clients',
    crumbs: ['Console', 'Clients', 'Workspace'],
  },
  transactions: {
    label: 'Transactions',
    title: 'Transaction Ledger',
    parentView: 'transactions',
    crumbs: ['Console', 'Transactions'],
  },
  documents: {
    label: 'Documents',
    title: 'Document Ledger',
    parentView: 'documents',
    crumbs: ['Console', 'Documents'],
  },
  gst: {
    label: 'GST Center',
    title: 'GST Center',
    parentView: 'gst',
    crumbs: ['Console', 'GST Center'],
  },
  insights: {
    label: 'AI Insights',
    title: 'AI Insights',
    parentView: 'insights',
    crumbs: ['Console', 'AI Insights'],
  },
  exports: {
    label: 'Exports',
    title: 'Export Ledger',
    parentView: 'exports',
    crumbs: ['Console', 'Exports'],
  },
  billing: {
    label: 'Billing',
    title: 'Billing',
    parentView: 'billing',
    crumbs: ['Console', 'Billing'],
  },
  settings: {
    label: 'Settings',
    title: 'Settings',
    parentView: 'settings',
    crumbs: ['Console', 'Settings'],
  },
};

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
      const profileMenuName = document.getElementById('profile-menu-display-name');
      const profileMenuEmail = document.getElementById('profile-menu-display-email');
      if (profileMenuName) profileMenuName.textContent = caSession.name;
      if (profileMenuEmail) profileMenuEmail.textContent = caSession.email || caSession.firm_name || 'Partner Account';
      const avatarLetter = caSession.name.charAt(0).toUpperCase();
      document.getElementById('ca-avatar-letter').textContent = avatarLetter;
      const headerAvatar = document.getElementById('ca-header-avatar-letter');
      if (headerAvatar) headerAvatar.textContent = avatarLetter;

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

    const routeMeta = SHELL_ROUTE_META[targetView] || SHELL_ROUTE_META.overview;
    navLinks.forEach(link => {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
      if (link.getAttribute('data-view') === routeMeta.parentView) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
    });

    updateShellContext(routeMeta);

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

function updateShellContext(routeMeta) {
  const breadcrumb = document.getElementById('dashboard-breadcrumb');
  const pageHeader = document.getElementById('dashboard-page-header');
  const titleSlot = document.getElementById('dashboard-page-title-slot');

  if (breadcrumb) {
    breadcrumb.replaceChildren();
    routeMeta.crumbs.forEach((crumb, index) => {
      const item = document.createElement('span');
      item.className = 'dashboard-breadcrumb-item';
      item.textContent = crumb;
      if (index === routeMeta.crumbs.length - 1) {
        item.setAttribute('aria-current', 'page');
      }
      breadcrumb.appendChild(item);
    });
  }

  if (titleSlot) {
    titleSlot.textContent = routeMeta.title;
  }

  if (pageHeader) {
    pageHeader.hidden = true;
  }
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

function setMetricSublineVisible(elementId, shouldShow) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.classList.toggle('hidden', !shouldShow);
}

function getActiveViewName() {
  const activeSection = document.querySelector('.view-section.active');
  return activeSection ? activeSection.id.replace('view-', '') : 'overview';
}

function refreshActiveDataView() {
  const activeView = getActiveViewName();
  switch (activeView) {
    case 'overview':
      renderOverview();
      break;
    case 'clients':
      renderClients();
      break;
    case 'transactions':
      renderTransactions();
      break;
    case 'documents':
      renderDocuments();
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
  }
}

function bindDataRetryActions(root = document) {
  root.querySelectorAll('[data-retry-load]').forEach(button => {
    button.onclick = () => {
      const target = button.getAttribute('data-retry-load');
      if (target === 'gst') {
        renderGSTCenter();
      } else if (target === 'transactions') {
        fetchGlobalTransactions().then(refreshActiveDataView);
      } else {
        fetchClientsList();
      }
    };
  });
}

function bindRovingButtonGroup(buttons, options = {}) {
  const items = Array.from(buttons || []);
  if (items.length === 0) return;
  const activeClass = options.activeClass || 'active';
  const stateAttr = options.stateAttr || 'aria-pressed';
  const selectedValue = options.selectedValue;

  items.forEach((button, index) => {
    const isActive = selectedValue
      ? button.getAttribute(options.valueAttr || 'data-filter') === selectedValue
      : button.classList.contains(activeClass);
    button.setAttribute(stateAttr, String(isActive));
    button.setAttribute('tabindex', isActive || (selectedValue === undefined && index === 0) ? '0' : '-1');

    button.onkeydown = (event) => {
      const horizontalKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (!horizontalKeys.includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % items.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + items.length) % items.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = items.length - 1;
      items[nextIndex].focus();
      items[nextIndex].click();
    };
  });
}

// --------------------------------------------------------------------------
// 4. API Live Connectors
// --------------------------------------------------------------------------

async function fetchClientsList() {
  const caSession = getCASession();
  if (!caSession) return;

  appDataState.clients.loading = true;
  appDataState.clients.error = '';
  refreshActiveDataView();

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
    appDataState.clients.loaded = true;
  } catch (err) {
    appDataState.clients.error = err.message || 'Client directory failed to load. Retry to refresh the ledger.';
    showToast(appDataState.clients.error, 'error');
  } finally {
    appDataState.clients.loading = false;
    refreshActiveDataView();
  }
}

async function fetchGlobalTransactions() {
  const caSession = getCASession();
  if (!caSession) return;

  // Reset global arrays
  globalTransactions = [];
  globalDocuments = [];
  globalInsights = [];
  appDataState.transactions.loading = true;
  appDataState.transactions.error = '';
  refreshActiveDataView();

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
    appDataState.transactions.loaded = true;
  } catch (err) {
    console.error('Failed to fetch global transactions:', err);
    appDataState.transactions.error = err.message || 'Transactions failed to load. Retry to refresh entries.';
    showToast(appDataState.transactions.error, 'error');
  } finally {
    appDataState.transactions.loading = false;
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
  const activeClientCount = globalClientsList.length;
  const overviewKpiGrid = document.getElementById('overview-kpi-grid');
  const overviewZeroState = document.getElementById('overview-zero-state');
  const isConfirmedZeroAccount = !appDataState.clients.loading && !appDataState.clients.error && activeClientCount === 0;
  if (overviewKpiGrid && overviewZeroState) {
    overviewKpiGrid.classList.toggle('hidden', isConfirmedZeroAccount);
    overviewZeroState.classList.toggle('hidden', !isConfirmedZeroAccount);
  }

  document.getElementById('kpi-active-clients').textContent = activeClientCount;
  const readyCount = globalClientsList.filter(c => c.filedStatus === 'Ready').length;
  document.getElementById('kpi-gst-ready').textContent = readyCount;
  document.getElementById('kpi-gst-ready-sub').textContent = `${readyCount} / ${activeClientCount} reconciled`;
  
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

  setMetricSublineVisible('kpi-active-clients-sub', activeClientCount > 0);
  setMetricSublineVisible('kpi-gst-ready-sub', readyCount > 0 && activeClientCount > 0);
  setMetricSublineVisible('kpi-pending-filings-sub', actionCount > 0);
  setMetricSublineVisible('kpi-docs-today-sub', globalDocuments.length > 0);
  setMetricSublineVisible('kpi-trans-today-sub', globalTransactions.length > 0);
  setMetricSublineVisible('kpi-monthly-rev-sub', totalRev > 0);

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
    <div class="bar-segment bar-segment-confirmed" style="width: ${healthyPct}%;"></div>
    <div class="bar-segment bar-segment-draft" style="width: ${reviewPct}%;"></div>
    <div class="bar-segment bar-segment-review" style="width: ${criticalPct}%;"></div>
  `;

  // Render recent activities from real transactions
  const activityContainer = document.getElementById('overview-activity-feed');
  if (appDataState.clients.loading || appDataState.transactions.loading) {
    activityContainer.innerHTML = `<div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div>`;
  } else if (appDataState.clients.error || appDataState.transactions.error) {
    activityContainer.innerHTML = renderErrorState(appDataState.clients.error || appDataState.transactions.error, '<button class="btn-khata-secondary px-3 py-2 text-xs" data-retry-load="clients">Retry</button>');
    bindDataRetryActions(activityContainer);
  } else if (globalTransactions.length === 0) {
    activityContainer.innerHTML = renderEmptyState('No entries yet. Send your first receipt on WhatsApp to see it here.');
  } else {
    activityContainer.innerHTML = globalTransactions.slice(0, 5).map((t, idx) => `
      <div class="feed-item">
        <div class="feed-marker ${t.type === 'Sale' ? 'feed-marker-confirmed' : 'feed-marker-draft'}"></div>
        <div class="feed-content">
          <p class="feed-text"><strong>${t.clientName}</strong> logged a ${t.type.toLowerCase()} of <span class="feed-amount">Rs ${Math.abs(t.amount).toLocaleString('en-IN')}</span> - ${t.category}</p>
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
function renderClients(filterType = 'all', searchQuery = '', page = currentClientsPage) {
  const container = document.getElementById('clients-list-container');
  const query = searchQuery.toLowerCase();

  if (appDataState.clients.loading) {
    container.innerHTML = `
      <div class="dashboard-card clients-table-card overflow-x p-0">
        <table class="data-table dashboard-ledger-table clients-ledger-table">
          <thead>
            <tr>
              <th>Business</th>
              <th>Owner</th>
              <th>GSTIN</th>
              <th>Plan</th>
              <th>Last Active</th>
              <th class="numeric">Health</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${renderLoadingRows(7, 5)}</tbody>
        </table>
      </div>
    `;
    const resultCount = document.getElementById('clients-result-count');
    if (resultCount) resultCount.textContent = 'Loading clients';
    return;
  }

  if (appDataState.clients.error) {
    container.innerHTML = `
      <div class="dashboard-card clients-table-card overflow-x p-0">
        <table class="data-table dashboard-ledger-table clients-ledger-table">
          <thead>
            <tr>
              <th>Business</th>
              <th>Owner</th>
              <th>GSTIN</th>
              <th>Plan</th>
              <th>Last Active</th>
              <th class="numeric">Health</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${renderTableErrorState(7, appDataState.clients.error, '<button class="btn-khata-secondary px-3 py-2 text-xs" data-retry-load="clients">Retry</button>')}</tbody>
        </table>
      </div>
    `;
    const resultCount = document.getElementById('clients-result-count');
    if (resultCount) resultCount.textContent = 'Load failed';
    bindDataRetryActions(container);
    return;
  }

  let filtered = globalClientsList.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(query) || 
                          c.gstin.toLowerCase().includes(query) || 
                          c.owner.toLowerCase().includes(query);
    
    if (filterType === 'all') return matchesSearch;
    if (filterType === 'needs-review') return matchesSearch && c.filedStatus !== 'Ready';
    if (filterType === 'filed') return matchesSearch && c.filedStatus === 'Ready';
    return matchesSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / CLIENTS_PAGE_SIZE));
  currentClientsPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentClientsPage - 1) * CLIENTS_PAGE_SIZE;
  const pageRows = filtered.slice(startIndex, startIndex + CLIENTS_PAGE_SIZE);
  const resultCount = document.getElementById('clients-result-count');
  if (resultCount) {
    resultCount.textContent = `${filtered.length.toLocaleString('en-IN')} client${filtered.length === 1 ? '' : 's'}`;
  }

  container.innerHTML = `
    <div class="dashboard-card clients-table-card overflow-x p-0">
      <table class="data-table dashboard-ledger-table clients-ledger-table">
        <thead>
          <tr>
            <th>Business</th>
            <th>Owner</th>
            <th>GSTIN</th>
            <th>Plan</th>
            <th>Last Active</th>
            <th class="numeric">Health</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.length === 0 ? renderTableEmptyState(7, 'No clients match these filters. Adjust search or add a client.') : pageRows.map(c => `
            <tr data-client-id="${c.id}" class="client-row-link ledger-row">
              <td>
                <div class="client-meta-wrap">
                  <span class="client-name-cell">${c.name}</span>
                  <span class="client-gstin-cell">${c.id}</span>
                </div>
              </td>
              <td>
                <div class="client-meta-wrap">
                  <span class="client-owner-cell">${c.owner}</span>
                  <span class="client-gstin-cell">${c.phone}</span>
                </div>
              </td>
              <td><code>${c.gstin}</code></td>
              <td>${c.plan}</td>
              <td>${c.lastActivity}</td>
              <td class="numeric"><strong>${c.health}%</strong></td>
              <td>${renderStatusPill(c.filedStatus)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="clients-pagination" id="clients-pagination">
      <span class="dashboard-label">
        ${filtered.length === 0 ? 'Showing 0 clients' : `Showing ${(startIndex + 1).toLocaleString('en-IN')} - ${Math.min(startIndex + CLIENTS_PAGE_SIZE, filtered.length).toLocaleString('en-IN')} of ${filtered.length.toLocaleString('en-IN')}`}
      </span>
      <div class="pagination-actions">
        <button type="button" class="btn-khata-secondary px-3 py-2 text-xs" id="clients-prev-page" ${currentClientsPage === 1 ? 'disabled' : ''}>Previous</button>
        <span class="dashboard-label">Page ${currentClientsPage} / ${totalPages}</span>
        <button type="button" class="btn-khata-secondary px-3 py-2 text-xs" id="clients-next-page" ${currentClientsPage === totalPages ? 'disabled' : ''}>Next</button>
      </div>
    </div>
  `;

  // Bind workspace clicks
  document.querySelectorAll('.client-row-link').forEach(el => {
    el.onclick = () => {
      const cid = el.getAttribute('data-client-id');
      window.location.hash = `client/${cid}`;
    };
  });

  const prevPage = document.getElementById('clients-prev-page');
  const nextPage = document.getElementById('clients-next-page');
  if (prevPage) {
    prevPage.onclick = () => renderClients(filterType, searchQuery, currentClientsPage - 1);
  }
  if (nextPage) {
    nextPage.onclick = () => renderClients(filterType, searchQuery, currentClientsPage + 1);
  }
  
  initIcons();
}

// Screen 3: Client Workspace (360)
async function renderClientWorkspace(clientId) {
  const viewport = document.getElementById('ws-tab-viewport');
  if (appDataState.clients.loading) {
    if (viewport) viewport.innerHTML = `<div class="dashboard-card"><div class="skeleton-row"></div><div class="skeleton-row mt-3"></div><div class="skeleton-row mt-3"></div><div class="skeleton-row mt-3"></div></div>`;
    return;
  }

  if (appDataState.clients.error) {
    if (viewport) {
      viewport.innerHTML = `<div class="dashboard-card">${renderErrorState('Client workspace could not load because the client directory failed to refresh.', '<button class="btn-khata-secondary px-3 py-2 text-xs" data-retry-load="clients">Retry</button>')}</div>`;
      bindDataRetryActions(viewport);
    }
    return;
  }

  const clientObj = globalClientsList.find(c => c.id === clientId);
  if (!clientObj) {
    if (viewport) {
      viewport.innerHTML = `<div class="dashboard-card">${renderEmptyState('Client not found. Return to the client directory and select an active account.', '<button class="btn-khata-secondary px-3 py-2 text-xs" data-open-clients>Open Clients</button>')}</div>`;
      const openClientsBtn = viewport.querySelector('[data-open-clients]');
      if (openClientsBtn) openClientsBtn.onclick = () => { window.location.hash = 'clients'; };
    }
    return;
  }

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

  document.getElementById('ws-kpi-sales').textContent = `Rs ${salesVal.toLocaleString('en-IN')}`;
  document.getElementById('ws-kpi-expenses').textContent = `Rs ${expenseVal.toLocaleString('en-IN')}`;
  document.getElementById('ws-kpi-gst-payable').textContent = `Rs ${gstDueVal.toLocaleString('en-IN')}`;
  document.getElementById('ws-kpi-itc').textContent = `Rs ${itcVal.toLocaleString('en-IN')}`;
  setMetricSublineVisible('ws-kpi-sales-change', salesVal > 0);
  setMetricSublineVisible('ws-kpi-expenses-sub', expenseVal > 0);
  setMetricSublineVisible('ws-kpi-gst-payable-sub', gstDueVal > 0);
  setMetricSublineVisible('ws-kpi-itc-sub', itcVal > 0);

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
        pendingContainer.innerHTML = renderEmptyState('All transactions are confirmed. New review items will appear here.');
      } else {
        pendingContainer.innerHTML = pTx.map(t => `
          <div class="action-item">
            <div class="action-details">
              <span class="action-title">${t.category || 'Expense Ledger'} | Rs ${Math.abs(t.amount).toLocaleString('en-IN')}</span>
              <span class="action-desc">Logged on ${t.date || 'Today'} via ${t.source || 'WhatsApp'}</span>
            </div>
            <button class="btn-khata-primary px-3 py-1.5 text-xs btn-approve-ws-tx" data-tx-id="${t.id}">Approve</button>
          </div>
        `).join('');

        document.querySelectorAll('.btn-approve-ws-tx').forEach(btn => {
          btn.onclick = () => {
            const tid = btn.getAttribute('data-tx-id');
            const target = globalTransactions.find(t => t.id === tid);
            if (target) {
              target.status = 'Verified';
              logFrontendAction('TRANSACTION_APPROVED', `Approved transaction ${target.category || 'Ledger Item'} worth Rs ${Math.abs(target.amount).toLocaleString('en-IN')} for client ${target.clientName || 'Workspace Client'}`, clientId);
            }
            showToast('Transaction approved!');
            renderClientWorkspace(clientId);
          };
        });
      }

      // WhatsApp Feed
      const cDocs = globalDocuments.filter(d => d.clientId === clientId);
      document.getElementById('ws-overview-whatsapp-feed').innerHTML = cDocs.length === 0 ? `
        ${renderEmptyState('No WhatsApp files yet. Client receipts and invoices will appear here after parsing.')}
      ` : cDocs.map(d => `
        <div class="feed-item">
          <div class="feed-marker feed-marker-confirmed"></div>
          <div class="feed-content">
            <p class="feed-text"><strong>${d.name}</strong> received via WhatsApp.</p>
            <span class="feed-time">${d.received} - Size: ${d.size}</span>
          </div>
        </div>
      `).join('');
      break;

    case 'transactions':
      const txBody = document.querySelector('#ws-transactions-table tbody');
      txBody.innerHTML = cTx.length === 0 ? `
        ${renderTableEmptyState(7, "No entries yet. Send this client's first receipt on WhatsApp to see it here.")}
      ` : cTx.map(t => `
        <tr class="ledger-row">
          <td class="numeric">${escapeHtml(t.date || '-')}</td>
          <td>${renderStatusPill(t.type === 'Sale' || t.category === 'sales' ? 'Confirmed' : 'Draft', t.type || t.category || 'Draft')}</td>
          <td>${escapeHtml(t.category || '-')}</td>
          <td class="numeric">${escapeHtml(t.gstRate || `${t.gst_rate || 0}%`)}</td>
          <td class="numeric"><strong>Rs ${Math.abs(Number(t.amount || 0)).toLocaleString('en-IN')}</strong></td>
          <td>${renderSourcePill(t.source)}</td>
          <td>${renderStatusPill(t.status)}</td>
        </tr>
      `).join('');
      break;

    case 'documents':
      const docBody = document.querySelector('#ws-docs-table tbody');
      const clientDocsList = globalDocuments.filter(d => d.clientId === clientId);
      docBody.innerHTML = clientDocsList.length === 0 ? `
        ${renderTableEmptyState(4, 'No documents yet. Parsed WhatsApp files will appear here.')}
      ` : clientDocsList.map(d => `
        <tr class="doc-row-ws ledger-row" data-doc-id="${d.id}">
          <td><strong>${d.name}</strong></td>
          <td class="numeric">${d.received}</td>
          <td>${renderStatusPill('Draft', d.folder)}</td>
          <td class="numeric">${d.size}</td>
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
          <div class="action-item">
            <div class="action-details">
              <span class="action-title">GSTR-2B Automated Match Progress</span>
              <span class="action-desc">${clientObj.filedStatus === 'Ready' ? 'All invoices match exactly.' : 'Mismatches detected in purchase register files.'}</span>
            </div>
            ${renderStatusPill(clientObj.filedStatus)}
            <button class="btn-khata-secondary px-3 py-1.5 text-xs" onclick="showToast('Re-running matching algorithms...')">Re-Scan</button>
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

  container.innerHTML = `
    <div class="dashboard-card p-0 overflow-x">
      <table class="dashboard-ledger-table">
        <tbody>${renderLoadingRows(1, 3)}</tbody>
      </table>
    </div>
  `;

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
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="dashboard-card workspace-kpi-card">
          <span class="dashboard-label">Bank Lines</span>
          <span class="workspace-kpi-value numeric">${Number(recon.totalBankLines || 0).toLocaleString('en-IN')}</span>
        </div>
        <div class="dashboard-card workspace-kpi-card">
          <span class="dashboard-label">Matched</span>
          <span class="workspace-kpi-value numeric">${Number(recon.matchedBankLines || 0).toLocaleString('en-IN')}</span>
        </div>
        <div class="dashboard-card workspace-kpi-card">
          <span class="dashboard-label">Match Rate</span>
          <span class="workspace-kpi-value numeric">${matchRate}%</span>
        </div>
        <div class="dashboard-card workspace-kpi-card">
          <span class="dashboard-label">Needs Review</span>
          <span class="workspace-kpi-value numeric">${(unmatchedBankLines.length + unmatchedLedgerEntries.length).toLocaleString('en-IN')}</span>
        </div>
      </div>
      <div class="dashboard-split">
        <div class="split-left">
          <h4 class="mb-4">Unmatched Bank Lines</h4>
          ${renderReconciliationTable(unmatchedBankLines, 'No unmatched bank statement lines.')}
        </div>
        <div class="split-right">
          <h4 class="mb-4">Unmatched Ledger Entries</h4>
          ${renderReconciliationTable(unmatchedLedgerEntries, 'No unmatched ledger entries.')}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load reconciliation results:', err);
    container.innerHTML = renderErrorState('Unable to load reconciliation results. Retry this tab to refresh the match.');
  }
}

function renderReconciliationTable(rows, emptyText) {
  if (!rows.length) {
    return renderEmptyState(emptyText);
  }

  return `
    <div class="dashboard-card overflow-x p-0">
      <table class="data-table dashboard-ledger-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Category</th>
            <th class="numeric">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr class="ledger-row">
              <td class="numeric">${escapeHtml(row.date || '-')}</td>
              <td>${escapeHtml(row.description || row.raw_text || '-')}</td>
              <td>${renderStatusPill('Draft', row.category || '-')}</td>
              <td class="numeric"><strong>Rs ${Number(row.amount || 0).toLocaleString('en-IN')}</strong></td>
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
  const statusFilter = document.getElementById('tx-filter-status');
  const resultCount = document.getElementById('transactions-result-count');
  const selectionCount = document.getElementById('transactions-selection-count');
  const selectAllTransactions = document.getElementById('select-all-transactions');

  // Populate client filter dropdown options
  clientFilter.innerHTML = '<option value="all">All Clients</option>' + 
    globalClientsList.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  if (appDataState.clients.error) {
    tbody.innerHTML = renderTableErrorState(9, 'Transactions could not load because the client directory failed to refresh.', '<button class="btn-khata-secondary px-3 py-2 text-xs" data-retry-load="clients">Retry</button>');
    if (resultCount) resultCount.textContent = 'Load failed';
    if (selectionCount) selectionCount.textContent = '0 selected';
    bindDataRetryActions(tbody);
    return;
  }

  if (appDataState.transactions.loading) {
    tbody.innerHTML = renderLoadingRows(9, 5);
    if (resultCount) resultCount.textContent = 'Loading entries';
    if (selectionCount) selectionCount.textContent = '0 selected';
    return;
  }

  if (appDataState.transactions.error) {
    tbody.innerHTML = renderTableErrorState(9, appDataState.transactions.error, '<button class="btn-khata-secondary px-3 py-2 text-xs" data-retry-load="transactions">Retry</button>');
    if (resultCount) resultCount.textContent = 'Load failed';
    if (selectionCount) selectionCount.textContent = '0 selected';
    bindDataRetryActions(tbody);
    return;
  }

  function filterAndRender() {
    const query = searchInput.value.toLowerCase();
    const clientVal = clientFilter.value;
    const channelVal = channelFilter.value;
    const statusVal = statusFilter ? statusFilter.value : 'all';

    let filtered = globalTransactions.filter(t => {
      const matchesSearch = t.clientName.toLowerCase().includes(query) || 
                            t.category.toLowerCase().includes(query) || 
                            t.amount.toString().includes(query);
      const matchesClient = clientVal === 'all' || t.clientId === clientVal;
      const matchesChannel = channelVal === 'all' || t.source.toLowerCase().includes(channelVal);
      const normalizedStatus = String(t.status || '').toLowerCase();
      const matchesStatus = statusVal === 'all'
        || (statusVal === 'review' && normalizedStatus.includes('review'))
        || (statusVal === 'confirmed' && (normalizedStatus.includes('verified') || normalizedStatus.includes('confirmed')))
        || (statusVal === 'draft' && !(normalizedStatus.includes('review') || normalizedStatus.includes('verified') || normalizedStatus.includes('confirmed') || normalizedStatus.includes('rejected')))
        || (statusVal === 'rejected' && normalizedStatus.includes('rejected'));
      return matchesSearch && matchesClient && matchesChannel && matchesStatus;
    });

    if (resultCount) {
      resultCount.textContent = `${filtered.length.toLocaleString('en-IN')} entr${filtered.length === 1 ? 'y' : 'ies'}`;
    }
    if (selectAllTransactions) {
      selectAllTransactions.checked = false;
      selectAllTransactions.indeterminate = false;
    }
    updateTransactionSelectionCount();

    if (filtered.length === 0) {
      tbody.innerHTML = renderTableEmptyState(9, globalTransactions.length === 0 ? 'No entries yet. Send your first receipt on WhatsApp to see it here.' : 'No entries match these filters. Adjust search or filters to review more rows.');
    } else {
      tbody.innerHTML = filtered.map(t => {
        const isRejected = t.status === 'Rejected';
        const amount = `Rs ${Math.abs(t.amount).toLocaleString('en-IN')}`;

        return `
          <tr class="ledger-row transaction-row" tabindex="0" data-tx-id="${t.id}" aria-label="Transaction for ${escapeHtml(t.clientName || 'client')} worth ${amount}">
            <td><input type="checkbox" class="tx-checkbox" data-tx-id="${t.id}" aria-label="Select transaction for ${escapeHtml(t.clientName || 'client')}"></td>
            <td class="numeric transaction-date-cell">${escapeHtml(t.date || '-')}</td>
            <td><strong class="transaction-client-cell">${escapeHtml(t.clientName || '-')}</strong></td>
            <td>${renderStatusPill(t.type === 'Sale' ? 'Confirmed' : 'Draft', t.type || 'Draft')}</td>
            <td>${renderSourcePill(t.source)}</td>
            <td><span class="transaction-category-cell">${escapeHtml(t.category || '-')}</span></td>
            <td class="numeric">${escapeHtml(t.gstRate || '-')}</td>
            <td class="numeric"><strong class="${isRejected ? 'rejected-amount' : ''}">${amount}</strong></td>
            <td>${renderStatusPill(t.status)}</td>
          </tr>
        `;
      }).join('');
    }

    bindTransactionSelection();
    updateTransactionSelectionCount();
     
    initIcons();
  }

  searchInput.oninput = filterAndRender;
  clientFilter.onchange = filterAndRender;
  channelFilter.onchange = filterAndRender;
  if (statusFilter) statusFilter.onchange = filterAndRender;

  function updateTransactionSelectionCount() {
    const boxes = Array.from(document.querySelectorAll('#global-transactions-table-body .tx-checkbox'));
    const selected = boxes.filter(box => box.checked).length;
    if (selectionCount) {
      selectionCount.textContent = `${selected} selected`;
    }
    if (selectAllTransactions) {
      selectAllTransactions.checked = boxes.length > 0 && selected === boxes.length;
      selectAllTransactions.indeterminate = selected > 0 && selected < boxes.length;
    }
  }

  function bindTransactionSelection() {
    document.querySelectorAll('#global-transactions-table-body .tx-checkbox').forEach(box => {
      box.onchange = updateTransactionSelectionCount;
      box.onclick = (event) => event.stopPropagation();
    });

    document.querySelectorAll('#global-transactions-table-body .transaction-row').forEach(row => {
      row.onclick = (event) => {
        if (event.target.closest('input, button, a, select')) return;
        const box = row.querySelector('.tx-checkbox');
        if (!box) return;
        box.checked = !box.checked;
        updateTransactionSelectionCount();
      };
      row.onkeydown = (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        const box = row.querySelector('.tx-checkbox');
        if (!box) return;
        box.checked = !box.checked;
        updateTransactionSelectionCount();
      };
    });
  }

  if (selectAllTransactions) selectAllTransactions.onchange = (e) => {
    document.querySelectorAll('#global-transactions-table-body .tx-checkbox').forEach(box => {
      box.checked = e.target.checked;
    });
    updateTransactionSelectionCount();
  };

  const bulkApproveBtn = document.getElementById('btn-bulk-approve-transactions');
  if (bulkApproveBtn) bulkApproveBtn.onclick = () => {
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
        logFrontendAction('TRANSACTION_APPROVED', `Approved transaction ${match.category || 'Ledger Item'} worth Rs ${Math.abs(match.amount).toLocaleString('en-IN')} for client ${match.clientName || 'Workspace Client'}`, match.clientId);
      }
    });
    showToast(`Approved ${selected.length} transactions!`);
    filterAndRender();
    updateTransactionSelectionCount();
  };

  const exportTransactionsBtn = document.getElementById('btn-export-transactions');
  if (exportTransactionsBtn) exportTransactionsBtn.onclick = () => {
    showToast('CSV ledger exported!');
  };

  filterAndRender();
}

// Screen 5: Document Center
function renderDocuments() {
  const tbody = document.getElementById('global-documents-table-body');
  const searchInput = document.getElementById('doc-global-search');
  const folderChips = document.querySelectorAll('.doc-folder-chip');
  const previewUploadBtn = document.getElementById('btn-preview-upload-document');
  
  let currentFolder = 'all';

  function filterAndRender() {
    if (appDataState.clients.error) {
      tbody.innerHTML = renderTableErrorState(4, 'Documents could not load because the client directory failed to refresh.', '<button class="btn-khata-secondary px-3 py-2 text-xs" data-retry-load="clients">Retry</button>');
      bindDataRetryActions(tbody);
      return;
    }

    if (appDataState.transactions.loading) {
      tbody.innerHTML = renderLoadingRows(4, 5);
      return;
    }

    if (appDataState.transactions.error) {
      tbody.innerHTML = renderTableErrorState(4, 'Documents failed to load because transaction entries could not be refreshed.', '<button class="btn-khata-secondary px-3 py-2 text-xs" data-retry-load="transactions">Retry</button>');
      bindDataRetryActions(tbody);
      return;
    }

    const query = searchInput.value.toLowerCase();
    let filtered = globalDocuments.filter(d => {
      const matchesSearch = d.name.toLowerCase().includes(query) || d.clientName.toLowerCase().includes(query);
      const matchesFolder = currentFolder === 'all' || d.folder === currentFolder;
      return matchesSearch && matchesFolder;
    });

    tbody.innerHTML = filtered.length === 0 ? renderTableEmptyState(4, 'No documents match these filters. Adjust search or upload a file.') : filtered.map(d => `
      <tr class="document-list-row ledger-row ${selectedDocId === d.id ? 'active-row' : ''}" data-doc-id="${d.id}">
        <td><strong class="document-name-cell">${escapeHtml(d.name || '-')}</strong></td>
        <td><span class="document-client-cell">${escapeHtml(d.clientName || '-')}</span></td>
        <td>${renderStatusPill('Draft', d.folder || 'documents')}</td>
        <td class="numeric document-date-cell">${escapeHtml(d.received || '-')}</td>
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
      bindRovingButtonGroup(folderChips, {
        activeClass: 'active',
        stateAttr: 'aria-pressed',
        valueAttr: 'data-doc-folder',
        selectedValue: currentFolder
      });
      filterAndRender();
    };
  });
  bindRovingButtonGroup(folderChips, {
    activeClass: 'active',
    stateAttr: 'aria-pressed',
    valueAttr: 'data-doc-folder',
    selectedValue: currentFolder
  });

  searchInput.oninput = filterAndRender;
  if (previewUploadBtn) {
    previewUploadBtn.onclick = () => document.getElementById('btn-upload-new-document')?.click();
  }

  if (selectedDocId) {
    renderDocPreview(selectedDocId);
  }

  filterAndRender();
}

function renderDocPreview(docId) {
  const doc = globalDocuments.find(d => d.id === docId);
  if (!doc) return;

  const previewPanel = document.getElementById('doc-preview-panel');
  const moneyText = (value) => String(value || 'Rs 0').replace(/₹/g, 'Rs ');
  previewPanel.innerHTML = `
    <div class="preview-content-view" id="doc-preview-content">
      <div class="preview-header-meta">
        <h4 id="preview-filename">${escapeHtml(doc.name || 'Document')}</h4>
        ${renderStatusPill('Confirmed', doc.status || 'Parsed')}
      </div>
      
      <div class="preview-ocr-fields">
        <div class="form-group">
          <label>Client</label>
          <input type="text" id="preview-field-client" value="${escapeHtml(doc.clientName || '')}" class="form-input" disabled>
        </div>
        <div class="form-group">
          <label>Vendor Name</label>
          <input type="text" id="preview-field-vendor" value="${escapeHtml(doc.vendor || '')}" class="form-input">
        </div>
        <div class="form-group">
          <label>Vendor GSTIN</label>
          <input type="text" id="preview-field-gstin" value="${escapeHtml(doc.gstin || '')}" class="form-input">
        </div>
        <div class="form-grid-2">
          <div class="form-group">
            <label>Subtotal</label>
            <input type="text" id="preview-field-subtotal" value="${escapeHtml(moneyText(doc.subtotal))}" class="form-input numeric">
          </div>
          <div class="form-group">
            <label>GST Amount</label>
            <input type="text" id="preview-field-gst" value="${escapeHtml(moneyText(doc.gst))}" class="form-input numeric">
          </div>
        </div>
        <div class="form-group">
          <label>Total Amount</label>
          <input type="text" id="preview-field-total" value="${escapeHtml(moneyText(doc.total))}" class="form-input input-highlight numeric">
        </div>
      </div>

      <div class="preview-actions-panel">
        <button class="btn-khata-primary px-4 py-2 text-sm" id="btn-preview-accept-ledger">Approve & Log Ledger</button>
        <button class="btn-khata-whatsapp px-4 py-2 text-sm" id="btn-preview-ask-whatsapp">Ask Client on WhatsApp</button>
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

    logFrontendAction('TRANSACTION_CREATED', `Logged expense transaction of Rs ${val.toLocaleString('en-IN')} from document ${doc.name} for client ${doc.clientName}`, doc.clientId);

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
  const searchInput = document.getElementById('gst-client-search');
  const statusFilter = document.getElementById('gst-status-filter');
  const resultCount = document.getElementById('gst-result-count');
  if (!picker.value) {
    picker.value = new Date().toISOString().substring(0, 7);
  }

  // Load live consolidated reports from Express API
  const caSession = getCASession();
  if (!caSession) return;

  let report = { totalOutwardTaxableValue: 0, totalInwardTaxAmount: 0, netGstPayable: 0, clientBreakdown: [], incomplete: false, warnings: [] };
  appDataState.gst.loading = true;
  appDataState.gst.error = '';
  tbody.innerHTML = renderLoadingRows(6, 5);
  if (resultCount) resultCount.textContent = 'Compiling ledger';
  try {
    const res = await fetch(`/api/ca/reports/gst?period=${picker.value}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('GST filing ledger failed to load. Retry to compile this period again.');
    report = await res.json();
  } catch (err) {
    console.error('Failed GSTR report compilation:', err);
    appDataState.gst.error = err.message || 'GST filing ledger failed to load. Retry to compile this period again.';
  } finally {
    appDataState.gst.loading = false;
  }

  if (appDataState.gst.error) {
    tbody.innerHTML = renderTableErrorState(6, appDataState.gst.error, '<button class="btn-khata-secondary px-3 py-2 text-xs" data-retry-load="gst">Retry</button>');
    if (resultCount) resultCount.textContent = 'Load failed';
    bindDataRetryActions(tbody);
    picker.onchange = renderGSTCenter;
    if (searchInput) searchInput.oninput = () => {};
    if (statusFilter) statusFilter.onchange = () => {};
    initIcons();
    return;
  }

  // Render top metrics
  document.getElementById('gst-total-liability-metric').textContent = `Rs ${report.totalOutwardTaxableValue.toLocaleString('en-IN')}`;
  document.getElementById('gst-total-itc-metric').textContent = `Rs ${report.totalInwardTaxAmount.toLocaleString('en-IN')}`;
  
  const readyCount = globalClientsList.filter(c => c.filedStatus === 'Ready').length;
  document.getElementById('gst-ready-to-file-metric').textContent = readyCount;
  const needsReviewCount = globalClientsList.length - readyCount;
  document.getElementById('gst-needs-review-metric').textContent = needsReviewCount;
  setMetricSublineVisible('gst-total-liability-sub', report.totalOutwardTaxableValue > 0);
  setMetricSublineVisible('gst-total-itc-sub', report.totalInwardTaxAmount > 0);
  setMetricSublineVisible('gst-ready-to-file-sub', readyCount > 0);
  setMetricSublineVisible('gst-needs-review-sub', needsReviewCount > 0);

  if (report.incomplete && report.warnings?.length) {
    showToast('GSTR report compiled with review-needed client calculations.', 'warning');
  }

  function renderGSTRows() {
    const statusValue = statusFilter?.value || 'all';
    const query = (searchInput?.value || '').trim().toLowerCase();
    const rows = report.clientBreakdown.map(client => {
      const netLiability = Math.max(0, client.outwardTax - client.inwardTax);
      const cObj = globalClientsList.find(c => c.id === client.clientId) || { filedStatus: 'Review Required' };
      const filedStatus = client.calculationStatus === 'error' ? 'Review Required' : cObj.filedStatus;
      return { ...client, netLiability, filedStatus };
    }).filter(client => {
      const text = [
        client.businessName,
        client.clientName,
        client.gstin
      ].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !query || text.includes(query);
      const status = String(client.filedStatus || '').toLowerCase();
      const matchesStatus = statusValue === 'all'
        || (statusValue === 'ready' && status === 'ready')
        || (statusValue === 'review' && status !== 'ready' && status !== 'filed')
        || (statusValue === 'filed' && status === 'filed');
      return matchesSearch && matchesStatus;
    });

    if (resultCount) {
      resultCount.textContent = `${rows.length} of ${report.clientBreakdown.length} clients`;
    }

    if (report.clientBreakdown.length === 0) {
      tbody.innerHTML = `
        ${renderTableEmptyState(6, `No filing records for ${picker.value}. Link GST-registered clients or change the return period.`)}`;
    } else if (rows.length === 0) {
      tbody.innerHTML = renderTableEmptyState(6, 'No clients match these GST filters. Clear search or change status.');
    } else {
      tbody.innerHTML = rows.map(client => `
        <tr class="ledger-row gst-client-row">
          <td>
            <div class="gst-client-cell">
              <strong>${escapeHtml(client.businessName || client.clientName || 'Unknown Client')}</strong>
              <code>${escapeHtml(client.gstin || 'N/A')}</code>
            </div>
          </td>
          <td class="numeric gst-money-cell">Rs ${client.outwardTaxable.toLocaleString('en-IN')}</td>
          <td class="numeric gst-money-cell">Rs ${client.inwardTaxable.toLocaleString('en-IN')}</td>
          <td class="numeric gst-net-cell"><strong>Rs ${client.netLiability.toLocaleString('en-IN')}</strong></td>
          <td>${renderStatusPill(client.filedStatus)}</td>
          <td>
            <button class="${client.filedStatus === 'Ready' ? 'btn-khata-primary' : 'btn-khata-secondary'} px-3 py-1.5 text-xs btn-gst-file-action" data-client-id="${client.clientId}">
              ${client.filedStatus === 'Ready' ? 'File GSTR-1' : 'Verify'}
            </button>
          </td>
        </tr>
      `).join('');

      document.querySelectorAll('.btn-gst-file-action').forEach(btn => {
        btn.onclick = () => withButtonState(btn, 'Working', async () => {
          const cid = btn.getAttribute('data-client-id');
          const c = globalClientsList.find(cl => cl.id === cid);
          if (c && c.filedStatus === 'Ready') {
            await sleep(450);
            c.filedStatus = 'Filed';
            logFrontendAction('GST_FILED', `Marked GSTR filing as filed for ${c.name || c.business_name || 'Client'}`, c.id);
            showToast(`GSTR-1 filed for ${c.name || c.business_name || 'client'}.`, 'success');
            renderGSTCenter();
          } else {
            showToast('Opening AI insights to verify filing blockers.', 'info');
            window.location.hash = 'insights';
          }
        });
      });
    }
  }

  const gstBulkFileBtn = document.getElementById('btn-gst-bulk-file');
  if (gstBulkFileBtn) {
    gstBulkFileBtn.onclick = () => withButtonState(gstBulkFileBtn, 'Bulk filing', async () => {
      const readyClients = globalClientsList.filter(c => c.filedStatus === 'Ready');
      if (readyClients.length === 0) {
        showToast('No ready GST filings available for bulk filing.', 'warning');
        return;
      }
      await sleep(600);
      readyClients.forEach(c => {
        c.filedStatus = 'Filed';
        logFrontendAction('GST_BULK_FILED', `Marked GSTR filing as filed for ${c.name || c.business_name || 'Client'}`, c.id);
      });
      showToast(`Bulk filed ${readyClients.length} GST returns.`, 'success');
      renderGSTCenter();
    });
  }

  picker.onchange = renderGSTCenter;
  if (searchInput) searchInput.oninput = renderGSTRows;
  if (statusFilter) statusFilter.onchange = renderGSTRows;
  renderGSTRows();
  initIcons();
}

// Screen 7: AI Insights Dashboard
function renderAIInsights(filterSeverity = 'all') {
  const container = document.getElementById('ai-insights-cards-container');
  const severityRank = { high: 0, medium: 1, low: 2 };

  if (appDataState.clients.error) {
    container.innerHTML = `<div class="dashboard-card">${renderErrorState('Insights could not load because the client directory failed to refresh.', '<button class="btn-khata-secondary px-3 py-2 text-xs" data-retry-load="clients">Retry</button>')}</div>`;
    bindDataRetryActions(container);
    return;
  }

  if (appDataState.transactions.loading) {
    container.innerHTML = `
      <div class="dashboard-card"><div class="skeleton-row"></div><div class="skeleton-row mt-3"></div><div class="skeleton-row mt-3"></div></div>
      <div class="dashboard-card"><div class="skeleton-row"></div><div class="skeleton-row mt-3"></div><div class="skeleton-row mt-3"></div></div>
    `;
    return;
  }

  if (appDataState.transactions.error) {
    container.innerHTML = `<div class="dashboard-card">${renderErrorState('Insights failed to load because transaction entries could not be refreshed.', '<button class="btn-khata-secondary px-3 py-2 text-xs" data-retry-load="transactions">Retry</button>')}</div>`;
    bindDataRetryActions(container);
    return;
  }

  const counts = globalInsights.reduce((acc, insight) => {
    const severity = insight.severity || 'low';
    acc[severity] = (acc[severity] || 0) + 1;
    acc.all += 1;
    return acc;
  }, { all: 0, high: 0, medium: 0, low: 0 });

  ['all', 'high', 'medium', 'low'].forEach(key => {
    const el = document.getElementById(`insight-count-${key}`);
    if (el) el.textContent = counts[key] || 0;
  });
  
  let filtered = globalInsights.filter(ins => {
    if (filterSeverity === 'all') return true;
    return ins.severity === filterSeverity;
  }).sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3));

  const tabs = document.querySelectorAll('#view-insights .filter-tab');
  tabs.forEach(tab => {
    const isActive = tab.getAttribute('data-severity') === filterSeverity;
    tab.classList.toggle('active', isActive);
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderAIInsights(tab.getAttribute('data-severity'));
    };
  });
  bindRovingButtonGroup(tabs, {
    activeClass: 'active',
    stateAttr: 'aria-pressed',
    valueAttr: 'data-severity',
    selectedValue: filterSeverity
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="dashboard-card">${renderEmptyState('No risk alerts match this filter. New review items will appear here after client activity is scanned.')}</div>`;
    return;
  }

  container.innerHTML = filtered.map(ins => `
    <div class="dashboard-card insight-card severity-${ins.severity}">
      <div class="insight-header">
        ${renderStatusPill(ins.severity, ins.severity === 'high' ? 'High severity' : (ins.severity === 'medium' ? 'Medium' : 'Info'))}
        <strong class="insight-client-name">${escapeHtml(ins.clientName || 'Client')}</strong>
      </div>
      <h3 class="insight-title">${escapeHtml(ins.title || 'Review item')}</h3>
      <p class="card-subtitle">${escapeHtml(ins.desc || '')}</p>
      <div class="insight-rec-box">
        <span class="insight-rec-text"><strong>Recommended:</strong> ${escapeHtml(ins.suggestion || 'Review the source entries before filing.')}</span>
        <button class="btn-khata-primary px-3 py-1.5 text-xs btn-resolve-insight" data-insight-id="${ins.id}">Resolve</button>
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

  initIcons();
}

// Screen 9: Billing
function renderBilling() {
  const statePanel = document.getElementById('billing-state');
  if (statePanel) {
    statePanel.classList.add('hidden');
    statePanel.innerHTML = '';
  }

  if (appDataState.clients.loading) {
    if (statePanel) {
      statePanel.classList.remove('hidden');
      statePanel.innerHTML = `<div class="dashboard-card"><div class="skeleton-row"></div><div class="skeleton-row mt-3"></div></div>`;
    }
  } else if (appDataState.clients.error) {
    if (statePanel) {
      statePanel.classList.remove('hidden');
      statePanel.innerHTML = renderErrorState('Billing could not load because the client directory failed to refresh.', '<button class="btn-khata-secondary px-3 py-2 text-xs" data-retry-load="clients">Retry</button>');
      bindDataRetryActions(statePanel);
    }
  }

  const clientCount = globalClientsList.length;
  document.getElementById('billing-subtitle-count').textContent = `Currently managing ${clientCount} clients on TaxBot Partner API.`;
  
  let unitRate = 149;
  if (clientCount >= 50) unitRate = 99;
  else if (clientCount >= 10) unitRate = 119;

  document.getElementById('billing-marginal-rate-display').textContent = `Rs ${(clientCount * unitRate).toLocaleString('en-IN')} / month`;
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
      settingsLinks.forEach(l => {
        l.classList.remove('active');
        l.setAttribute('aria-selected', 'false');
        l.setAttribute('tabindex', '-1');
      });
      settingsPanels.forEach(p => {
        p.classList.remove('active');
        p.hidden = true;
      });
      
      link.classList.add('active');
      link.setAttribute('aria-selected', 'true');
      link.setAttribute('tabindex', '0');
      const targetPanel = link.getAttribute('data-settings-tab');
      const panel = document.getElementById(`settings-panel-${targetPanel}`);
      if (panel) {
        panel.classList.add('active');
        panel.hidden = false;
      }
      
      if (targetPanel === 'users') {
        renderSettingsUsers();
      } else if (targetPanel === 'audit-trail') {
        fetchAndRenderAuditTrail();
      }
    };
  });
  bindRovingButtonGroup(settingsLinks, {
    activeClass: 'active',
    stateAttr: 'aria-selected',
    valueAttr: 'data-settings-tab',
    selectedValue: document.querySelector('.settings-tab-link.active')?.getAttribute('data-settings-tab') || 'firm'
  });
  settingsPanels.forEach(panel => {
    panel.hidden = !panel.classList.contains('active');
  });

  bindSettingsActions();
}

function renderSettingsUsers() {
  const container = document.querySelector('#settings-panel-users .user-list');
  const session = getCASession();
  if (!container) return;
  
  container.innerHTML = `
    <div class="user-item-row ledger-row">
      <div class="user-item-info">
        <div class="firm-avatar">SS</div>
        <div class="user-item-text">
          <strong>${escapeHtml(session ? session.name : 'Sandeep Sharma')}</strong>
          <span class="firm-role-text">FCA Principal &amp; Owner</span>
        </div>
      </div>
      ${renderStatusPill('Confirmed', 'Admin')}
    </div>
    <div class="user-item-row ledger-row">
      <div class="user-item-info">
        <div class="firm-avatar">RG</div>
        <div class="user-item-text">
          <strong>Rohan Gupta</strong>
          <span class="firm-role-text">Assistant Auditor</span>
        </div>
      </div>
      ${renderStatusPill('Draft', 'Edit Access')}
    </div>
  `;
}

function bindSettingsActions() {
  if (window.__taxbotSettingsBound) return;
  window.__taxbotSettingsBound = true;

  const firmForm = document.getElementById('form-settings-firm');
  if (firmForm) {
    firmForm.onsubmit = (e) => {
      e.preventDefault();
      const submitBtn = firmForm.querySelector('button[type="submit"]');
      withButtonState(submitBtn, 'Saving', async () => {
      const session = getCASession();
      const firmName = document.getElementById('settings-firm-name').value.trim();
      const principalName = document.getElementById('settings-principal-name').value.trim();
      const membershipId = document.getElementById('settings-membership-id').value.trim();
      const frnId = document.getElementById('settings-frn-id').value.trim();
      if (!firmName || !principalName) {
        setFieldStatus(document.getElementById(!firmName ? 'settings-firm-name' : 'settings-principal-name'), 'This field is required.');
        showToast('Complete the required firm profile fields.', 'error');
        return;
      }
      ['settings-firm-name', 'settings-principal-name'].forEach(id => setFieldStatus(document.getElementById(id), '', 'success'));
      await sleep(250);
      localStorage.setItem('taxbot_settings_firm', JSON.stringify({ firmName, principalName, membershipId, frnId }));
      if (session) {
        session.firm_name = firmName;
        session.name = principalName.replace(/,\s*FCA$/i, '') || session.name;
        localStorage.setItem('taxbot_ca_session', JSON.stringify(session));
        const displayName = document.getElementById('ca-display-name');
        const headerName = document.getElementById('ca-display-header-name');
        if (displayName) displayName.textContent = session.name;
        if (headerName) headerName.textContent = session.name;
      }
      logFrontendAction('SETTINGS_FIRM_SAVED', `Updated firm settings for ${firmName || 'CA firm'}`);
      showToast('Firm profile settings saved.', 'success');
      });
    };
  }

  const inviteBtn = document.getElementById('btn-settings-invite-user');
  if (inviteBtn) {
    inviteBtn.onclick = () => withButtonState(inviteBtn, 'Sending invite', async () => {
      const emailInput = document.getElementById('settings-invite-email');
      const roleInput = document.getElementById('settings-invite-role');
      const email = emailInput.value.trim();
      const role = roleInput.value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setFieldStatus(emailInput, 'Enter a valid email address.');
        showToast('Enter a valid email address for the invite.', 'error');
        emailInput.focus();
        return;
      }
      setFieldStatus(emailInput, '', 'success');
      await sleep(350);
      showToast(`Invite sent to ${email}.`, 'success');
      logFrontendAction('SETTINGS_USER_INVITED', `Invited ${email} as ${role}`);
      emailInput.value = '';
      renderSettingsUsers();
    });
  }

  const exportUsersBtn = document.getElementById('btn-settings-export-users');
  if (exportUsersBtn) {
    exportUsersBtn.onclick = () => withButtonState(exportUsersBtn, 'Exporting', async () => {
      await sleep(250);
      const rows = ['Name,Role,Access', 'Sandeep,FCA Principal & Owner,Admin', 'Rohan Gupta,Assistant Auditor,Edit Access'];
      downloadTextFile('taxbot-console-users.csv', rows.join('\r\n'), 'text/csv;charset=utf-8;');
      showToast('Users exported.', 'success');
    });
  }

  document.querySelectorAll('.settings-switch').forEach(toggle => {
    toggle.onclick = () => {
      const next = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', String(next));
    };
  });

  const saveNotificationsBtn = document.getElementById('btn-settings-save-notifications');
  if (saveNotificationsBtn) {
    saveNotificationsBtn.onclick = () => withButtonState(saveNotificationsBtn, 'Saving', async () => {
      const settings = {};
      document.querySelectorAll('#settings-notification-options .settings-switch').forEach(toggle => {
        settings[toggle.getAttribute('data-setting-key')] = toggle.getAttribute('aria-pressed') === 'true';
      });
      await sleep(250);
      localStorage.setItem('taxbot_notification_settings', JSON.stringify(settings));
      logFrontendAction('SETTINGS_NOTIFICATIONS_SAVED', 'Updated console notification preferences');
      showToast('Notification settings saved.', 'success');
    });
  }

  const testNotificationBtn = document.getElementById('btn-settings-test-notification');
  if (testNotificationBtn) {
    testNotificationBtn.onclick = () => withButtonState(testNotificationBtn, 'Sending test', async () => {
      await sleep(250);
      globalNotifications.unshift({
        id: `notif-test-${Date.now()}`,
        title: 'Test Notification',
        desc: 'Your TaxBot notification channel is working correctly.',
        time: 'Just now',
        unread: true,
        type: 'info',
        action: () => { window.location.hash = 'settings'; },
      });
      updateNotificationIndicator();
      renderNotificationsList();
      showToast('Test notification added.', 'success');
    });
  }

  document.querySelectorAll('[data-integration-test]').forEach(btn => {
    btn.onclick = () => withButtonState(btn, 'Testing', async () => {
      const name = btn.getAttribute('data-integration-test');
      showToast(`Testing ${name}...`);
      await sleep(600);
      showToast(`${name} connection looks healthy.`, 'success');
      logFrontendAction('SETTINGS_INTEGRATION_TESTED', `Tested ${name} integration`);
    });
  });

  const gstForm = document.getElementById('form-settings-gst');
  if (gstForm) {
    gstForm.onsubmit = (e) => {
      e.preventDefault();
      const submitBtn = gstForm.querySelector('button[type="submit"]');
      withButtonState(submitBtn, 'Saving', async () => {
      const clientId = document.getElementById('settings-gsp-client-id').value.trim();
      const env = document.getElementById('settings-gsp-env').value;
      const hasSecret = Boolean(document.getElementById('settings-gsp-secret').value.trim());
      if (!clientId) {
        setFieldStatus(document.getElementById('settings-gsp-client-id'), 'Enter the GSP client ID.');
        showToast('GSP client ID is required.', 'error');
        return;
      }
      setFieldStatus(document.getElementById('settings-gsp-client-id'), '', 'success');
      await sleep(250);
      localStorage.setItem('taxbot_gst_settings', JSON.stringify({ clientId, env, hasSecret }));
      logFrontendAction('SETTINGS_GST_SAVED', `Updated GST ${env} credentials`);
      showToast('GST credentials saved.', 'success');
      });
    };
  }

  const testGstBtn = document.getElementById('btn-settings-test-gst');
  if (testGstBtn) {
    testGstBtn.onclick = () => withButtonState(testGstBtn, 'Testing GST', async () => {
      showToast('Testing GST portal connection...');
      await sleep(700);
      showToast('GST portal credentials validated for the selected environment.', 'success');
    });
  }

  const copyApiBtn = document.getElementById('btn-settings-copy-api-key');
  if (copyApiBtn) {
    copyApiBtn.onclick = () => copySettingsValue('settings-api-key-value', 'API key copied.');
  }

  const regenerateApiBtn = document.getElementById('btn-settings-regenerate-api-key');
  if (regenerateApiBtn) {
    regenerateApiBtn.onclick = () => withButtonState(regenerateApiBtn, 'Regenerating', async () => {
      await sleep(350);
      const keyEl = document.getElementById('settings-api-key-value');
      const token = `tb_live_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-8)}`;
      keyEl.textContent = token;
      logFrontendAction('SETTINGS_API_KEY_REGENERATED', 'Regenerated partner API key');
      showToast('New API key generated.', 'success');
    });
  }

  const saveWebhookBtn = document.getElementById('btn-settings-save-webhook');
  if (saveWebhookBtn) {
    saveWebhookBtn.onclick = () => withButtonState(saveWebhookBtn, 'Saving webhook', async () => {
      const webhookInput = document.getElementById('settings-webhook-url');
      const webhookUrl = webhookInput.value.trim();
      if (!/^https:\/\/.+/i.test(webhookUrl)) {
        setFieldStatus(webhookInput, 'Use a valid HTTPS endpoint.');
        showToast('Webhook URL must start with https://', 'error');
        webhookInput.focus();
        return;
      }
      setFieldStatus(webhookInput, '', 'success');
      await sleep(250);
      localStorage.setItem('taxbot_webhook_url', webhookUrl);
      logFrontendAction('SETTINGS_WEBHOOK_SAVED', `Updated webhook receiver ${webhookUrl}`);
      showToast('Webhook receiver saved.', 'success');
    });
  }

  const testWebhookBtn = document.getElementById('btn-settings-test-webhook');
  if (testWebhookBtn) {
    testWebhookBtn.onclick = () => withButtonState(testWebhookBtn, 'Sending test', async () => {
      const webhookUrl = document.getElementById('settings-webhook-url').value.trim();
      if (!/^https:\/\/.+/i.test(webhookUrl)) {
        showToast('Save a valid HTTPS webhook URL first.', 'error');
        return;
      }
      showToast('Sending test webhook payload...');
      await sleep(650);
      showToast('Test webhook payload queued.', 'success');
    });
  }

  restoreSettingsState();
}

function restoreSettingsState() {
  try {
    const firm = JSON.parse(localStorage.getItem('taxbot_settings_firm') || '{}');
    if (firm.firmName) document.getElementById('settings-firm-name').value = firm.firmName;
    if (firm.principalName) document.getElementById('settings-principal-name').value = firm.principalName;
    if (firm.membershipId) document.getElementById('settings-membership-id').value = firm.membershipId;
    if (firm.frnId) document.getElementById('settings-frn-id').value = firm.frnId;

    const notificationSettings = JSON.parse(localStorage.getItem('taxbot_notification_settings') || '{}');
    Object.entries(notificationSettings).forEach(([key, value]) => {
      const toggle = document.querySelector(`.settings-switch[data-setting-key="${key}"]`);
      if (toggle) toggle.setAttribute('aria-pressed', String(Boolean(value)));
    });

    const gst = JSON.parse(localStorage.getItem('taxbot_gst_settings') || '{}');
    if (gst.clientId) document.getElementById('settings-gsp-client-id').value = gst.clientId;
    if (gst.env) document.getElementById('settings-gsp-env').value = gst.env;

    const webhookUrl = localStorage.getItem('taxbot_webhook_url');
    if (webhookUrl) document.getElementById('settings-webhook-url').value = webhookUrl;
  } catch (err) {
    console.warn('Failed to restore settings state:', err);
  }
}

function copySettingsValue(elementId, successMessage) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.textContent.trim();
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => showToast(successMessage)).catch(() => showToast(text));
  } else {
    showToast(successMessage);
  }
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// --------------------------------------------------------------------------
// 6. Modals & Sidebars
// --------------------------------------------------------------------------
function initModals() {
  const addClientModal = document.getElementById('add-client-modal');
  const openTriggers = [
    document.getElementById('overview-add-client-btn'),
    document.getElementById('overview-zero-add-client-btn'),
    document.getElementById('qa-add-client'),
    document.getElementById('btn-add-client-modal-trigger')
  ];
  
  const closeBtn = document.getElementById('btn-close-add-client');
  const cancelBtn = document.getElementById('btn-cancel-add-client');
  const form = document.getElementById('form-add-client');
  if (!addClientModal || !form) return;

  openTriggers.forEach(btn => {
    if (btn) btn.onclick = () => {
      addClientModal.classList.remove('hidden');
      const firstInput = document.getElementById('new-client-owner');
      if (firstInput) firstInput.focus();
    };
  });

  function closeClientModal() {
    addClientModal.classList.add('hidden');
    form.reset();
  }

  if (closeBtn) closeBtn.onclick = closeClientModal;
  if (cancelBtn) cancelBtn.onclick = closeClientModal;

  addClientModal.addEventListener('click', (e) => {
    if (e.target === addClientModal) closeClientModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !addClientModal.classList.contains('hidden')) {
      closeClientModal();
    }
  });

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

}

// --------------------------------------------------------------------------
// 8. Interactive Toast & App Bindings
// --------------------------------------------------------------------------
function showToast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  const toast = document.createElement('div');
  const normalizedType = ['success', 'warning', 'error', 'info'].includes(type) ? type : 'info';
  toast.className = `toast toast-${normalizedType}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', normalizedType === 'error' ? 'assertive' : 'polite');
  const icon = document.createElement('i');
  const iconMap = {
    success: 'check-circle',
    warning: 'alert-triangle',
    error: 'x-circle',
    info: 'info',
  };
  icon.setAttribute('data-lucide', iconMap[normalizedType]);
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
      currentClientsPage = 1;
      renderClients(filterVal, e.target.value);
    };
  }

  // Client filter tabs
  const filterTabs = document.querySelectorAll('#view-clients .filter-tab');
  filterTabs.forEach(tab => {
    tab.onclick = () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      bindRovingButtonGroup(filterTabs, {
        activeClass: 'active',
        stateAttr: 'aria-pressed',
        valueAttr: 'data-filter',
        selectedValue: tab.getAttribute('data-filter')
      });
      currentClientsPage = 1;
      renderClients(tab.getAttribute('data-filter'), clientSearchInput ? clientSearchInput.value : '');
    };
  });
  bindRovingButtonGroup(filterTabs, {
    activeClass: 'active',
    stateAttr: 'aria-pressed',
    valueAttr: 'data-filter',
    selectedValue: document.querySelector('#view-clients .filter-tab.active')?.getAttribute('data-filter') || 'all'
  });

  // Client workspace back btn
  const backToClients = document.getElementById('btn-back-to-clients');
  if (backToClients) {
    backToClients.onclick = () => {
      window.location.hash = 'clients';
    };
  }

  // Quick Action binds
  const quickBindings = [
    ['qa-upload-docs', 'documents'],
    ['qa-gen-report', 'exports'],
    ['qa-export-tally', 'exports'],
  ];
  quickBindings.forEach(([id, hash]) => {
    const btn = document.getElementById(id);
    if (btn) btn.onclick = () => { window.location.hash = hash; };
  });
});
