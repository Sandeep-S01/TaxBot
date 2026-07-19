import { Router } from 'express';
import { RateLimitRequestHandler } from 'express-rate-limit';
import {
  clearCASessionCookie,
  getAuthenticatedCAId,
  hashPassword,
  issueCASession,
  requireCAAuth,
  requireCACsrf,
  setCASessionCookie,
  verifyPasswordAndMaybeMigrate,
} from '../auth/caAuth';
import { createCAAuditRoutes } from './caAudit';
import { getClientById, getClientByPhone, createClient, updateClient } from '../db/clients';
import {
  getTransactionsByDateRange,
  getTransactionsByDateRangePage,
  getTransactionsForMultipleClientsPage,
  periodToDateRange,
} from '../db/transactions';
import { createCA, getCAByEmail, getCAById, getCAClients, getConsolidatedGSTRSummary, linkClientToCA } from '../db/cas';
import { logAuditAction } from '../db/audit';
import { streamCAReportPdf } from '../reports/caPdfReport';
import { reconcileTransactions } from '../accounting/reconciliation';
import {
  isStrongPassword,
  isValidEmail,
  isValidPeriod,
  isUuid,
  normalizeEmail,
  normalizeGstin,
  normalizeIndianPhone,
  normalizeReportType,
  parsePagination,
} from '../utils/validation';

const DEFAULT_LEDGER_PAGE_LIMIT = 200;
const MAX_LEDGER_PAGE_LIMIT = 1000;
const MAX_REPORT_ROWS = 5000;

async function logAuthAuditBestEffort(
  caId: string,
  actionType: string,
  description: string
): Promise<void> {
  try {
    await logAuditAction(caId, actionType, description);
  } catch (err: any) {
    console.error(`[Audit] ${actionType} audit log failed after successful auth action:`, err.message || err);
  }
}

export function createCARoutes(authLimiter: RateLimitRequestHandler): Router {
  const router = Router();

// --- CA PARTNER CONSOLE API ENDPOINTS ---

// 1. CA Registration
router.post('/api/ca/register', authLimiter, async (req, res) => {
  const { name, password, firmName } = req.body;
  const email = normalizeEmail(req.body.email);

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields (name, email, password)' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 10 characters and include letters and numbers' });
  }

  try {
    const existing = await getCAByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'A Chartered Accountant account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);
    const ca = await createCA({
      name,
      email,
      password_hash: passwordHash,
      firm_name: firmName || null,
    });

    await logAuthAuditBestEffort(ca.id, 'REGISTER', `New CA registered: ${ca.name} (${ca.firm_name || 'No Firm'})`);

    // Return CA info (excluding password hash)
    return res.status(201).json({
      message: 'CA registered successfully',
      ca: { id: ca.id, name: ca.name, email: ca.email, firm_name: ca.firm_name },
    });
  } catch (err: any) {
    console.error('CA registration error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Failed to register CA' });
  }
});

// 2. CA Login
router.post('/api/ca/login', authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const ca = await getCAByEmail(email);
    if (!ca) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const verified = await verifyPasswordAndMaybeMigrate(ca, password);
    if (!verified) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { token, csrfToken } = issueCASession(ca);
    setCASessionCookie(res, token);
    await logAuthAuditBestEffort(ca.id, 'LOGIN', `CA logged in: ${ca.name}`);

    return res.status(200).json({
      message: 'Login successful',
      token,
      csrfToken,
      ca: { id: ca.id, name: ca.name, email: ca.email, firm_name: ca.firm_name },
    });
  } catch (err: any) {
    console.error('CA login error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Login failed' });
  }
});

router.use('/api/ca', requireCAAuth);
router.use('/api/ca', requireCACsrf);

router.post('/api/ca/logout', (req, res) => {
  clearCASessionCookie(res);
  return res.status(200).json({ message: 'Logout successful' });
});

router.get('/api/ca/session', async (req, res) => {
  const caId = getAuthenticatedCAId(req);

  try {
    const ca = await getCAById(caId);
    if (!ca) {
      clearCASessionCookie(res);
      return res.status(401).json({ error: 'Unauthorized: CA account not found' });
    }
    return res.status(200).json({
      ca: { id: ca.id, name: ca.name, email: ca.email, firm_name: ca.firm_name },
      csrfToken: (req as any).caCsrfToken,
    });
  } catch (err: any) {
    console.error('Error fetching CA session:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Could not fetch session' });
  }
});

// 3. Get clients managed by CA
router.get('/api/ca/clients', async (req, res) => {
  const caId = getAuthenticatedCAId(req);

  try {
    const clients = await getCAClients(caId);
    return res.status(200).json(clients);
  } catch (err: any) {
    console.error('Error fetching CA clients:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Could not fetch clients' });
  }
});

