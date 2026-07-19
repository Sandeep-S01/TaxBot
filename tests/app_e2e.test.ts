import { AddressInfo } from 'net';
import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const testCA = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ca@example.com',
  name: 'Test CA',
  firm_name: 'Test Firm',
  password_hash: '',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

const testClient = {
  id: '22222222-2222-4222-8222-222222222222',
  phone: '919876543210',
  name: 'Owner',
  business_name: 'Acme Traders',
  gstin: '27AAAAA1111A1Z1',
  gst_registered: true,
  plan: 'trial' as const,
  ca_id: testCA.id,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

const testTransaction = {
  id: '33333333-3333-4333-8333-333333333333',
  client_id: testClient.id,
  date: '2026-07-10',
  description: 'Consulting',
  vendor_name: 'Buyer',
  amount: 1000,
  tax_amount: 180,
  category: 'sales' as const,
  gst_category: 'B2B' as const,
  gst_rate: 18 as const,
  hsn_sac: null,
  invoice_number: 'INV-1',
  vendor_gstin: '27BBBBB2222B2Z2',
  source: 'manual' as const,
  raw_text: null,
  confidence: 'high' as const,
  status: 'confirmed' as const,
  review_reason: null,
  confirmed_at: '2026-07-10T00:00:00Z',
  created_at: '2026-07-10T00:00:00Z',
};

describe('Express app production smoke flows', () => {
  let baseUrl = '';
  let server: any;
  let generateExportToken: (clientId: string, period: string, issued?: string) => string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_jwt_secret_32_characters_minimum';
    process.env.EXPORT_TOKEN_SECRET = 'test_export_token_secret_32_chars_minimum';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_32_characters_minimum';
    process.env.META_APP_SECRET = 'meta_app_secret_32_characters_minimum';
    process.env.EMAIL_WEBHOOK_SECRET = 'email_webhook_secret_32_characters_minimum';
    process.env.APP_ORIGIN = 'http://127.0.0.1';
    process.env.WA_TOKEN = 'test_whatsapp_token';
    process.env.WA_PHONE_ID = 'test_phone_id';
    process.env.GEMINI_API_KEY = 'test_gemini_key';
    process.env.ANTHROPIC_API_KEY = 'test_anthropic_key';

    testCA.password_hash = await argon2.hash('securepass123');

    vi.doMock('../src/db/cas', () => ({
      createCA: vi.fn(),
      getCAByEmail: vi.fn(async (email: string) => email === testCA.email ? testCA : null),
      getCAById: vi.fn(async (id: string) => id === testCA.id ? testCA : null),
      updateCA: vi.fn(async () => testCA),
      getCAClients: vi.fn(async () => [testClient]),
      linkClientToCA: vi.fn(),
      getConsolidatedGSTRSummary: vi.fn(async () => ({
        period: '2026-07',
        incomplete: false,
        warnings: [],
        clientsCount: 1,
        totalOutwardTaxableValue: 1000,
        totalOutwardTaxAmount: 180,
        totalInwardTaxableValue: 0,
        totalInwardTaxAmount: 0,
        netGstPayable: 180,
        clientBreakdown: [],
      })),
    }));

    vi.doMock('../src/db/clients', () => ({
      getClientById: vi.fn(async (id: string) => id === testClient.id ? testClient : null),
      getClientByPhone: vi.fn(),
      createClient: vi.fn(),
      updateClient: vi.fn(),
    }));

    vi.doMock('../src/db/transactions', async () => {
      const actual = await vi.importActual<typeof import('../src/db/transactions')>('../src/db/transactions');
      const buildPage = (options: { limit: number; offset?: number }) => ({
        data: [testTransaction],
        count: 1,
        limit: options.limit,
        offset: options.offset || 0,
        hasMore: false,
      });
      return {
        ...actual,
        getTransactionById: vi.fn(async (id: string) => id === testTransaction.id ? testTransaction : null),
        getTransactionsByDateRange: vi.fn(async () => [testTransaction]),
        getTransactionsByDateRangePage: vi.fn(async (_clientId: string, _startDate: string, _endDate: string, options: { limit: number; offset?: number }) => buildPage(options)),
        getTransactionsForMultipleClientsPage: vi.fn(async (_clientIds: string[], _startDate: string, _endDate: string, options: { limit: number; offset?: number }) => buildPage(options)),
      };
    });

    vi.doMock('../src/db/audit', () => ({
      logAuditAction: vi.fn(async () => ({ id: 'audit-1' })),
      getAuditLogs: vi.fn(async () => []),
    }));

    vi.doMock('../src/db/client', () => ({
      supabase: {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
      },
    }));

    const appModule = await import('../src/app');
    const exportModule = await import('../src/handlers/commands/export');
    generateExportToken = exportModule.generateExportToken;
    const app = appModule.createApp({ startJobs: false });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => server.close((err: Error) => err ? reject(err) : resolve()));
    }
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('serves the public application shell', async () => {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('TaxBot');
  });

  it('exposes non-secret deployment metadata on health', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      status: 'healthy',
      service: 'TaxBot API',
      version: '1.0.0',
      environment: 'test',
    });
    expect(body).toHaveProperty('commit');
    expect(body).toHaveProperty('buildTime');
    expect(JSON.stringify(body)).not.toContain('service_role_key');
  });

  it('exposes non-secret deployment metadata', async () => {
    const res = await fetch(`${baseUrl}/version`);
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      service: 'TaxBot API',
      version: '1.0.0',
      environment: 'test',
    });
    expect(body).not.toHaveProperty('JWT_SECRET');
    expect(JSON.stringify(body)).not.toContain('service_role_key');
  });

  it('logs in a CA and grants cookie-authenticated access to protected APIs', async () => {
    const anonymous = await fetch(`${baseUrl}/api/ca/clients`);
    expect(anonymous.status).toBe(401);

    const login = await fetch(`${baseUrl}/api/ca/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testCA.email, password: 'securepass123' }),
    });
    const body = await login.json() as any;
    const cookie = login.headers.get('set-cookie') || '';

    expect(login.status).toBe(200);
    expect(body.token).toBeTruthy();
    expect(body.csrfToken).toBeTruthy();
    expect(cookie).toContain('HttpOnly');

    const clients = await fetch(`${baseUrl}/api/ca/clients`, {
      headers: { cookie },
    });
    const clientsBody = await clients.json() as any[];

    expect(clients.status).toBe(200);
    expect(clientsBody[0].id).toBe(testClient.id);
  });

  it('returns paginated ledger data for authenticated dashboard requests', async () => {
    const login = await fetch(`${baseUrl}/api/ca/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testCA.email, password: 'securepass123' }),
    });
    const cookie = login.headers.get('set-cookie') || '';

    const ledger = await fetch(`${baseUrl}/api/ca/clients/${testClient.id}/transactions?period=2026-07&limit=50&offset=0`, {
      headers: { cookie },
    });
    const body = await ledger.json() as any;

    expect(ledger.status).toBe(200);
    expect(body.transactions).toHaveLength(1);
    expect(body.pagination).toMatchObject({ limit: 50, offset: 0, count: 1, hasMore: false });
  });

  it('downloads signed exports and denies unsigned payment pages', async () => {
    const today = new Date().toISOString().split('T')[0];
    const token = generateExportToken(testClient.id, '2026-07', today);
    const exportRes = await fetch(`${baseUrl}/export/${testClient.id}?format=csv&period=2026-07&token=${token}`);
    const csv = await exportRes.text();

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get('content-type')).toContain('text/csv');
    expect(csv).toContain('INV-1');

    const rawPay = await fetch(`${baseUrl}/pay/${testTransaction.id}`);
    expect(rawPay.status).toBe(403);
  });
});
