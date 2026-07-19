import { Router } from 'express';
import { getAuthenticatedCAId } from '../auth/caAuth';
import { reconcileTransactions } from '../accounting/reconciliation';
import { getConsolidatedGSTRSummary, getCAById } from '../db/cas';
import { getClientById } from '../db/clients';
import { logAuditAction } from '../db/audit';
import { getTransactionsByDateRangePage, periodToDateRange } from '../db/transactions';
import { streamCAReportPdf } from '../reports/caPdfReport';
import { isValidPeriod, isUuid, normalizeReportType } from '../utils/validation';

const MAX_REPORT_ROWS = 5000;

export function createCAReportRoutes(): Router {
  const router = Router();

  router.get('/clients/:clientId/reconciliation', async (req, res) => {
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

      return res.status(200).json({
        period: targetPeriod,
        client,
        reconciliation: reconcileTransactions(page.data),
      });
    } catch (err: any) {
      console.error('Error generating reconciliation summary:', err.message);
      return res.status(500).json({ error: 'Internal Server Error: Could not reconcile transactions' });
    }
  });

  router.get('/reports/gst', async (req, res) => {
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

  router.get('/reports/pdf', async (req, res) => {
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
      const ca = await getCAById(caId);

      await logAuditAction(caId, 'PDF_DOWNLOADED', `Generated ${safeReportType.toUpperCase()} PDF report for client: ${client.business_name || client.name}`, clientId);

      streamCAReportPdf({
        res,
        ca,
        client,
        transactions: page.data,
        reportType: safeReportType,
        targetPeriod,
      });
    } catch (err: any) {
      console.error('Error generating PDF report:', err.message);
      return res.status(500).json({ error: 'Internal Server Error: Could not generate report' });
    }
  });

  return router;
}