// 4. Add or link a client under CA
router.post('/api/ca/clients', async (req, res) => {
  const caId = getAuthenticatedCAId(req);
  const { name, phone, businessName, gstin, plan, gstRegistered } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Missing phone number' });
  }
  const cleanPhone = normalizeIndianPhone(phone);
  if (!cleanPhone) {
    return res.status(400).json({ error: 'Invalid Indian mobile phone number' });
  }
  const normalizedGstin = gstin ? normalizeGstin(gstin) : null;
  if (gstin && !normalizedGstin) {
    return res.status(400).json({ error: 'Invalid GSTIN format' });
  }

  try {
    // Check if client already exists
    let client = await getClientByPhone(cleanPhone);

    if (client) {
      // Link the existing client to this CA
      client = await linkClientToCA(client.id, caId);
      // Update details if provided
      if (name || businessName || gstin || plan || gstRegistered !== undefined) {
        client = await updateClient(client.id, {
          name: name || client.name,
          business_name: businessName || client.business_name,
          gstin: normalizedGstin || client.gstin,
          plan: plan || client.plan,
          gst_registered: gstRegistered !== undefined ? gstRegistered : client.gst_registered,
        });
      }
    } else {
      // Create new client
      const newClient = await createClient(cleanPhone, name);
      // Link and set other details
      client = await updateClient(newClient.id, {
        business_name: businessName || null,
        gstin: normalizedGstin,
        plan: plan || 'trial',
        gst_registered: gstRegistered || false,
        ca_id: caId,
      });
    }

    await logAuditAction(caId, 'CLIENT_CREATED', `Linked client business: ${client.business_name || client.name}`, client.id);

    return res.status(201).json({
      message: 'Client added and linked successfully',
      client,
    });
  } catch (err: any) {
    console.error('Error adding client under CA:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Could not add client' });
  }
});

// 5. Get transactions for a CA's client
router.get('/api/ca/clients/:clientId/transactions', async (req, res) => {
  const caId = getAuthenticatedCAId(req);
  const { clientId } = req.params;
  const { period } = req.query as { period?: string };
  const pagination = parsePagination(req.query, {
    defaultLimit: DEFAULT_LEDGER_PAGE_LIMIT,
    maxLimit: MAX_LEDGER_PAGE_LIMIT,
  });

  if (!isUuid(clientId)) {
    return res.status(400).json({ error: 'Invalid client id' });
  }
  if (period && !isValidPeriod(period)) {
    return res.status(400).json({ error: 'Invalid period format. Expected YYYY-MM' });
  }
  if (!pagination) {
    return res.status(400).json({ error: `Invalid pagination. limit must be 1-${MAX_LEDGER_PAGE_LIMIT} and offset must be 0 or greater.` });
  }

  try {
    // Verify client is managed by this CA
    const client = await getClientById(clientId);
    if (!client || client.ca_id !== caId) {
      return res.status(403).json({ error: 'Forbidden: You do not manage this client' });
    }

    // Get date range (defaults to current month if not specified)
    const targetPeriod = period || new Date().toISOString().substring(0, 7);
    const { startDate, endDate } = periodToDateRange(targetPeriod);

    const page = await getTransactionsByDateRangePage(clientId, startDate, endDate, pagination);
    return res.status(200).json({
      period: targetPeriod,
      client,
      transactions: page.data,
      pagination: {
        limit: page.limit,
        offset: page.offset,
        count: page.count,
        hasMore: page.hasMore,
      },
    });
  } catch (err: any) {
    console.error('Error fetching CA client transactions:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Could not fetch transactions' });
  }
});

// 6. Reconcile bank statement lines against confirmed ledger entries
router.get('/api/ca/clients/:clientId/reconciliation', async (req, res) => {
  const caId = getAuthenticatedCAId(req);
  const { clientId } = req.params;
  const { period } = req.query as { period?: string };

  if (!isUuid(clientId)) {
    return res.status(400).json({ error: 'Invalid client id' });
  }
  if (period && !isValidPeriod(period)) {
    return res.status(400).json({ error: 'Invalid period format. Expected YYYY-MM' });
  }

  try {
    const client = await getClientById(clientId);
    if (!client || client.ca_id !== caId) {
      return res.status(403).json({ error: 'Forbidden: You do not manage this client' });
    }

    const targetPeriod = period || new Date().toISOString().substring(0, 7);
    const { startDate, endDate } = periodToDateRange(targetPeriod);
    const page = await getTransactionsByDateRangePage(clientId, startDate, endDate, {
      limit: MAX_REPORT_ROWS,
      offset: 0,
      ascending: true,
    });
    if (page.hasMore) {
      return res.status(413).json({
        error: `Reconciliation period contains more than ${MAX_REPORT_ROWS} transactions. Narrow the period before reconciling.`,
      });
    }
    const transactions = page.data;
    const reconciliation = reconcileTransactions(transactions);

    return res.status(200).json({
      period: targetPeriod,
      client,
      reconciliation,
    });
  } catch (err: any) {
    console.error('Error generating reconciliation summary:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Could not reconcile transactions' });
  }
});

