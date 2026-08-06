/* ==========================================================================
   TaxBot CA Console - Notifications Tray
   Owns the header notification menu state, rendering, and demo notification wiring.
   ========================================================================== */

let globalNotifications = [];

function initNotifications() {
  const btn = document.getElementById('notification-btn');
  const menu = document.getElementById('notifications-dropdown-menu');
  const markAllReadBtn = document.getElementById('btn-mark-all-read');

  if (!btn || !menu) return;
  if (btn.dataset.notificationsInitialized === 'true') return;
  btn.dataset.notificationsInitialized = 'true';

  const setMenuOpen = (open, restoreFocus = false) => {
    menu.classList.toggle('hidden', !open);
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      window.dispatchEvent(new CustomEvent('taxbot:shell-menu-open', {
        detail: { source: 'notifications' }
      }));
      renderNotificationsList();
      const firstItem = menu.querySelector('.notification-item, #btn-mark-all-read:not([disabled])');
      requestAnimationFrame(() => (firstItem || menu).focus());
    } else if (restoreFocus) {
      btn.focus();
    }
  };

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    setMenuOpen(menu.classList.contains('hidden'));
  });

  menu.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => setMenuOpen(false));
  window.addEventListener('taxbot:shell-modal-open', () => setMenuOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.classList.contains('hidden')) {
      setMenuOpen(false, true);
    }
  });

  if (markAllReadBtn) {
    markAllReadBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      globalNotifications.forEach((notification) => {
        notification.unread = false;
      });
      renderNotificationsList();
      updateNotificationIndicator();
    });
  }

  updateNotificationIndicator();
}

function updateNotificationIndicator() {
  const unreadCount = globalNotifications.filter(n => n.unread).length;
  const indicator = document.querySelector('#notification-btn .indicator-dot');
  const button = document.getElementById('notification-btn');
  if (indicator) {
    indicator.classList.toggle('hidden', unreadCount === 0);
  }
  if (button) {
    button.setAttribute('aria-label', unreadCount > 0
      ? `Notifications, ${unreadCount} unread`
      : 'Notifications, none unread');
  }
}

function renderNotificationsList() {
  const list = document.getElementById('notifications-list');
  const markAllReadBtn = document.getElementById('btn-mark-all-read');
  if (!list) return;

  if (markAllReadBtn) {
    markAllReadBtn.disabled = !globalNotifications.some(notification => notification.unread);
  }

  if (globalNotifications.length === 0) {
    list.innerHTML = renderEmptyState('No notifications yet. New client and filing alerts will appear here.');
    initIcons();
    return;
  }

  list.innerHTML = globalNotifications.map((n) => {
    let icon = 'bell';
    let iconClass = 'notification-info';
    if (n.type === 'critical' || String(n.title).includes('Mismatch')) {
      icon = 'alert-triangle';
      iconClass = 'notification-critical';
    } else if (n.type === 'success' || String(n.title).includes('Voice')) {
      icon = 'mic';
      iconClass = 'notification-success';
    } else if (n.type === 'warning' || String(n.title).includes('Ready')) {
      icon = 'check-circle';
      iconClass = 'notification-warning';
    }

    return `
      <div role="listitem">
        <button type="button" class="notification-item ${n.unread ? 'unread' : ''}" data-notif-id="${escapeHtml(n.id)}">
          <span class="notification-icon-wrap ${iconClass}">
            <i data-lucide="${icon}" style="width:14px;height:14px;"></i>
          </span>
          <span class="notification-content">
            <span class="notification-title">${escapeHtml(n.title)}</span>
            <span class="notification-desc">${escapeHtml(n.desc)}</span>
            <span class="notification-time">${escapeHtml(n.time)}</span>
          </span>
        </button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.notification-item').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-notif-id');
      const notif = globalNotifications.find(n => n.id === id);
      if (notif) {
        notif.unread = false;
        updateNotificationIndicator();
        const menu = document.getElementById('notifications-dropdown-menu');
        const button = document.getElementById('notification-btn');
        if (menu) {
          menu.classList.add('hidden');
          menu.hidden = true;
        }
        if (button) button.setAttribute('aria-expanded', 'false');
        if (typeof notif.action === 'function') notif.action();
      }
    });
  });

  initIcons();
}

function setupMockNotifications() {
  const clientName = (c) => String(c?.name || c?.business_name || c?.clientName || '');
  const readyClient = globalClientsList.find(c => c.filedStatus === 'Ready');
  const latestDocument = globalDocuments[0];

  globalNotifications = globalInsights.slice(0, 3).map((insight, index) => ({
    id: `notif-insight-${insight.id || index}`,
    title: insight.title || 'Client Review Needed',
    desc: insight.desc || `Review ${clientName(insight) || 'client'} before the next filing cycle.`,
    time: index === 0 ? 'Just now' : `${index + 1}h ago`,
    unread: insight.severity === 'high',
    type: insight.severity === 'high' ? 'critical' : 'warning',
    action: () => {
      if (insight.clientId) {
        window.location.hash = `client/${insight.clientId}`;
      } else {
        window.location.hash = 'insights';
      }
    },
  }));

  if (latestDocument) {
    globalNotifications.unshift({
      id: `notif-doc-${latestDocument.id}`,
      title: 'New Document Parsed',
      desc: `${latestDocument.name || 'Document'} processed for ${latestDocument.clientName || 'client'}.`,
      time: latestDocument.received || 'Just now',
      unread: false,
      type: 'success',
      action: () => { window.location.hash = 'documents'; },
    });
  }

  if (readyClient) {
    globalNotifications.push({
      id: `notif-ready-${readyClient.id}`,
      title: 'GSTR-1 Ready to File',
      desc: `Ledger check complete for ${clientName(readyClient) || 'client'}.`,
      time: 'Today',
      unread: false,
      type: 'warning',
      action: () => { window.location.hash = 'gst'; },
    });
  }

  updateNotificationIndicator();
}
