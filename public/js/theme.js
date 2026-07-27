(function () {
  'use strict';

  const STORAGE_KEY = 'taxbot_theme';
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function getStoredTheme() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch {
      return null;
    }
  }

  function getTheme() {
    return root.classList.contains('dark') ? 'dark' : 'light';
  }

  function syncBody(theme) {
    if (document.body) {
      document.body.classList.toggle('dark-theme', theme === 'dark');
    }
  }

  function apply(theme, options) {
    const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
    const previousTheme = root.dataset.theme;
    const shouldPersist = Boolean(options && options.persist);

    root.classList.toggle('dark', normalizedTheme === 'dark');
    root.dataset.theme = normalizedTheme;
    syncBody(normalizedTheme);

    if (shouldPersist) {
      try {
        localStorage.setItem(STORAGE_KEY, normalizedTheme);
      } catch {
        // Theme still works when storage is unavailable.
      }
    }

    if (previousTheme && previousTheme !== normalizedTheme) {
      document.dispatchEvent(new CustomEvent('taxbot:themechange', {
        detail: { theme: normalizedTheme },
      }));
    }

    return normalizedTheme;
  }

  function toggle() {
    return apply(getTheme() === 'dark' ? 'light' : 'dark', { persist: true });
  }

  function bindToggle(buttons, render) {
    const controls = Array.from(buttons || []).filter(Boolean);

    function update(theme) {
      const isDark = theme === 'dark';
      controls.forEach((button) => {
        button.setAttribute('aria-pressed', String(isDark));
        button.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
        button.title = isDark ? 'Switch to light theme' : 'Switch to dark theme';
      });
      if (render) render(theme);
    }

    controls.forEach((button) => {
      button.addEventListener('click', toggle);
    });
    document.addEventListener('taxbot:themechange', (event) => update(event.detail.theme));
    update(getTheme());
  }

  const initialTheme = getStoredTheme() || (media.matches ? 'dark' : 'light');
  apply(initialTheme);

  document.addEventListener('DOMContentLoaded', () => syncBody(getTheme()), { once: true });
  media.addEventListener('change', (event) => {
    if (!getStoredTheme()) apply(event.matches ? 'dark' : 'light');
  });

  window.TaxBotTheme = Object.freeze({
    apply,
    bindToggle,
    getTheme,
    toggle,
  });
})();
