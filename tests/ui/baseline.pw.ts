import { expect, Page, Request, TestInfo, test } from '@playwright/test';
import { CONSOLE_ROUTES, PUBLIC_ROUTES, WORKSPACE_TABS } from './routes';

type Theme = 'light' | 'dark';

interface BrowserDiagnostics {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  failedAssets: string[];
}

const REQUIRED_RESOURCE_TYPES = new Set(['document', 'stylesheet', 'script', 'image', 'font']);
const APP_ORIGIN = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000').origin;

function projectTheme(testInfo: TestInfo): Theme {
  return testInfo.project.metadata.theme === 'dark' ? 'dark' : 'light';
}

async function preparePage(page: Page, theme: Theme): Promise<BrowserDiagnostics> {
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    failedAssets: [],
  };

  await page.addInitScript((selectedTheme) => {
    localStorage.setItem('taxbot_theme', selectedTheme);
  }, theme);

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error.message);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location();
      const source = location.url ? ` (${location.url}:${location.lineNumber || 0})` : '';
      diagnostics.consoleErrors.push(`${message.text()}${source}`);
      if (location.url && message.text().includes('Failed to load resource')) {
        diagnostics.failedAssets.push(`Console-reported asset failure: ${location.url}`);
      }
    }
  });

  page.on('requestfailed', (request) => {
    if (isRequiredAsset(request, page)) {
      diagnostics.failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || 'failed'}`);
    }
  });

  page.on('response', (response) => {
    const request = response.request();
    if (response.status() >= 400 && isRequiredAsset(request, page)) {
      diagnostics.failedAssets.push(`${response.status()} ${request.url()}`);
    }
  });

  return diagnostics;
}

function isRequiredAsset(request: Request, _page: Page): boolean {
  const requestUrl = new URL(request.url());
  const isLocal = requestUrl.origin === APP_ORIGIN;
  const isLocalAssetPath = /\.(?:css|js|mjs|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)(?:$|\?)/i.test(requestUrl.pathname);
  const isRequiredThirdParty =
    requestUrl.hostname === 'fonts.googleapis.com' ||
    requestUrl.hostname === 'fonts.gstatic.com' ||
    requestUrl.hostname === 'cdn.tailwindcss.com' ||
    requestUrl.hostname === 'cdn.jsdelivr.net' ||
    requestUrl.hostname === 'unpkg.com';

  return (isLocal && (REQUIRED_RESOURCE_TYPES.has(request.resourceType()) || isLocalAssetPath)) ||
    (isRequiredThirdParty && REQUIRED_RESOURCE_TYPES.has(request.resourceType()));
}

async function waitForStablePage(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `Horizontal overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectReadableControls(page: Page, rootSelector: string) {
  const badControls = await page.locator(`${rootSelector} :is(a, button, input, select, textarea):visible`).evaluateAll((nodes) => {
    function parseRgb(value: string) {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)/);
      if (!match) return null;
      return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
    }

    function composite(foreground: number[], background: number[]) {
      const alpha = foreground[3];
      return [
        Math.round(foreground[0] * alpha + background[0] * (1 - alpha)),
        Math.round(foreground[1] * alpha + background[1] * (1 - alpha)),
        Math.round(foreground[2] * alpha + background[2] * (1 - alpha)),
        1,
      ];
    }

    function effectiveBackground(element: HTMLElement) {
      let current: HTMLElement | null = element;
      let color = [255, 255, 255, 1];
      const layers: number[][] = [];

      while (current) {
        const parsed = parseRgb(getComputedStyle(current).backgroundColor);
        if (parsed && parsed[3] > 0) layers.push(parsed);
        if (parsed && parsed[3] >= 1) break;
        current = current.parentElement;
      }

      for (const layer of layers.reverse()) {
        color = layer[3] >= 1 ? layer : composite(layer, color);
      }
      return color;
    }

    function luminance(rgb: number[]) {
      const [red, green, blue] = rgb.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    }

    function contrastRatio(foreground: string, backgroundRgb: number[]) {
      const fg = parseRgb(foreground);
      if (!fg || fg[3] === 0) return null;
      const foregroundRgb = fg[3] >= 1 ? fg : composite(fg, backgroundRgb);
      const lighter = Math.max(luminance(foregroundRgb), luminance(backgroundRgb));
      const darker = Math.min(luminance(foregroundRgb), luminance(backgroundRgb));
      return (lighter + 0.05) / (darker + 0.05);
    }

    return nodes
      .map((node) => {
        const element = node as HTMLElement;
        const styles = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const backgroundRgb = effectiveBackground(element);
        const text = (element.innerText || element.getAttribute('aria-label') || element.getAttribute('placeholder') || '').trim();
        return {
          text,
          color: styles.color,
          background: `rgb(${backgroundRgb[0]}, ${backgroundRgb[1]}, ${backgroundRgb[2]})`,
          ratio: contrastRatio(styles.color, backgroundRgb),
          width: rect.width,
          height: rect.height,
          opacity: styles.opacity,
        };
      })
      .filter((control) =>
        control.text &&
        control.width >= 20 &&
        control.height >= 20 &&
        (control.ratio !== null && control.ratio < 4.5)
      );
  });

  expect(badControls, `Unreadable public controls: ${JSON.stringify(badControls.slice(0, 6))}`).toEqual([]);
}

