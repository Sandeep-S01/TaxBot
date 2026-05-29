import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { verifyWebhook } from './webhook/verify';
import { handleWebhook } from './webhook/handler';
import { initRemindersJob } from './jobs/reminders';
import { validateExportToken } from './handlers/commands/export';
import { getClientById } from './db/clients';
import { getTransactionsByDateRange, periodToDateRange } from './db/transactions';
import { exportToCSV, exportToTallyXML } from './utils/exporter';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Standard middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'TaxBot API',
    uptime: process.uptime(),
  });
});

// Secure download route for CA Export files
app.get('/export/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const { format, period, token } = req.query as { format: string; period: string; token: string };

  if (!format || !period || !token) {
    return res.status(400).send('Bad Request: Missing parameters (format, period, token)');
  }

  // 1. Validate the secure temporary token
  const isValid = validateExportToken(clientId, period, token);
  if (!isValid) {
    return res.status(403).send('Forbidden: Invalid or expired download token');
  }

  try {
    // 2. Fetch the client details
    const client = await getClientById(clientId);
    if (!client) {
      return res.status(404).send('Not Found: Client not found');
    }

    // 3. Convert period to date range
    const { startDate, endDate } = periodToDateRange(period);

    // 4. Fetch client transactions for the period
    const transactions = await getTransactionsByDateRange(clientId, startDate, endDate);

    if (format === 'csv') {
      const csvContent = exportToCSV(transactions);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="TaxBot_Ledger_${period}.csv"`);
      return res.status(200).send(csvContent);
    } else if (format === 'xml') {
      const xmlContent = exportToTallyXML(transactions, client.business_name || client.name || 'Client Account');
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="TaxBot_Tally_${period}.xml"`);
      return res.status(200).send(xmlContent);
    } else {
      return res.status(400).send('Bad Request: Invalid format (must be csv or xml)');
    }
  } catch (err: any) {
    console.error('Export download error:', err.message);
    return res.status(500).send('Internal Server Error: Could not generate export file');
  }
});

// Meta WhatsApp Webhook endpoints
app.get('/webhook', verifyWebhook);
app.post('/webhook', handleWebhook);

// Initialize scheduled cron jobs
initRemindersJob();

// Start the server
const server = app.listen(PORT, () => {
  console.log(`🚀 TaxBot Express server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Webhook Verification Endpoint: GET /webhook');
  console.log('Webhook Message Handler Endpoint: POST /webhook');
});

export { app, server };
