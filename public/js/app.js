// TaxBot Frontend Application Logic

document.addEventListener('DOMContentLoaded', () => {
  // --- Landing Page Pricing Calculator ---
  const clientSlider = document.getElementById('client-slider');
  if (clientSlider) {
    clientSlider.addEventListener('input', () => {
      updateCalculator('client-slider', 'client-count-display', 'price-per-client', 'total-monthly-price', 'reseller-tier-badge', 'savings-display');
    });
    // Initial call
    updateCalculator('client-slider', 'client-count-display', 'price-per-client', 'total-monthly-price', 'reseller-tier-badge', 'savings-display');
  }

  // --- Reseller Pricing Tab Slider ---
  const resellerSlider = document.getElementById('reseller-slider');
  if (resellerSlider) {
    resellerSlider.addEventListener('input', () => {
      updateCalculator('reseller-slider', 'reseller-slider-count-display', 'reseller-unit-price', 'reseller-total-bill', 'reseller-tier-indicator', 'reseller-discount-display');
    });
  }

  // --- Mobile Nav Toggle (Landing Page) ---
  const mobileToggle = document.getElementById('mobile-nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (mobileToggle && navLinks) {
    const setMobileNavState = (isOpen) => {
      navLinks.classList.toggle('active', isOpen);
      mobileToggle.classList.toggle('active', isOpen);
      mobileToggle.setAttribute('aria-expanded', String(isOpen));
    };

    mobileToggle.addEventListener('click', () => {
      setMobileNavState(!navLinks.classList.contains('active'));
    });

    // Close mobile menu when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        setMobileNavState(false);
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setMobileNavState(false);
      }
    });
  }

  // --- Landing Page Metric Count-Up ---
  setupMetricCounters();

  // --- Sidebar Mobile Toggle (Console Page) ---
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  
  if (sidebarToggle && sidebar && sidebarOverlay) {
    const toggleSidebar = () => {
      sidebar.classList.toggle('active');
      sidebarToggle.classList.toggle('active');
      sidebarOverlay.classList.toggle('active');
    };
    
    sidebarToggle.addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', toggleSidebar);
    
    // Close sidebar when selecting a sidebar navigation item on mobile
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    sidebarItems.forEach(item => {
      item.addEventListener('click', () => {
        if (sidebar.classList.contains('active')) {
          toggleSidebar();
        }
      });
    });
  }

  // --- CA Partner Console Auth & Operations ---
  const authContainer = document.getElementById('auth-container');
  const consoleContainer = document.getElementById('console-container');

  if (authContainer && consoleContainer) {
    checkAuth();
    setupAuthToggles();
    setupAuthSubmits();
    setupDashboardInteractions();
  }
  setupSecurityModals();
});

function setupMetricCounters() {
  const counters = Array.from(document.querySelectorAll('.count-up'));
  if (counters.length === 0) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const runCounter = (counter) => {
    const target = Number(counter.getAttribute('data-count') || counter.textContent || 0);
    if (!Number.isFinite(target)) return;
    if (prefersReducedMotion) {
      counter.textContent = String(target);
      return;
    }

    const durationMs = 700;
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      counter.textContent = String(Math.round(target * eased));
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  };

  if (!('IntersectionObserver' in window)) {
    counters.forEach(runCounter);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      runCounter(entry.target);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.35 });

  counters.forEach((counter) => observer.observe(counter));
}

/**
 * Calculates and updates pricing display based on reseller tiers
 */