async function expectTheme(page: Page, theme: Theme) {
  const state = await page.evaluate(() => ({
    saved: localStorage.getItem('taxbot_theme'),
    htmlDark: document.documentElement.classList.contains('dark'),
    bodyDark: document.body.classList.contains('dark-theme'),
  }));

  expect(state.saved).toBe(theme);
  expect(state.htmlDark).toBe(theme === 'dark');
  if (page.url().includes('console.html')) {
    expect(state.bodyDark).toBe(theme === 'dark');
  }
}

async function assertDiagnostics(diagnostics: BrowserDiagnostics) {
  expect.soft(diagnostics.pageErrors, 'Unexpected uncaught page errors').toEqual([]);
  expect.soft(diagnostics.consoleErrors, 'Unexpected browser console errors').toEqual([]);
  expect.soft(diagnostics.failedRequests, 'Required asset requests failed').toEqual([]);
  expect.soft(diagnostics.failedAssets, 'Required assets returned HTTP errors').toEqual([]);
}

async function tabTo(page: Page, selector: string, maxTabs = 80) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press('Tab');
    if (await page.locator(selector).evaluate((element) => element === document.activeElement).catch(() => false)) {
      return;
    }
  }

  throw new Error(`Keyboard focus did not reach ${selector} after ${maxTabs} Tab presses`);
}

test.describe('public frontend baseline', () => {
  test('landing page loads, remains keyboard reachable, and matches its snapshot', async ({ page }, testInfo) => {
    const theme = projectTheme(testInfo);
    const diagnostics = await preparePage(page, theme);

    await page.goto(PUBLIC_ROUTES[0].path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(PUBLIC_ROUTES[0].container)).toBeVisible();
    await waitForStablePage(page);
    await expectTheme(page, theme);
    await expectNoHorizontalOverflow(page);
    await expectReadableControls(page, 'body');

    await page.keyboard.press('Tab');
    await expect(page.locator('a[href="#main"]')).toBeFocused();

    await expect(page).toHaveScreenshot('landing.png', { fullPage: true });

    await page.locator('#theme-toggle-btn').click();
    await expectTheme(page, theme === 'dark' ? 'light' : 'dark');
    await page.locator('#theme-toggle-btn').click();
    await expectTheme(page, theme);

    await page.reload();
    await waitForStablePage(page);
    await expectTheme(page, theme);
    await assertDiagnostics(diagnostics);
  });

  test('login and registration screens load, accept keyboard focus, and match snapshots', async ({ page }, testInfo) => {
    const theme = projectTheme(testInfo);
    const diagnostics = await preparePage(page, theme);

    await page.goto(PUBLIC_ROUTES[1].path);
    await expect(page).toHaveURL(/\/console\.html$/);
    await expect(page.locator(PUBLIC_ROUTES[1].container)).toBeVisible();
    await expect(page.locator('#login-form')).toBeVisible();
    await waitForStablePage(page);
    await expectTheme(page, theme);
    await expectNoHorizontalOverflow(page);
    await expectReadableControls(page, '#auth-layout');

    await page.locator('#login-email').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#login-password')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#login-form button[type="submit"]')).toBeFocused();
    await expect(page).toHaveScreenshot('auth-login.png', { fullPage: true });

    await page.locator('#btn-switch-auth').click();
    await expect(page.locator('#register-form')).toBeVisible();
    await expectReadableControls(page, '#auth-layout');
    await page.locator('#reg-name').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#reg-email')).toBeFocused();
    await expect(page).toHaveScreenshot('auth-registration.png', { fullPage: true });

    await assertDiagnostics(diagnostics);
  });
});

