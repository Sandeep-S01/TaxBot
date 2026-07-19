import { Router } from 'express';
import { getAuthenticatedCAId, requireCAAuth } from '../auth/caAuth';
import { getClientById } from '../db/clients';
import { getTransactionsSince } from '../db/transactions';

export function createSyncRoutes(): Router {
  const router = Router();

  router.get('/api/sync/:clientId', requireCAAuth, async (req, res) => {
    const caId = getAuthenticatedCAId(req);
    const { clientId } = req.params;
    const { since } = req.query as { since?: string };

    try {
      const client = await getClientById(clientId);
      if (!client || client.ca_id !== caId) {
        return res.status(403).json({ error: 'Forbidden: You do not manage this client' });
      }

      const sinceTime = since || new Date(0).toISOString();
      const transactions = await getTransactionsSince(clientId, sinceTime);

      return res.status(200).json({
        clientId,
        clientName: client?.name || 'Client',
        businessName: client?.business_name || 'Client Account',
        gstin: client?.gstin || null,
        lastSyncTime: new Date().toISOString(),
        count: transactions.length,
        transactions,
      });
    } catch (err: any) {
      console.error('Error in sync endpoint:', err.message);
      return res.status(500).json({ error: 'Internal Server Error: Sync failed' });
    }
  });

  return router;
}