function updateCalculator(sliderId, countId, unitPriceId, totalId, badgeId, savingsId) {
  const slider = document.getElementById(sliderId);
  const countDisplay = document.getElementById(countId);
  const unitPriceDisplay = document.getElementById(unitPriceId);
  const totalDisplay = document.getElementById(totalId);
  const badge = document.getElementById(badgeId);
  const savings = document.getElementById(savingsId);

  if (!slider) return;

  const count = parseInt(slider.value, 10);
  if (countDisplay) countDisplay.textContent = count;

  let unitPrice = 149;
  let tierName = 'Starter Tier';

  if (count >= 50) {
    unitPrice = 99;
    tierName = 'Enterprise Reseller (Save 33%)';
  } else if (count >= 10) {
    unitPrice = 119;
    tierName = 'Growth Partner (Save 20%)';
  }

  const total = count * unitPrice;

  if (unitPriceDisplay) unitPriceDisplay.textContent = `Rs. ${unitPrice}`;
  if (totalDisplay) totalDisplay.textContent = `Rs. ${total.toLocaleString('en-IN')}`;
  
  if (badge) {
    badge.textContent = tierName;
    if (count >= 50) {
      badge.style.backgroundColor = 'rgba(16, 185, 129, 0.12)';
      badge.style.color = 'var(--color-success)';
      badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    } else if (count >= 10) {
      badge.style.backgroundColor = 'rgba(99, 102, 241, 0.12)';
      badge.style.color = 'var(--color-primary)';
      badge.style.borderColor = 'var(--border-color-glow)';
    } else {
      badge.style.backgroundColor = 'rgba(251, 191, 36, 0.12)';
      badge.style.color = 'var(--color-warning)';
      badge.style.borderColor = 'rgba(251, 191, 36, 0.3)';
    }
  }

  if (savings) {
    if (count >= 50) {
      savings.textContent = `Save Rs. ${(count * 50).toLocaleString('en-IN')}/mo (Rs. 99/client)`;
    } else if (count >= 10) {
      savings.textContent = `Save Rs. ${(count * 30).toLocaleString('en-IN')}/mo (Rs. 119/client)`;
    } else {
      savings.textContent = 'Link 10+ clients to save 20%';
    }
  }
}

/**
 * Checks if CA is already logged in
 */
function checkAuth() {
  const caDataStr = localStorage.getItem('taxbot_ca_session');
  if (caDataStr) {
    try {
      const caData = JSON.parse(caDataStr);
      if (!caData.csrfToken) {
        throw new Error('Legacy session missing CSRF token');
      }
      showDashboard(caData);
    } catch (e) {
      localStorage.removeItem('taxbot_ca_session');
      showAuth();
    }
  } else {
    showAuth();
  }
}

function showDashboard(caData) {
  document.getElementById('auth-container').style.display = 'none';
  document.getElementById('console-container').style.display = 'flex';
  
  document.getElementById('ca-display-name').textContent = caData.name;
  document.getElementById('ca-display-email').textContent = caData.email || caData.firm_name || 'Partner';
  
  // Set default period picker
  const picker = document.getElementById('report-period-picker');
  if (picker && !picker.value) {
    picker.value = new Date().toISOString().substring(0, 7);
  }

  loadClients();
  loadConsolidatedGSTReport();
}

function showAuth() {
  document.getElementById('auth-container').style.display = 'flex';
  document.getElementById('console-container').style.display = 'none';
  
  // If ?action=register is in URL, switch to sign up
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('action') === 'register') {
    switchToRegister();
  }
}

function setupAuthToggles() {
  const switchBtn = document.getElementById('btn-switch-auth');
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const switchText = document.getElementById('auth-switch-text');

  if (!switchBtn) return;

  switchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (loginForm.style.display !== 'none') {
      switchToRegister();
    } else {
      switchToLogin();
    }
  });

  window.switchToRegister = function() {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    title.textContent = 'CA Partner Sign Up';
    subtitle.textContent = 'Create a partner account to manage client folders.';
    switchText.textContent = 'Already have an account?';
    switchBtn.textContent = 'Sign In';
  };

  window.switchToLogin = function() {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    title.textContent = 'CA Partner Login';
    subtitle.textContent = 'Access your reseller dashboard and bulk client files.';
    switchText.textContent = "Don't have a partner account?";
    switchBtn.textContent = 'Sign Up';
  };
}

function setupAuthSubmits() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      try {
        const res = await fetch('/api/ca/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Login failed');
        }

        localStorage.setItem('taxbot_ca_session', JSON.stringify({ ...data.ca, csrfToken: data.csrfToken }));
        showToast('Login successful! Welcome to CA dashboard.', 'success');
        showDashboard({ ...data.ca, csrfToken: data.csrfToken });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value;
      const email = document.getElementById('reg-email').value;
      const firmName = document.getElementById('reg-firm').value;
      const password = document.getElementById('reg-password').value;

      try {
        const res = await fetch('/api/ca/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ name, email, password, firmName }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Registration failed');
        }

        showToast('Account created! Please sign in with your credentials.', 'success');
        switchToLogin();
        document.getElementById('login-email').value = email;
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/ca/logout', {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'same-origin',
        });
      } catch (err) {
        console.warn('Logout request failed:', err);
      }
      localStorage.removeItem('taxbot_ca_session');
      showToast('Logged out successfully.', 'success');
      showAuth();
    });
  }
}

