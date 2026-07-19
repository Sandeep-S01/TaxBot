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

  btn.onclick = (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
    renderNotificationsList();
  };

  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('hidden') && !menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });

  if (markAllReadBtn) {
    markAllReadBtn.onclick = (e) => {
      e.stopPropagation();
      globalNotifications.forEach(n => n.unread = false);
      renderNotificationsList();
      updateNotificationIndicator();
    };
  }
}

function updateNotificationIndicator() {
  const hasUnread = globalNotifications.some(n => n.unread);
  const indicator = document.querySelector('#notification-btn .indicator-dot');
  if (indicator) {
    if (hasUnread) {
      indicator.classList.remove('hidden');
    } else {
      indicator.classList.add('hidden');
    }
  }
}

function renderNotificationsList() {
  const list = document.getElementById('notifications-list');
  if (!list) return;

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

  list.innerHTML = globalNotifications.map(n => {
    let icon = 'bell';
    let iconClass = 'bg-primary-light text-primary';
    if (n.title.includes('Mismatch')) {
      icon = 'alert-triangle';
      iconClass = 'bg-danger-light text-error';
    } else if (n.title.includes('Voice')) {
      icon = 'mic';
      iconClass = 'bg-success-light text-success';
    } else if (n.title.includes('Ready')) {
      icon = 'check-circle';
      iconClass = 'bg-warning-light text-warning';
    }

    return `
      <div class="notification-item ${n.unread ? 'unread' : ''}" data-notif-id="${escapeHtml(n.id)}">
        <div class="notification-icon-wrap ${iconClass}">
          <i data-lucide="${icon}" style="width:14px;height:14px;"></i>
        </div>
        <div class="notification-content">
          <span class="notification-title">${escapeHtml(n.title)}</span>
          <span class="notification-desc">${escapeHtml(n.desc)}</span>
          <span class="notification-time">${escapeHtml(n.time)}</span>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.notification-item').forEach(el => {
    el.onclick = () => {
      const id = el.getAttribute('data-notif-id');
      const notif = globalNotifications.find(n => n.id === id);
      if (notif) {
        notif.unread = false;
        updateNotificationIndicator();
        document.getElementById('notifications-dropdown-menu').classList.add('hidden');
        notif.action();
      }
    };
  });

  initIcons();
}

function setupMockNotifications() {
  const acme = globalClientsList.find(c => c.name.toLowerCase().includes('acme')) || globalClientsList[0];
  const patel = globalClientsList.find(c => c.name.toLowerCase().includes('patel')) || globalClientsList[1] || globalClientsList[0];
  const sharma = globalClientsList.find(c => c.name.toLowerCase().includes('sharma')) || globalClientsList[2] || globalClientsList[0];

  globalNotifications = [
    {
      id: 'notif-1',
      title: 'GST ITC Mismatch Detected',
      desc: `Mismatched GSTR-2B purchase invoices for ${acme ? acme.name : 'Acme Corp'} (INR 45,200).`,
      time: '10m ago',
      unread: true,
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
      desc: `Voice note file processed for ${patel ? patel.name : 'Patel Kirana Store'}.`,
      time: '1h ago',
      unread: true,
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
      desc: `Ledger check 100% complete for ${sharma ? sharma.name : 'Sandeep Sharma'}.`,
      time: '3h ago',
      unread: false,
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
