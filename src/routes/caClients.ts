import { Router } from 'express';
import { getAuthenticatedCAId } from '../auth/caAuth';
import { getClientById, getClientByPhone, createClient, updateClient } from '../db/clients';
import { getCAClients, linkClientToCA } from '../db/cas';
import { logAuditAction } from '../db/audit';
import {
  getTransactionsByDateRangePage,
  getTransactionsForMultipleClientsPage,
  periodToDateRange,
} from '../db/transactions';
import {
  isValidPeriod,
  isUuid,
  normalizeGstin,
  normalizeIndianPhone,
  parsePagination,
} from '../utils/validation';

const DEFAULT_LEDGER_PAGE_LIMIT = 200;
const MAX_LEDGER_PAGE_LIMIT = 1000;

export function createCAClientRoutes(): Router {
  const router = Router();

  router.get('/clients', async (req, res) => {
    const caId = getAuthenticatedCAId(req);

    try {
      const clients = await getCAClients(caId);
      return res.status(200).json(clients);
    } catch (err: any) {
      console.error('Error fetching CA clients:', err.message);
      return res.status(500).json({ error: 'Internal Server Error: Could not fetch clients' });
    }
  });

  router.post('/clients', async (req, res) => {
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
      let client = await getClientByPhone(cleanPhone);

      if (client) {
        client = await linkClientToCA(client.id, caId);
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
        const newClient = await createClient(cleanPhone, name);
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

  router.get('/clients/:clientId/transactions', async (req, res) => {
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
      const client = await getClientById(clientId);
      if (!client || client.ca_id !== caId) {
        return res.status(403).json({ error: 'Forbidden: You do not manage this client' });
      }

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

  router.get('/transactions', async (req, res) => {
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

      let startDate: string;
      let endDate: string;
      if (period && /^\d{4}-\d{2}$/.test(period)) {
        const range = periodToDateRange(period);
        startDate = range.startDate;
        endDate = range.endDate;
      } else {
        const now = new Date();
        const currentPeriod = now.toISOString().substring(0, 7);
        const range = periodToDateRange(currentPeriod);
        startDate = range.startDate;
        endDate = range.endDate;
      }

      const page = await getTransactionsForMultipleClientsPage(clientIds, startDate, endDate, pagination);
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

  return router;
}