/**
 * CA Dashboard Tab & Dialog controllers
 */
function setupDashboardInteractions() {
  // Tab switcher
  const sidebarItems = document.querySelectorAll('.sidebar-item');
  sidebarItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Remove active from all sidebar items and panes
      sidebarItems.forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
      
      // Set active
      item.classList.add('active');
      const tabId = item.getAttribute('data-tab');
      document.getElementById(tabId).style.display = 'block';
      
      // Update heading descriptions
      const title = document.getElementById('tab-title');
      const subtitle = document.getElementById('tab-subtitle');
      const actions = document.getElementById('btn-add-client-modal');
      
      if (tabId === 'clients-tab') {
        title.textContent = 'Clients Bookkeeping Ledgers';
        subtitle.textContent = 'View WhatsApp transaction files and export records in bulk.';
        actions.style.display = 'block';
        loadClients();
      } else if (tabId === 'gst-report-tab') {
        title.textContent = 'Consolidated GSTR Dashboard';
        subtitle.textContent = 'Aggregated Sales and Input Tax Credit (ITC) tracking for the month.';
        actions.style.display = 'none';
        loadConsolidatedGSTReport();
      } else if (tabId === 'reseller-pricing-tab') {
        title.textContent = 'License Calculator & Pricing';
        subtitle.textContent = 'Manage pricing tiers and link clients to automatically claim bulk discounts.';
        actions.style.display = 'none';
        // Trigger dashboard calculator update
        updateCalculator('reseller-slider', 'reseller-slider-count-display', 'reseller-unit-price', 'reseller-total-bill', 'reseller-tier-indicator', 'reseller-discount-display');
      }
    });
  });

  // Client Modal Trigger
  const modal = document.getElementById('modal-add-client');
  const addClientBtn = document.getElementById('btn-add-client-modal');
  const closeClientModalBtn = document.getElementById('btn-close-client-modal');
  const addClientForm = document.getElementById('add-client-form');

  if (addClientBtn && modal) {
    addClientBtn.addEventListener('click', () => modal.classList.add('active'));
  }
  if (closeClientModalBtn && modal) {
    closeClientModalBtn.addEventListener('click', () => modal.classList.remove('active'));
  }

  if (addClientForm) {
    addClientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const caSession = getCASession();
      if (!caSession) return;

      const name = document.getElementById('client-name').value;
      const phone = document.getElementById('client-phone').value;
      const businessName = document.getElementById('client-business').value;
      const gstin = document.getElementById('client-gstin').value;
      const plan = document.getElementById('client-plan').value;
      const gstRegistered = document.getElementById('client-gst-registered').value === 'true';

      try {
        const res = await fetch('/api/ca/clients', {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ name, phone, businessName, gstin, plan, gstRegistered }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to link client');
        }

        showToast('Client added and linked successfully!', 'success');
        modal.classList.remove('active');
        addClientForm.reset();
        loadClients();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Drawer Ledger Closer
  const ledgerDrawer = document.getElementById('drawer-ledger');
  const closeLedgerDrawerBtn = document.getElementById('btn-close-ledger-drawer');
  if (closeLedgerDrawerBtn && ledgerDrawer) {
    closeLedgerDrawerBtn.addEventListener('click', () => ledgerDrawer.classList.remove('active'));
  }

  // GSTR period picker listener
  const reportPeriodPicker = document.getElementById('report-period-picker');
  if (reportPeriodPicker) {
    reportPeriodPicker.addEventListener('change', () => {
      loadConsolidatedGSTReport();
    });
  }
}

/**
 * Returns parsed CA session data
 */
function getCASession() {
  const caDataStr = localStorage.getItem('taxbot_ca_session');
  if (!caDataStr) {
    showAuth();
    return null;
  }
  return JSON.parse(caDataStr);
}

function getAuthHeaders(extraHeaders = {}) {
  const caSession = getCASession();
  if (!caSession || !caSession.csrfToken) {
    throw new Error('Session expired. Please login again.');
  }
  return {
    ...extraHeaders,
    'X-CSRF-Token': caSession.csrfToken
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

/**
 * Fetches clients and populates table
 */
async function loadClients() {
  const caSession = getCASession();
  if (!caSession) return;

  const tableBody = document.getElementById('clients-table-body');
  const countDisplay = document.getElementById('metric-clients-count');
  const tierDisplay = document.getElementById('metric-reseller-tier');

  try {
    const res = await fetch('/api/ca/clients', {
      headers: getAuthHeaders(),
    });

    if (!res.ok) throw new Error('Could not load clients');
    const clients = await res.json();

    countDisplay.textContent = clients.length;

    // Calculate active tier pricing unit
    let unitPrice = 149;
    if (clients.length >= 50) {
      unitPrice = 99;
    } else if (clients.length >= 10) {
      unitPrice = 119;
    }
    tierDisplay.textContent = `Rs. ${unitPrice}/mo`;

    // Populate Slider in pricing tab with current count
    const slider = document.getElementById('reseller-slider');
    if (slider) {
      slider.value = Math.max(1, clients.length);
      updateCalculator('reseller-slider', 'reseller-slider-count-display', 'reseller-unit-price', 'reseller-total-bill', 'reseller-tier-indicator', 'reseller-discount-display');
    }

    if (clients.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-dim); padding: 30px;">
            No clients added yet. Click "Add New Client" to start managing business ledgers.
          </td>
        </tr>`;
      return;
    }

    tableBody.innerHTML = '';
    clients.forEach(client => {
      const row = document.createElement('tr');
      const joinedDate = new Date(client.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
      
      row.innerHTML = `
        <td>
          <div style="font-weight:600; color: #f8fafc;">${escapeHtml(client.business_name || 'Unnamed Shop')}</div>
          <div style="font-size:12px; color: #94a3b8;">${escapeHtml(client.name || 'Owner')}</div>
        </td>
        <td style="color: #cbd5e1; font-weight: 500;">+${escapeHtml(client.phone)}</td>
        <td><code style="font-family: 'JetBrains Mono', monospace; color: #c3c0ff; font-weight: 500;">${escapeHtml(client.gstin || 'N/A')}</code></td>
        <td><span class="badge-status ${escapeHtml(client.plan)}">${escapeHtml(client.plan).toUpperCase()}</span></td>
        <td style="color: #94a3b8;">${joinedDate}</td>
        <td style="text-align: right;">
          <div class="action-buttons flex items-center justify-end gap-2" style="justify-content: flex-end;">
            <button class="action-btn view-ledger-btn" title="View Ledger Drawer" data-id="${client.id}">
              <span class="material-symbols-outlined text-[18px]">menu_book</span>
            </button>
            <button class="action-btn download-csv-btn" title="Download Excel CSV" data-id="${client.id}">
              <span class="material-symbols-outlined text-[18px]">table_chart</span>
            </button>
            <button class="action-btn download-tally-btn" title="Download Tally XML" data-id="${client.id}">
              <span class="material-symbols-outlined text-[18px]">inventory_2</span>
            </button>
          </div>
        </td>
      `;
      tableBody.appendChild(row);
    });

    // Attach listeners to dynamically created buttons
    document.querySelectorAll('.view-ledger-btn').forEach(btn => {
      btn.addEventListener('click', () => openLedgerDrawer(btn.getAttribute('data-id')));
    });

    document.querySelectorAll('.download-csv-btn').forEach(btn => {
      btn.addEventListener('click', () => downloadClientFile(btn.getAttribute('data-id'), 'csv'));
    });

    document.querySelectorAll('.download-tally-btn').forEach(btn => {
      btn.addEventListener('click', () => downloadClientFile(btn.getAttribute('data-id'), 'xml'));
    });

  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Slide out ledger drawer and show transaction details
 */
async function openLedgerDrawer(clientId) {
  const caSession = getCASession();
  if (!caSession) return;

  const drawer = document.getElementById('drawer-ledger');
  const drawerClientName = document.getElementById('drawer-client-name');
  const drawerClientPhone = document.getElementById('drawer-client-phone');
  const drawerClientGstin = document.getElementById('drawer-client-gstin');
  const drawerClientPlan = document.getElementById('drawer-client-plan');
  const drawerTransactionsBody = document.getElementById('drawer-transactions-body');

  try {
    const res = await fetch(`/api/ca/clients/${clientId}/transactions`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) throw new Error('Failed to fetch client transactions');
    const data = await res.json();

    drawerClientName.textContent = data.client.business_name || data.client.name || 'Client Details';
    drawerClientPhone.textContent = `Phone: +${data.client.phone}`;
    drawerClientGstin.textContent = data.client.gstin || 'N/A';
    drawerClientPlan.innerHTML = `<span class="badge-status ${escapeHtml(data.client.plan)}">${escapeHtml(data.client.plan).toUpperCase()}</span>`;

    // Map exports buttons
    document.getElementById('drawer-export-csv').onclick = (e) => {
      e.preventDefault();
      downloadClientFile(clientId, 'csv');
    };
    document.getElementById('drawer-export-tally').onclick = (e) => {
      e.preventDefault();
      downloadClientFile(clientId, 'xml');
    };

    if (data.transactions.length === 0) {
      drawerTransactionsBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-dim); padding: 30px;">
            No transactions logged under this client ledger.
          </td>
        </tr>`;
    } else {
      drawerTransactionsBody.innerHTML = '';
      data.transactions.forEach(tx => {
        const tr = document.createElement('tr');
        const amountFormatted = `Rs. ${Number(tx.amount).toFixed(2)}`;
        const taxFormatted = `Rs. ${Number(tx.tax_amount || 0).toFixed(2)}`;
        
        tr.innerHTML = `
          <td>${escapeHtml(tx.date)}</td>
          <td><span style="text-transform: capitalize; font-weight: 500; color: ${tx.category === 'sales' ? 'var(--color-success)' : 'var(--text-main)'}">${escapeHtml(tx.category)}</span></td>
          <td>${escapeHtml(tx.vendor_name || 'Cash Sale')}</td>
          <td style="font-weight: 600;">${amountFormatted}</td>
          <td>${taxFormatted} (${escapeHtml(tx.gst_rate)}%)</td>
          <td><span class="badge-source ${escapeHtml(tx.source)}">${escapeHtml(String(tx.source || '').replace('whatsapp_', ''))}</span></td>
        `;
        drawerTransactionsBody.appendChild(tr);
      });
    }

    drawer.classList.add('active');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Trigger secure file exports by downloading ledger XML or CSV via JS
 */
async function downloadClientFile(clientId, format) {
  const period = new Date().toISOString().substring(0, 7);
  
  // Since we require a secure cryptographic token on the server for GET /export/:clientId,
  // we will generate a temporary signed token. Wait, since we are in the CA Dashboard, we can fetch
  // the client transactions via `/api/ca/clients/:id/transactions` and construct the files directly in frontend!
  // This is highly robust, avoids adding endpoints, and downloads instantly.

  const caSession = getCASession();
  if (!caSession) return;

  try {
    showToast(`Generating ${format.toUpperCase()} ledger export...`, 'success');
    const res = await fetch(`/api/ca/clients/${clientId}/transactions?period=${period}`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) throw new Error('Export compilation failed');
    const data = await res.json();

    const transactions = data.transactions;
    const businessName = data.client.business_name || data.client.name || 'Client Account';
    let fileContent = '';
    let mimeType = '';
    let fileName = safeExportFilename(`TaxBot_${businessName}_${period}`);

    if (format === 'csv') {
      mimeType = 'text/csv;charset=utf-8;';
      fileName += '.csv';
      
      const headers = ['Date', 'Vendor/Party', 'Category', 'GST Category', 'GST Rate (%)', 'Amount (Excl. Tax)', 'GST Tax Amount', 'Total Amount', 'Invoice Number', 'Description', 'Source'];
      const rows = transactions.map(tx => {
        const total = Number(tx.amount) + Number(tx.tax_amount || 0);
        return [
          csvCell(tx.date),
          csvCell(tx.vendor_name || ''),
          csvCell(String(tx.category || '').toUpperCase()),
          csvCell(tx.gst_category || 'B2C'),
          tx.gst_rate,
          tx.amount,
          tx.tax_amount || 0,
          total,
          csvCell(tx.invoice_number || ''),
          csvCell(tx.description || ''),
          csvCell(tx.source)
        ].join(',');
      });
      fileContent = [headers.join(','), ...rows].join('\r\n');
    } else {
      // Tally XML format
      mimeType = 'application/xml;charset=utf-8;';
      fileName += '.xml';

      const cGstin = data.client.gstin ? data.client.gstin.trim().toUpperCase() : '';
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>\n  <HEADER>\n    <TALLYREQUEST>Import Data</TALLYREQUEST>\n  </HEADER>\n  <BODY>\n    <IMPORTDATA>\n      <REQUESTDESC>\n        <REPORTNAME>Vouchers</REPORTNAME>\n      </REQUESTDESC>\n      <REQUESTDATA>\n`;

      transactions.forEach(tx => {
        const tallyDate = tx.date.replace(/-/g, '');
        const amount = Number(tx.amount);
        const tax = Number(tx.tax_amount || 0);
        const total = amount + tax;
        const vendor = tx.vendor_name || 'Cash/Sundry Creditor';
        const invoiceNo = tx.invoice_number || '';
        const desc = tx.description || `${tx.category} transaction`;
        const vGstin = tx.vendor_gstin ? tx.vendor_gstin.trim().toUpperCase() : '';
        let vchType = tx.category === 'sales' ? 'Sales' : (tx.category === 'purchase' ? 'Purchase' : 'Payment');

        // Determine if it is Intra-State or Inter-State GST split
        let isIntra = true;
        if (cGstin.length >= 2 && vGstin.length >= 2) {
          isIntra = cGstin.substring(0, 2) === vGstin.substring(0, 2);
        }

        xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n          <VOUCHER VCHTYPE="${escapeXml(vchType)}" ACTION="Create">\n            <DATE>${escapeXml(tallyDate)}</DATE>\n            <VOUCHERTYPENAME>${escapeXml(vchType)}</VOUCHERTYPENAME>\n            <REFERENCE>${escapeXml(invoiceNo)}</REFERENCE>\n            <NARRATION>${escapeXml(desc)}</NARRATION>\n            <EFFECTIVEDATE>${escapeXml(tallyDate)}</EFFECTIVEDATE>\n`;

        if (vchType === 'Sales') {
          xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>Cash/Bank Account</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n              <AMOUNT>-${total.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
          xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>Sales Account</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n              <AMOUNT>${amount.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
          
          if (tax > 0) {
            if (isIntra) {
              const halfTax = tax / 2;
              const halfRate = tx.gst_rate / 2;
              const cgstLedger = tx.gst_rate > 0 ? `Output CGST @ ${halfRate}%` : 'Output CGST';
              const sgstLedger = tx.gst_rate > 0 ? `Output SGST @ ${halfRate}%` : 'Output SGST';

              xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${escapeXml(cgstLedger)}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n              <AMOUNT>${halfTax.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
              xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${escapeXml(sgstLedger)}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n              <AMOUNT>${halfTax.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
            } else {
              const igstLedger = tx.gst_rate > 0 ? `Output IGST @ ${tx.gst_rate}%` : 'Output IGST';
              xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${escapeXml(igstLedger)}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n              <AMOUNT>${tax.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
            }
          }
        } else if (vchType === 'Purchase') {
          xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>Purchase Account</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n              <AMOUNT>${amount.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
          
          if (tax > 0) {
            if (isIntra) {
              const halfTax = tax / 2;
              const halfRate = tx.gst_rate / 2;
              const cgstLedger = tx.gst_rate > 0 ? `Input CGST @ ${halfRate}%` : 'Input CGST';
              const sgstLedger = tx.gst_rate > 0 ? `Input SGST @ ${halfRate}%` : 'Input SGST';

              xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${escapeXml(cgstLedger)}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n              <AMOUNT>${halfTax.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
              xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${escapeXml(sgstLedger)}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n              <AMOUNT>${halfTax.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
            } else {
              const igstLedger = tx.gst_rate > 0 ? `Input IGST @ ${tx.gst_rate}%` : 'Input IGST';
              xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${escapeXml(igstLedger)}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n              <AMOUNT>${tax.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
            }
          }
          xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${escapeXml(vendor)}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n              <AMOUNT>-${total.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
        } else {
          const expenseLedgerName = tx.description ? `${tx.description.substring(0, 30)} Ledger` : 'General Expense';
          xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${escapeXml(expenseLedgerName)}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n              <AMOUNT>${amount.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
          
          if (tax > 0) {
            if (isIntra) {
              const halfTax = tax / 2;
              const halfRate = tx.gst_rate / 2;
              const cgstLedger = tx.gst_rate > 0 ? `Input CGST @ ${halfRate}%` : 'Input CGST';
              const sgstLedger = tx.gst_rate > 0 ? `Input SGST @ ${halfRate}%` : 'Input SGST';

              xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${escapeXml(cgstLedger)}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n              <AMOUNT>${halfTax.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
              xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${escapeXml(sgstLedger)}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n              <AMOUNT>${halfTax.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
            } else {
              const igstLedger = tx.gst_rate > 0 ? `Input IGST @ ${tx.gst_rate}%` : 'Input IGST';
              xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>${escapeXml(igstLedger)}</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n              <AMOUNT>${tax.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
            }
          }
          xml += `            <ALLLEDGERENTRIES.LIST>\n              <LEDGERNAME>Cash/Bank Account</LEDGERNAME>\n              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n              <AMOUNT>-${total.toFixed(2)}</AMOUNT>\n            </ALLLEDGERENTRIES.LIST>\n`;
        }
        xml += `          </VOUCHER>\n        </TALLYMESSAGE>\n`;
      });

      xml += `      </REQUESTDATA>\n    </IMPORTDATA>\n  </BODY>\n</ENVELOPE>`;
      fileContent = xml;
    }

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
      showToast('Export downloaded successfully!', 'success');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Loads consolidated GSTR parameters and details
 */
async function loadConsolidatedGSTReport() {
  const caSession = getCASession();
  if (!caSession) return;

  const periodPicker = document.getElementById('report-period-picker');
  const period = periodPicker ? periodPicker.value : new Date().toISOString().substring(0, 7);

  const salesDisplay = document.getElementById('gst-metric-sales');
  const itcDisplay = document.getElementById('gst-metric-itc');
  const payableDisplay = document.getElementById('gst-metric-payable');
  const tableBody = document.getElementById('gst-report-table-body');

  try {
    const res = await fetch(`/api/ca/reports/gst?period=${period}`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) throw new Error('Could not compile consolidated GSTR report');
    const report = await res.json();

    salesDisplay.textContent = `Rs. ${report.totalOutwardTaxableValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    itcDisplay.textContent = `Rs. ${report.totalInwardTaxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    payableDisplay.textContent = `Rs. ${report.netGstPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    if (report.incomplete && report.warnings?.length) {
      showToast('GSTR report compiled with review-needed client calculations.', 'warning');
    }

    if (report.clientBreakdown.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-dim); padding: 30px;">
            No client records found.
          </td>
        </tr>`;
      return;
    }

    tableBody.innerHTML = '';
    report.clientBreakdown.forEach(client => {
      const tr = document.createElement('tr');
      const netLiability = Math.max(0, client.outwardTax - client.inwardTax);
      const calculationStatus = client.calculationStatus === 'error' ? 'Review Required' : 'OK';
      
      tr.innerHTML = `
        <td><div style="font-weight:600;">${escapeHtml(client.businessName || client.clientName || 'Unknown Client')}</div></td>
        <td><code style="font-family:monospace;">${escapeHtml(client.gstin || 'N/A')}</code></td>
        <td>Rs. ${client.outwardTaxable.toFixed(2)}</td>
        <td>Rs. ${client.outwardTax.toFixed(2)}</td>
        <td>Rs. ${client.inwardTaxable.toFixed(2)}</td>
        <td>Rs. ${client.inwardTax.toFixed(2)}</td>
        <td style="text-align: right; font-weight:700; color:${netLiability > 0 ? 'var(--color-danger)' : 'var(--color-success)'}">
          Rs. ${netLiability.toFixed(2)}
          ${client.calculationStatus === 'error' ? `<br><span style="font-size:11px;color:var(--color-warning);">${escapeHtml(calculationStatus)}</span>` : ''}
        </td>
      `;
      tableBody.appendChild(tr);
    });

    // Handle CSV export of the report
    document.getElementById('btn-export-consolidated-gst').onclick = () => {
      const headers = ['Business Name', 'GSTIN', 'Outward Taxable Value', 'Outward Tax', 'Inward Taxable Value', 'Inward Tax (ITC)', 'Net GST Liability'];
      const rows = report.clientBreakdown.map(c => {
        const net = Math.max(0, c.outwardTax - c.inwardTax);
        return [
          csvCell(c.businessName || c.clientName || 'Unknown Client'),
          csvCell(c.gstin || 'N/A'),
          c.outwardTaxable,
          c.outwardTax,
          c.inwardTaxable,
          c.inwardTax,
          net
        ].join(',');
      });
      const csv = [headers.join(','), ...rows].join('\r\n');
      
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.setAttribute('href', URL.createObjectURL(blob));
      link.setAttribute('download', `TaxBot_Consolidated_GST_${period}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Consolidated GST summary downloaded!', 'success');
    };

  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Toast Alerts Helper
 */
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.className = `toast show ${type}`;
  toast.querySelector('.toast-message').textContent = message;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

/**
 * Sets up clickable security cards and dynamic modal details on the landing page
 */
function setupSecurityModals() {
  const modal = document.getElementById('modal-security');
  const closeBtn = document.getElementById('btn-close-sec-modal');
  const title = document.getElementById('sec-modal-title');
  const body = document.getElementById('sec-modal-body');

  const cardEncryption = document.getElementById('card-sec-encryption');
  const cardResidency = document.getElementById('card-sec-residency');
  const cardCompliance = document.getElementById('card-sec-compliance');

  if (!modal || !closeBtn) return;

  const openModal = (modalTitle, modalHtml) => {
    title.textContent = modalTitle;
    body.innerHTML = modalHtml;
    modal.classList.add('active');
  };

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });

  if (cardEncryption) {
    cardEncryption.addEventListener('click', () => {
      const html = `
        <p style="margin-bottom:16px;"><strong>Authenticated console access:</strong></p>
        <p style="margin-bottom:16px;">TaxBot protects CA console workflows with authenticated sessions, scoped route checks, CSRF protection, and signed public links where external access is required.</p>
        <p style="margin-bottom:16px;"><strong>Security boundary:</strong></p>
        <pre style="background:rgba(255,255,255,0.03); padding:16px; border-radius:8px; font-family:monospace; font-size:12px; border:1px solid var(--border-color); margin-bottom:16px; color:#fff;">
[User Phone]
     | WhatsApp message
     v
[Meta Cloud Gateway API]
     | HTTPS webhook
     v
[TaxBot App Server (Render HTTPS)]
     | Authenticated database access
     v
[Supabase Database]
        </pre>
        <p>Webhook signatures and server-side authorization checks are used to reduce the risk of unauthorized message or ledger access.</p>
      `;
      openModal('Authenticated CA Access', html);
    });
  }

  if (cardResidency) {
    cardResidency.addEventListener('click', () => {
      const html = `
        <p style="margin-bottom:16px;"><strong>Operational audit trail:</strong></p>
        <p style="margin-bottom:16px;">TaxBot records important console activity with the CA, client, action type, description, and timestamp so bookkeeping decisions are easier to review later.</p>
        <p style="margin-bottom:16px;"><strong>Tracked context:</strong></p>
        <ul style="margin-left:20px; margin-bottom:16px; display:flex; flex-direction:column; gap:8px;">
          <li><strong>Actor:</strong> Which CA or service action made the change.</li>
          <li><strong>Client:</strong> Which business record was affected.</li>
          <li><strong>Event:</strong> What happened and when it happened.</li>
        </ul>
        <p>This supports review and support workflows without claiming that the audit trail replaces statutory compliance review.</p>
      `;
      openModal('Audit Trail Visibility', html);
    });
  }

  if (cardCompliance) {
    cardCompliance.addEventListener('click', () => {
      const html = `
        <p style="margin-bottom:16px;"><strong>CA review before filing:</strong></p>
        <p style="margin-bottom:16px;">TaxBot assists with bookkeeping capture, extraction, regular-GST summaries, and Tally-ready exports. It does not file returns or replace professional CA review.</p>
        <p style="margin-bottom:16px;"><strong>Review signals:</strong></p>
        <ul style="margin-left:20px; margin-bottom:16px; display:flex; flex-direction:column; gap:8px;">
          <li><strong>Status:</strong> Draft, confirmed, needs review, or rejected.</li>
          <li><strong>Reason:</strong> Low-confidence AI extraction or duplicate-candidate warnings.</li>
          <li><strong>Source:</strong> WhatsApp text, OCR, document upload, or manual entry.</li>
        </ul>
        <p>Confirmed entries can be exported for downstream accounting workflows after review.</p>
      `;
      openModal('Review Before Filing', html);
    });
  }
}
