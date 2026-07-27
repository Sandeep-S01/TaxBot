(function () {
  'use strict';

  const STORAGE_KEY = 'taxbot_sidebar_collapsed';
  const desktopQuery = window.matchMedia('(min-width: 769px)');

  function readCollapsedPreference() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function saveCollapsedPreference(collapsed) {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // The shell remains usable when storage is unavailable.
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('app-sidebar');
    const collapseButton = document.getElementById('sidebar-toggle');
    const mobileMenuButton = document.getElementById('mobile-menu-toggle');
    const backdrop = document.getElementById('sidebar-backdrop');
    const profileButton = document.getElementById('profile-menu-btn');
    const profileMenu = document.getElementById('profile-menu');
    const profileSettings = document.getElementById('profile-menu-settings');
    const profileLogout = document.getElementById('profile-menu-logout');
    const notificationButton = document.getElementById('notification-btn');
    const notificationMenu = document.getElementById('notifications-dropdown-menu');

    if (!sidebar || !collapseButton || !mobileMenuButton || !backdrop) return;

    function applyCollapsedState(collapsed) {
      const active = desktopQuery.matches && collapsed;
      sidebar.classList.toggle('collapsed', active);
      collapseButton.setAttribute('aria-pressed', String(active));
      collapseButton.setAttribute('aria-label', active ? 'Expand sidebar' : 'Collapse sidebar');
      collapseButton.title = active ? 'Expand sidebar' : 'Collapse sidebar';
    }

    function setDrawerOpen(open, restoreFocus) {
      const active = !desktopQuery.matches && open;
      sidebar.classList.toggle('drawer-open', active);
      backdrop.classList.toggle('active', active);
      document.body.classList.toggle('shell-drawer-open', active);
      mobileMenuButton.setAttribute('aria-expanded', String(active));
      sidebar.setAttribute('aria-hidden', String(!desktopQuery.matches && !active));

      if (active) {
        const firstLink = sidebar.querySelector('.nav-link');
        if (firstLink) requestAnimationFrame(() => firstLink.focus());
      } else if (restoreFocus) {
        mobileMenuButton.focus();
      }
    }

    function setProfileOpen(open, restoreFocus) {
      if (!profileButton || !profileMenu) return;
      profileMenu.hidden = !open;
      profileButton.setAttribute('aria-expanded', String(open));
      if (open) {
        if (notificationMenu) notificationMenu.classList.add('hidden');
        if (notificationButton) notificationButton.setAttribute('aria-expanded', 'false');
        window.dispatchEvent(new CustomEvent('taxbot:shell-menu-open', {
          detail: { source: 'profile' }
        }));
        const firstItem = profileMenu.querySelector('[role="menuitem"]');
        if (firstItem) requestAnimationFrame(() => firstItem.focus());
      } else if (restoreFocus) {
        profileButton.focus();
      }
    }

    applyCollapsedState(readCollapsedPreference());
    setDrawerOpen(false);

    collapseButton.addEventListener('click', () => {
      const collapsed = !sidebar.classList.contains('collapsed');
      applyCollapsedState(collapsed);
      saveCollapsedPreference(collapsed);
    });

    mobileMenuButton.addEventListener('click', () => {
      setDrawerOpen(!sidebar.classList.contains('drawer-open'));
    });
    backdrop.addEventListener('click', () => setDrawerOpen(false, true));
    sidebar.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', () => setDrawerOpen(false));
    });

    if (profileButton && profileMenu) {
      profileButton.addEventListener('click', (event) => {
        event.stopPropagation();
        setProfileOpen(profileMenu.hidden);
      });
      profileMenu.addEventListener('click', (event) => event.stopPropagation());
    }

    if (profileSettings) {
      profileSettings.addEventListener('click', () => {
        setProfileOpen(false);
        window.location.hash = 'settings';
      });
    }

    if (profileLogout) {
      profileLogout.addEventListener('click', () => {
        setProfileOpen(false);
        const logoutButton = document.getElementById('btn-logout');
        if (logoutButton) logoutButton.click();
      });
    }

    if (notificationButton) {
      notificationButton.addEventListener('click', () => setProfileOpen(false));
    }

    window.addEventListener('taxbot:shell-modal-open', () => setProfileOpen(false));
    window.addEventListener('taxbot:shell-menu-open', (event) => {
      if (event.detail?.source !== 'profile') setProfileOpen(false);
    });

    document.addEventListener('click', () => setProfileOpen(false));
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (sidebar.classList.contains('drawer-open')) setDrawerOpen(false, true);
      if (profileMenu && !profileMenu.hidden) setProfileOpen(false, true);
    });

    desktopQuery.addEventListener('change', () => {
      setDrawerOpen(false);
      applyCollapsedState(readCollapsedPreference());
    });
  });
})();