// 7. Get consolidated GSTR summary for all CA's clients
router.get('/api/ca/reports/gst', async (req, res) => {
  const caId = getAuthenticatedCAId(req);
  const { period } = req.query as { period?: string };

  if (period && !isValidPeriod(period)) {
    return res.status(400).json({ error: 'Invalid period format. Expected YYYY-MM' });
  }
  const targetPeriod = period || new Date().toISOString().substring(0, 7);

  try {
    const report = await getConsolidatedGSTRSummary(caId, targetPeriod);
    return res.status(200).json(report);
  } catch (err: any) {
    console.error('Error generating consolidated GSTR report:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Could not generate GSTR report' });
  }
});

// 8. Generate dynamic PDF reports (P&L and GST)
router.get('/api/ca/reports/pdf', async (req, res) => {
  const caId = getAuthenticatedCAId(req);
  const { clientId, reportType, period } = req.query as { clientId?: string; reportType?: string; period?: string };

  if (!clientId || !reportType) {
    return res.status(400).json({ error: 'Missing required parameters: clientId and reportType' });
  }
  if (!isUuid(clientId)) {
    return res.status(400).json({ error: 'Invalid client id' });
  }
  const safeReportType = normalizeReportType(reportType);
  if (!safeReportType) {
    return res.status(400).json({ error: 'Invalid reportType. Expected pl or gst' });
  }
  if (period && !isValidPeriod(period)) {
    return res.status(400).json({ error: 'Invalid period format. Expected YYYY-MM' });
  }

  try {
    const client = await getClientById(clientId);
    if (!client || client.ca_id !== caId) {
      return res.status(403).json({ error: 'Forbidden: You do not manage this client' });
    }

    const targetPeriod = period || new Date().toISOString().substring(0, 7);
    const { startDate, endDate } = periodToDateRange(targetPeriod);
    const page = await getTransactionsByDateRangePage(clientId, startDate, endDate, {
      limit: MAX_REPORT_ROWS,
      offset: 0,
      ascending: true,
    });
    if (page.hasMore) {
      return res.status(413).json({
        error: `Report period contains more than ${MAX_REPORT_ROWS} transactions. Narrow the period or export in batches.`,
      });
    }
    const transactions = page.data;
    const ca = await getCAById(caId);

    await logAuditAction(caId, 'PDF_DOWNLOADED', `Generated ${safeReportType.toUpperCase()} PDF report for client: ${client.business_name || client.name}`, clientId);

    streamCAReportPdf({
      res,
      ca,
      client,
      transactions,
      reportType: safeReportType,
      targetPeriod,
    });
  } catch (err: any) {
    console.error('Error generating PDF report:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Could not generate report' });
  }
});

router.use('/api/ca/audit', createCAAuditRoutes());

// 7. Get ALL transactions across all CA-managed clients (aggregated view)
router.get('/api/ca/transactions', async (req, res) => {
  const caId = getAuthenticatedCAId(req);
  const { period } = req.query as { period?: string };
  const pagination = parsePagination(req.query, {
    defaultLimit: DEFAULT_LEDGER_PAGE_LIMIT,
    maxLimit: MAX_LEDGER_PAGE_LIMIT,
  });

  if (period && !isValidPeriod(period)) {
    return res.status(400).json({ error: 'Invalid period format. Expected YYYY-MM' });
  }
  if (!pagination) {
    return res.status(400).json({ error: `Invalid pagination. limit must be 1-${MAX_LEDGER_PAGE_LIMIT} and offset must be 0 or greater.` });
  }

  try {
    const clients = await getCAClients(caId);
    if (clients.length === 0) {
      return res.status(200).json({
        period: period || 'all',
        count: 0,
        transactions: [],
        pagination: { ...pagination, count: 0, hasMore: false },
      });
    }

    const clientIds = clients.map(c => c.id);
    const clientMap: Record<string, { name: string; business_name: string | null; phone: string }> = {};
    clients.forEach(c => {
      clientMap[c.id] = { name: c.name || 'Unnamed', business_name: c.business_name, phone: c.phone };
    });

    // Determine date range
    let startDate: string;
    let endDate: string;
    if (period && /^\d{4}-\d{2}$/.test(period)) {
      const range = periodToDateRange(period);
      startDate = range.startDate;
      endDate = range.endDate;
    } else {
      // Default: current month
      const now = new Date();
      const currentPeriod = now.toISOString().substring(0, 7);
      const range = periodToDateRange(currentPeriod);
      startDate = range.startDate;
      endDate = range.endDate;
    }

    const page = await getTransactionsForMultipleClientsPage(clientIds, startDate, endDate, pagination);

    // Enrich transactions with client display info
    const enriched = page.data.map(tx => ({
      ...tx,
      client_name: clientMap[tx.client_id]?.business_name || clientMap[tx.client_id]?.name || 'Unknown',
      client_phone: clientMap[tx.client_id]?.phone || '',
    }));

    return res.status(200).json({
      period: period || new Date().toISOString().substring(0, 7),
      count: enriched.length,
      transactions: enriched,
      pagination: {
        limit: page.limit,
        offset: page.offset,
        count: page.count,
        hasMore: page.hasMore,
      },
    });
  } catch (err: any) {
    console.error('Error fetching aggregated CA transactions:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Could not fetch transactions' });
  }
});

// --- END CA ENDPOINTS ---

  return router;
}
