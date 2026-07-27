export interface ConsoleRoute {
  hash: string;
  name: string;
  container: string;
  keyboardTarget: string;
}

export const PUBLIC_ROUTES = [
  { name: 'landing', path: '/', container: '#main' },
  { name: 'login', path: '/console.html', container: '#auth-layout' },
] as const;

export const CONSOLE_ROUTES: ConsoleRoute[] = [
  { name: 'overview', hash: 'overview', container: '#view-overview', keyboardTarget: '#overview-add-client-btn' },
  { name: 'clients', hash: 'clients', container: '#view-clients', keyboardTarget: '#client-search' },
  { name: 'transactions', hash: 'transactions', container: '#view-transactions', keyboardTarget: '#transactions-global-search' },
  { name: 'documents', hash: 'documents', container: '#view-documents', keyboardTarget: '#doc-global-search' },
  { name: 'gst', hash: 'gst', container: '#view-gst', keyboardTarget: '#gst-period-picker' },
  { name: 'insights', hash: 'insights', container: '#view-insights', keyboardTarget: '#btn-insights-run-scanner' },
  { name: 'exports', hash: 'exports', container: '#view-exports', keyboardTarget: '#export-tally-client' },
  { name: 'billing', hash: 'billing', container: '#view-billing', keyboardTarget: '#btn-upgrade-firm-plan' },
  { name: 'settings', hash: 'settings', container: '#view-settings', keyboardTarget: '[data-settings-tab="firm"]' },
];

export const WORKSPACE_TABS = [
  'overview',
  'transactions',
  'documents',
  'gst',
  'reconciliation',
  'reports',
  'exports',
  'audit',
] as const;
