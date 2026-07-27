import { expect, Page, Request, test } from '@playwright/test';
import { CONSOLE_ROUTES } from './routes';

type Theme = 'light' | 'dark';

const MOCK_CLIENTS = [
  {
    id: 'client-acme',
    business_name: 'Acme Corp',
    name: 'Aarav Mehta',
    phone: '919876543210',
    gstin: '27AAAAA1111A1Z1',
    plan: 'pro',
  },
  {
    id: 'client-patel',
    business_name: 'Patel Kirana Store',
    name: 'Nisha Patel',
    phone: '919876543211',
    gstin: '24BBBBB2222B1Z2',
    plan: 'starter',
  },
  {
    id: 'client-sharma',
    business_name: 'Sandeep Sharma',
    name: 'CA Sandeep Sharma',
    phone: '919876543212',
    gstin: '07CCCCC3333C1Z3',
    plan: 'trial',
  },
];

function projectTheme(): Theme {
  return test.info().project.metadata.theme === 'dark' ? 'dark' : 'light';
}

async function mockConsoleSession(page: Page, theme: Theme) {
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem('taxbot_theme', selectedTheme);
    localStorage.setItem('taxbot_ca_session', JSON.stringify({
      id: 'ca-shell-test',
      name: 'Sandeep',
      email: 'sandeep@example.com',
      firm_name: 'TaxBot Partner',
      csrfToken: 'test-csrf-token',
    }));
    localStorage.setItem('taxbot_sidebar_collapsed', 'false');
  }, theme);

  await page.route('**/api/ca/**', async (route) => {
    const request: Request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/ca/clients') {
      await route.fulfill({ json: MOCK_CLIENTS });
      return;
    }
    if (url.pathname === '/api/ca/transactions') {
      await route.fulfill({ json: { transactions: [] } });
      return;
    }
    if (url.pathname.includes('/reconciliation')) {
      await route.fulfill({ json: { matches: [], mismatches: [] } });
      return;
    }
    if (url.pathname.includes('/reports/gst')) {
      await route.fulfill({
        json: {
          period: url.searchParams.get('period') || '2026-07',
          incomplete: false,
          warnings: [],
          totalOutwardTaxableValue: 125000,
          totalInwardTaxAmount: 18400,
          netGstPayable: 6100,
          clientBreakdown: [
            {
              clientId: 'client-acme',
              businessName: 'Acme Corp',
              clientName: 'Aarav Mehta',
              gstin: '27AAAAA1111A1Z1',
              outwardTax: 14500,
              inwardTax: 8400,
              outwardTaxable: 80555,
              inwardTaxable: 46666,
              calculationStatus: 'ok',
            },
            {
              clientId: 'client-patel',
              businessName: 'Patel Kirana Store',
              clientName: 'Nisha Patel',
              gstin: '24BBBBB2222B1Z2',
              outwardTax: 0,
              inwardTax: 0,
              outwardTaxable: 0,
              inwardTaxable: 0,
              calculationStatus: 'error',
            },
          ],
        },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });
}

async function waitForStablePage(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function expectReadablePair(page: Page, selector: string) {
  const pair = await page.locator(selector).first().evaluate((element) => {
    const styles = getComputedStyle(element);
    return { color: styles.color, background: styles.backgroundColor };
  });
  expect(pair.color).not.toBe(pair.background);
  expect(pair.color).not.toBe('rgba(0, 0, 0, 0)');
}

async function expectNoPageHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(
    Math.max(dimensions.scrollWidth, dimensions.bodyScrollWidth),
    `Horizontal overflow detected: ${JSON.stringify(dimensions)}`
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectShellControlsReadable(page: Page) {
  const badControls = await page.locator('#console-layout :is(button, a, input, select, textarea):visible').evaluateAll((nodes) => {
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
        const rect = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        const backgroundRgb = effectiveBackground(element);
        const background = `rgb(${backgroundRgb[0]}, ${backgroundRgb[1]}, ${backgroundRgb[2]})`;
        return {
          text: (element.innerText || element.getAttribute('aria-label') || element.getAttribute('placeholder') || '').trim(),
          width: rect.width,
          height: rect.height,
          color: styles.color,
          background,
          opacity: styles.opacity,
          ratio: contrastRatio(styles.color, backgroundRgb),
        };
      })
      .filter((control) =>
        control.text &&
        control.width >= 20 &&
        control.height >= 20 &&
        (
          control.color === control.background ||
          control.color === 'rgba(0, 0, 0, 0)' ||
          Number(control.opacity) < 0.65 ||
          (control.ratio !== null && control.ratio < 4.5)
        )
      );
  });

  expect(badControls, `Unreadable visible controls: ${JSON.stringify(badControls.slice(0, 6))}`).toEqual([]);
}

test.describe('console shell remediation', () => {
  test('all mocked console routes remain responsive and readable', async ({ page }) => {
    const theme = projectTheme();
    await mockConsoleSession(page, theme);

    for (const route of CONSOLE_ROUTES) {
      await page.goto(`/console.html#${route.hash}`);
      await expect(page.locator('#console-layout')).toBeVisible();
      await expect(page.locator(route.container)).toBeVisible();
      await waitForStablePage(page);
      await expectNoPageHorizontalOverflow(page);
      await expectShellControlsReadable(page);

      const pageTitle = await page.locator(`${route.container} h1, ${route.container} h2`).first();
      await expect(pageTitle).toBeVisible();
    }

    await page.goto('/console.html#client/client-acme');
    await expect(page.locator('#view-client-workspace')).toBeVisible();
    await waitForStablePage(page);
    await expectNoPageHorizontalOverflow(page);
    await expectShellControlsReadable(page);

    const workspaceTabs = ['overview', 'transactions', 'documents', 'gst', 'reconciliation', 'reports', 'exports', 'audit'];
    for (const tab of workspaceTabs) {
      await page.locator(`[data-ws-tab="${tab}"]`).click();
      await expect(page.locator(`#ws-panel-${tab}`)).toBeVisible();
      await waitForStablePage(page);
      await expectNoPageHorizontalOverflow(page);
      await expectShellControlsReadable(page);
    }
  });

  test('header controls align, menus coordinate, and overlays keep readable contrast', async ({ page }) => {
    const theme = projectTheme();
    await mockConsoleSession(page, theme);

    await page.goto('/console.html#overview');
    await expect(page.locator('#console-layout')).toBeVisible();
    await waitForStablePage(page);

    const viewport = page.viewportSize();
    if ((viewport?.width || 0) >= 769) {
      const headerBox = await page.locator('.app-header').boundingBox();
      const sidebarHeaderBox = await page.locator('.sidebar-header').boundingBox();
      expect(headerBox?.height).toBe(sidebarHeaderBox?.height);
    }

    const actionRects = await page.locator('.header-right > :visible').evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      })
    );
    expect(actionRects.length).toBeGreaterThanOrEqual(4);
    for (let index = 1; index < actionRects.length; index += 1) {
      const gap = actionRects[index].left - actionRects[index - 1].right;
      expect(gap).toBeGreaterThanOrEqual(6);
      expect(gap).toBeLessThanOrEqual(12);
    }
    for (const rect of actionRects.slice(0, 3)) {
      expect(rect.height).toBeLessThanOrEqual(38);
    }

    await page.locator('#notification-btn').click();
    await expect(page.locator('#notifications-dropdown-menu')).toBeVisible();
    await expect(page.locator('.notification-item').first()).toBeVisible();
    const notificationFontSize = await page.locator('.notification-title').first().evaluate((el) => getComputedStyle(el).fontSize);
    expect(notificationFontSize).toBe('13px');

    await page.locator('#profile-menu-btn').click();
    await expect(page.locator('#profile-menu')).toBeVisible();
    await expect(page.locator('#notifications-dropdown-menu')).toBeHidden();

    await page.locator('#global-command-trigger').click();
    await expect(page.locator('#global-command-modal')).toBeVisible();
    await expect(page.locator('#profile-menu')).toBeHidden();
    await expect(page.locator('#command-bar-search-input')).toBeFocused();
    const commandColor = await page.locator('#command-bar-search-input').evaluate((el) => getComputedStyle(el).color);
    expect(commandColor).not.toBe('rgb(255, 255, 255)');

    await page.keyboard.press('Escape');
    await expect(page.locator('#global-command-modal')).toBeHidden();

    await page.locator('#overview-add-client-btn').click();
    await expect(page.locator('#add-client-modal')).toBeVisible();
    const modalColors = await page.locator('#add-client-modal').evaluate(() => {
      const title = document.querySelector('.modal-dialog-header h3') as HTMLElement;
      const input = document.querySelector('#new-client-owner') as HTMLInputElement;
      return {
        title: getComputedStyle(title).color,
        input: getComputedStyle(input).color,
        inputBg: getComputedStyle(input).backgroundColor,
      };
    });
    expect(modalColors.title).not.toBe('rgb(255, 255, 255)');
    expect(modalColors.input).not.toBe(modalColors.inputBg);
  });

  test('migrated component families keep consistent sizing and contrast', async ({ page }) => {
    const theme = projectTheme();
    await mockConsoleSession(page, theme);

    await page.goto('/console.html#exports');
    await expect(page.locator('#console-layout')).toBeVisible();
    await waitForStablePage(page);

    await expect(page.locator('.export-card')).toHaveCount(4);
    await expectReadablePair(page, '#btn-action-export-tally');
    await expectReadablePair(page, '#btn-action-export-gst');
    await expectReadablePair(page, '#btn-action-export-csv');
    await expectReadablePair(page, '#btn-action-export-pdf');

    const exportButtonHeights = await page.locator('#view-exports button').evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height)
    );
    for (const height of exportButtonHeights) {
      expect(height).toBeGreaterThanOrEqual(38);
    }

    const exportSelect = await page.locator('#export-tally-client').evaluate((element) => {
      const styles = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        color: styles.color,
        background: styles.backgroundColor,
      };
    });
    expect(exportSelect.height).toBeGreaterThanOrEqual(42);
    expect(exportSelect.color).not.toBe(exportSelect.background);

    await page.goto('/console.html#gst');
    await waitForStablePage(page);
    await expectReadablePair(page, '#btn-gst-bulk-file');
    const gstTable = await page.locator('#gst-center-table').evaluate((element) => {
      const th = element.querySelector('th') as HTMLElement;
      const td = element.querySelector('td') as HTMLElement | null;
      return {
        tableWidth: element.getBoundingClientRect().width,
        headerColor: getComputedStyle(th).color,
        headerBg: getComputedStyle(th).backgroundColor,
        cellColor: td ? getComputedStyle(td).color : null,
      };
    });
    expect(gstTable.tableWidth).toBeGreaterThan(300);
    expect(gstTable.headerColor).not.toBe(gstTable.headerBg);

    await page.goto('/console.html#settings');
    await waitForStablePage(page);
    await expectReadablePair(page, '.settings-tab-link.active');
    await expectReadablePair(page, '#settings-firm-name');
    await page.locator('[data-settings-tab="api"]').click();
    await expect(page.locator('#settings-panel-api')).toBeVisible();
    await expectReadablePair(page, '#btn-settings-copy-api-key');
    await expectReadablePair(page, '#btn-settings-save-webhook');

    await page.goto('/console.html#billing');
    await waitForStablePage(page);
    await expectReadablePair(page, '#btn-upgrade-firm-plan');
    const cardRadius = await page.locator('.reseller-tier-card').first().evaluate((element) => getComputedStyle(element).borderRadius);
    expect(cardRadius).toBe('8px');
  });

  test('settings, export, and GST actions provide validation and busy feedback', async ({ page }) => {
    const theme = projectTheme();
    await mockConsoleSession(page, theme);

    await page.goto('/console.html#settings');
    await expect(page.locator('#console-layout')).toBeVisible();
    await waitForStablePage(page);

    await page.locator('[data-settings-tab="api"]').click();
    await page.locator('#settings-webhook-url').fill('http://insecure.example/webhook');
    await page.locator('#btn-settings-save-webhook').click();
    await expect(page.locator('#settings-webhook-url')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.field-feedback-error')).toContainText('HTTPS');
    await expect(page.locator('.toast-error')).toBeVisible();

    await page.locator('#settings-webhook-url').fill('https://firm.example/taxbot/webhook');
    await page.locator('#btn-settings-save-webhook').click();
    await expect(page.locator('#btn-settings-save-webhook')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.toast-success').last()).toContainText('Webhook receiver saved');
    await expect(page.locator('#settings-webhook-url')).toHaveAttribute('aria-invalid', 'false');

    await page.locator('[data-settings-tab="notifications"]').click();
    await page.locator('#btn-settings-test-notification').click();
    await expect(page.locator('#btn-settings-test-notification')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#notification-btn .indicator-dot')).toBeVisible();

    await page.goto('/console.html#exports');
    await waitForStablePage(page);
    await page.locator('#btn-action-export-gst').click();
    await expect(page.locator('#btn-action-export-gst')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.toast-success').last()).toContainText('GST Excel ledger generated');

    await page.goto('/console.html#gst');
    await waitForStablePage(page);
    await expect(page.locator('#gst-center-table-body tr')).toHaveCount(2);
    await page.locator('.btn-gst-file-action').first().click();
    await expect(page.locator('.btn-gst-file-action').first()).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.toast-success').last()).toContainText('GSTR-1 filed');
  });
});
