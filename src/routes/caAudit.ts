import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { isUsableAnthropicKey, shouldUseSimulatedAuditResponse } from '../ai/auditAvailability';
import { normalizeAuditActionPayload } from '../audit/validation';
import { getAuthenticatedCAId } from '../auth/caAuth';
import { getClientById } from '../db/clients';
import { getAuditLogs, logAuditAction } from '../db/audit';
import { getTransactionsByDateRangePage, periodToDateRange } from '../db/transactions';
import { summarizeProviderError } from '../utils/privacy';
import { isValidPeriod, isUuid } from '../utils/validation';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'dummy_key',
});

const MAX_AI_AUDIT_ROWS = 500;

export function createCAAuditRoutes(): Router {
  const router = Router();

  router.post('/log', async (req, res) => {
    const caId = getAuthenticatedCAId(req);
    const parsed = normalizeAuditActionPayload(req.body);

    if (parsed.error || !parsed.value) {
      return res.status(400).json({ error: parsed.error });
    }

    try {
      const { actionType, description, clientId } = parsed.value;
      if (clientId) {
        const client = await getClientById(clientId);
        if (!client || client.ca_id !== caId) {
          return res.status(403).json({ error: 'Forbidden: You do not manage this client' });
        }
      }

      const log = await logAuditAction(caId, actionType, description, clientId || null);
      return res.status(201).json(log);
    } catch (err: any) {
      console.error('Error logging manual audit action:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.get('/logs', async (req, res) => {
    const caId = getAuthenticatedCAId(req);

    try {
      const logs = await getAuditLogs(caId);
      return res.status(200).json(logs);
    } catch (err: any) {
      console.error('Error fetching audit logs:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.post('/chat', async (req, res) => {
    const caId = getAuthenticatedCAId(req);
    const { clientId, message, period } = req.body;

    if (!clientId || !message) {
      return res.status(400).json({ error: 'Missing required parameters: clientId and message' });
    }
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

      const targetPeriod = typeof period === 'string' && /^\d{4}-\d{2}$/.test(period)
        ? period
        : new Date().toISOString().substring(0, 7);
      const { startDate, endDate } = periodToDateRange(targetPeriod);
      const page = await getTransactionsByDateRangePage(clientId, startDate, endDate, {
        limit: MAX_AI_AUDIT_ROWS,
        offset: 0,
        ascending: true,
      });
      const clientTransactions = page.data;
      const txString = JSON.stringify({
        transactions: clientTransactions,
        truncated: page.hasMore,
        totalCount: page.count,
        includedRows: clientTransactions.length,
      });

      await logAuditAction(
        caId,
        'AI_AUDIT_QUERY',
        `Audited client ${client.business_name || client.name}: "${message.substring(0, 50)}..."`,
        clientId
      );

      const apiKey = process.env.ANTHROPIC_API_KEY;

      if (shouldUseSimulatedAuditResponse(apiKey)) {
        const simResponse = getSimulatedAIResponse(client, message, clientTransactions);
        return res.status(200).json({ response: simResponse, simulated: true });
      }
      if (!isUsableAnthropicKey(apiKey)) {
        return res.status(503).json({
          error: 'AI audit chat is not configured. Set ANTHROPIC_API_KEY to enable this production feature.',
        });
      }

      try {
        const response = await anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1000,
          system: `You are an expert AI auditor for Indian Chartered Accountants (CAs). You are auditing the ledgers of client "${client.business_name || client.name}" (GSTIN: ${client.gstin || 'N/A'}).
The client's current transactions for the month are:
${txString}

Analyze the transaction list and answer the user's question accurately. If truncated is true, clearly say the analysis is based on the included rows only. Focus on Indian tax laws, GSTR compliance, potential anomalies, duplicate transactions, missing invoices, and expense categorization. Be concise and professional.`,
          messages: [{ role: 'user', content: message }],
        });

        const firstBlock = response.content[0];
        const reply = firstBlock.type === 'text' ? firstBlock.text : '';
        return res.status(200).json({ response: reply, simulated: false });
      } catch (apiErr: any) {
        if (process.env.NODE_ENV === 'production') {
          console.error('[Anthropic] Production audit chat failed:', summarizeProviderError('anthropic', 'ca_audit_chat', apiErr));
          return res.status(502).json({ error: 'AI audit provider unavailable. Please retry later.' });
        }
        console.warn('[Anthropic] API call failed, falling back to development simulator:', summarizeProviderError('anthropic', 'ca_audit_chat', apiErr));
        const simResponse = getSimulatedAIResponse(client, message, clientTransactions);
        return res.status(200).json({ response: simResponse, simulated: true });
      }
    } catch (err: any) {
      console.error('Error in AI audit chat endpoint:', err.message);
      return res.status(500).json({ error: 'Internal Server Error: AI Chat failed' });
    }
  });

  return router;
}

function getSimulatedAIResponse(client: any, message: string, txs: any[]): string {
  const query = message.toLowerCase();
  let salesTotal = 0;
  let expenseTotal = 0;
  let unverifiedCount = 0;

  txs.forEach(t => {
    const amt = Math.abs(Number(t.amount || 0));
    if (t.type === 'Sale' || t.category === 'sales') {
      salesTotal += amt;
    } else {
      expenseTotal += amt;
    }
    if (t.status === 'Review Required' || t.confidence === 'low') {
      unverifiedCount++;
    }
  });

  const clientName = client.business_name || client.name || 'Client';

  if (query.includes('anomal') || query.includes('suspicious') || query.includes('unusual') || query.includes('duplicate')) {
    let response = `### AI Audit Anomalies Report for **${clientName}**\n\n`;
    const unverifiedTxs = txs.filter(t => t.status === 'Review Required' || t.confidence === 'low' || t.status === 'Auto-Categorized');

    if (unverifiedTxs.length > 0) {
      response += `I have identified **${unverifiedTxs.length} items** requiring attention:\n\n`;
      unverifiedTxs.forEach((t, idx) => {
        response += `${idx + 1}. **${t.category} (${t.source || 'WhatsApp'})** - **INR ${Math.abs(t.amount).toLocaleString('en-IN')}**\n`;
        if (t.status === 'Review Required') {
          response += `   - *Risk*: Lacks verified voucher proof or receipt attachment.\n`;
          response += `   - *Action*: Prompt owner on WhatsApp requesting invoice image.\n`;
        } else {
          response += `   - *Risk*: Auto-classified with medium confidence.\n`;
          response += `   - *Action*: Confirm category matching or re-assign to correct ledger.\n`;
        }
      });
    } else {
      response += `No critical anomalies or unverified transactions were detected in this period's ledger. All transactions appear to be properly verified.`;
    }
    return response;
  }

  if (query.includes('gst') || query.includes('tax') || query.includes('itc') || query.includes('reconciliation') || query.includes('gstr')) {
    const salesTax = salesTotal * 0.18;
    const purchaseTax = expenseTotal * 0.18;
    const netGst = Math.max(0, salesTax - purchaseTax);

    return `### GST Tax Reconciliation Analysis for **${clientName}**

Based on client invoices logged:
- **Consolidated Sales Revenue**: INR ${salesTotal.toLocaleString('en-IN')}
- **Outward GST Liability (GSTR-1 Estimator)**: **INR ${salesTax.toLocaleString('en-IN')}** (at 18%)
- **Consolidated Expense Value**: INR ${expenseTotal.toLocaleString('en-IN')}
- **Inward Eligible Input Tax Credit (ITC)**: **INR ${purchaseTax.toLocaleString('en-IN')}** (at 18%)
- **Net Estimated GST Payable**: **INR ${netGst.toLocaleString('en-IN')}**

**Compliance Check**:
1. ${client.gstin ? `GSTIN \`${client.gstin}\` is active. Ready to generate GSTR-1 XML file.` : 'GSTIN is missing. Client must link GST profile to complete filing.'}
2. Purchase matching indicates high confidence. Input tax offsets are within acceptable variance thresholds.`;
  }

  return `### TaxBot AI Auditor Report for **${clientName}**

I have analyzed the client's current ledger containing **${txs.length} transactions** for the period:
- **Total Inflow (Sales)**: INR ${salesTotal.toLocaleString('en-IN')}
- **Total Outflow (Expenses)**: INR ${expenseTotal.toLocaleString('en-IN')}
- **Pending Review**: ${unverifiedCount} transaction(s) requiring verification

I am ready to assist with auditing. You can ask me:
- *Show me anomalies in this client's transactions*
- *What is their estimated GST liability and GSTR status?*
- *Explain duplicate entries or categorization mismatches*`;
}