test.describe('authenticated console baseline', () => {
  const email = process.env.TAXBOT_UI_CA_EMAIL;
  const password = process.env.TAXBOT_UI_CA_PASSWORD;

  test.skip(!email || !password, 'Set TAXBOT_UI_CA_EMAIL and TAXBOT_UI_CA_PASSWORD to baseline authenticated routes.');

  test('all console routes, workspace tabs, notifications, keyboard focus, and theme remain stable', async ({ page }, testInfo) => {
    const theme = projectTheme(testInfo);
    const diagnostics = await preparePage(page, theme);

    await page.goto('/console.html#overview');
    await page.locator('#login-email').fill(email as string);
    await page.locator('#login-password').fill(password as string);
    await page.locator('#login-form button[type="submit"]').click();
    await expect(page.locator('#console-layout')).toBeVisible();
    await expect(page.locator('#view-overview')).toBeVisible();

    for (const route of CONSOLE_ROUTES) {
      await page.goto(`/console.html#${route.hash}`);
      await expect(page).toHaveURL(new RegExp(`/console\\.html#${route.hash}$`));
      await expect(page.locator(route.container)).toBeVisible();
      await waitForStablePage(page);
      await expectTheme(page, theme);
      await expectNoHorizontalOverflow(page);
      await tabTo(page, route.keyboardTarget);
      await expect(page).toHaveScreenshot(`console-${route.name}.png`, { fullPage: true });
    }

    await page.goto('/console.html#overview');
    await page.locator('#notification-btn').click();
    await expect(page.locator('#notifications-dropdown-menu')).toBeVisible();
    await expect(page).toHaveScreenshot('console-notifications.png', { fullPage: true });

    const firstClientId = await page.evaluate(async () => {
      const session = JSON.parse(localStorage.getItem('taxbot_ca_session') || '{}');
      const response = await fetch('/api/ca/clients', {
        headers: { 'X-CSRF-Token': session.csrfToken || '' },
        credentials: 'same-origin',
      });
      if (!response.ok) return null;
      const clients = await response.json();
      return clients[0]?.id || null;
    });

    if (firstClientId) {
      await page.goto(`/console.html#client/${firstClientId}`);
      await expect(page.locator('#view-client-workspace')).toBeVisible();
      for (const tab of WORKSPACE_TABS) {
        await page.locator(`[data-ws-tab="${tab}"]`).click();
        await expect(page.locator(`#ws-panel-${tab}`)).toBeVisible();
        await waitForStablePage(page);
        await expectNoHorizontalOverflow(page);
        await expect(page).toHaveScreenshot(`client-workspace-${tab}.png`, { fullPage: true });
      }
    } else {
      testInfo.annotations.push({
        type: 'coverage',
        description: 'Client workspace tabs were not captured because the test CA has no linked clients.',
      });
    }

    const originalTheme = theme;
    await page.goto('/console.html#overview');
    await page.locator('#theme-toggle-btn').click();
    await expectTheme(page, originalTheme === 'dark' ? 'light' : 'dark');
    await page.locator('#theme-toggle-btn').click();
    await expectTheme(page, originalTheme);
    await page.reload();
    await expectTheme(page, originalTheme);

    await assertDiagnostics(diagnostics);
  });
});
