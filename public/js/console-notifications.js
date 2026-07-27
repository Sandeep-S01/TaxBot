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
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      window.dispatchEvent(new CustomEvent('taxbot:shell-menu-open', {
        detail: { source: 'notifications' }
      }));
      renderNotificationsList();
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
    list.innerHTML = `
      <div class="empty-state" style="padding: 24px;">
        <i data-lucide="bell-off" style="width:24px;height:24px;color:var(--text-muted);margin-bottom:8px;"></i>
        <p class="text-secondary" style="font-size:13px;margin:0;">No notifications yet</p>
      </div>
    `;
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
        if (menu) menu.classList.add('hidden');
        if (button) button.setAttribute('aria-expanded', 'false');
        if (typeof notif.action === 'function') notif.action();
      }
    });
  });

  initIcons();
}

function setupMockNotifications() {
  const clientName = (c) => String(c?.name || c?.business_name || c?.clientName || '');
  const acme = globalClientsList.find(c => clientName(c).toLowerCase().includes('acme')) || globalClientsList[0];
  const patel = globalClientsList.find(c => clientName(c).toLowerCase().includes('patel')) || globalClientsList[1] || globalClientsList[0];
  const sharma = globalClientsList.find(c => clientName(c).toLowerCase().includes('sharma')) || globalClientsList[2] || globalClientsList[0];

  globalNotifications = [
    {
      id: 'notif-1',
      title: 'GST ITC Mismatch Detected',
      desc: `Mismatched GSTR-2B purchase invoices for ${acme ? clientName(acme) : 'Acme Corp'} (INR 45,200).`,
      time: '10m ago',
      unread: true,
      type: 'critical',
      action: () => {
        if (acme) {
          window.location.hash = `client/${acme.id}`;
        } else {
          window.location.hash = 'gst';
        }
      },
    },
    {
      id: 'notif-2',
      title: 'New Client Voice Note',
      desc: `Voice note file processed for ${patel ? clientName(patel) : 'Patel Kirana Store'}.`,
      time: '1h ago',
      unread: true,
      type: 'success',
      action: () => {
        if (patel) {
          activeClientId = patel.id;
          window.location.hash = `client/${patel.id}`;
          setTimeout(() => {
            const docTab = document.querySelector('[data-ws-tab="documents"]');
            if (docTab) docTab.click();
          }, 100);
        } else {
          window.location.hash = 'documents';
        }
      },
    },
    {
      id: 'notif-3',
      title: 'GSTR-1 Ready to File',
      desc: `Ledger check 100% complete for ${sharma ? clientName(sharma) : 'Sandeep Sharma'}.`,
      time: '3h ago',
      unread: false,
      type: 'warning',
      action: () => {
        if (sharma) {
          window.location.hash = `client/${sharma.id}`;
          setTimeout(() => {
            const gstTab = document.querySelector('[data-ws-tab="gst"]');
            if (gstTab) gstTab.click();
          }, 100);
        } else {
          window.location.hash = 'gst';
        }
      },
    },
  ];

  updateNotificationIndicator();
}
