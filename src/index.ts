import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { verifyWebhook } from './webhook/verify';
import { handleWebhook } from './webhook/handler';
import { initRemindersJob } from './jobs/reminders';
import { validateExportToken } from './handlers/commands/export';
import { getClientById, getClientByPhone, createClient, updateClient } from './db/clients';
import { getTransactionsByDateRange, periodToDateRange } from './db/transactions';
import { exportToCSV, exportToTallyXML } from './utils/exporter';
import { createCA, getCAByEmail, getCAClients, getConsolidatedGSTRSummary, linkClientToCA } from './db/cas';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Standard middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static landing page & dashboard files from the public folder
app.use(express.static('public'));

// --- CA PARTNER CONSOLE API ENDPOINTS ---

// 1. CA Registration
app.post('/api/ca/register', async (req, res) => {
  const { name, email, password, firmName } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields (name, email, password)' });
  }

  try {
    const existing = await getCAByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'A Chartered Accountant account with this email already exists' });
    }

    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const ca = await createCA({
      name,
      email,
      password_hash: passwordHash,
      firm_name: firmName || null,
    });

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
app.post('/api/ca/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  try {
    const ca = await getCAByEmail(email);
    if (!ca) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const inputHash = crypto.createHash('sha256').update(password).digest('hex');
    if (ca.password_hash !== inputHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    return res.status(200).json({
      message: 'Login successful',
      ca: { id: ca.id, name: ca.name, email: ca.email, firm_name: ca.firm_name },
    });
  } catch (err: any) {
    console.error('CA login error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Login failed' });
  }
});

// 3. Get clients managed by CA
app.get('/api/ca/clients', async (req, res) => {
  const caId = req.headers['x-ca-id'] as string;

  if (!caId) {
    return res.status(401).json({ error: 'Unauthorized: Missing x-ca-id header' });
  }

  try {
    const clients = await getCAClients(caId);
    return res.status(200).json(clients);
  } catch (err: any) {
    console.error('Error fetching CA clients:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Could not fetch clients' });
  }
});

// 4. Add or link a client under CA
app.post('/api/ca/clients', async (req, res) => {
  const caId = req.headers['x-ca-id'] as string;
  const { name, phone, businessName, gstin, plan, gstRegistered } = req.body;

  if (!caId) {
    return res.status(401).json({ error: 'Unauthorized: Missing x-ca-id header' });
  }

  if (!phone) {
    return res.status(400).json({ error: 'Missing phone number' });
  }

  try {
    // Standardize phone format
    let cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    }

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
          gstin: gstin || client.gstin,
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
        gstin: gstin || null,
        plan: plan || 'trial',
        gst_registered: gstRegistered || false,
        ca_id: caId,
      });
    }

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
app.get('/api/ca/clients/:clientId/transactions', async (req, res) => {
  const caId = req.headers['x-ca-id'] as string;
  const { clientId } = req.params;
  const { period } = req.query as { period?: string };

  if (!caId) {
    return res.status(401).json({ error: 'Unauthorized: Missing x-ca-id header' });
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

    const transactions = await getTransactionsByDateRange(clientId, startDate, endDate);
    return res.status(200).json({
      period: targetPeriod,
      client,
      transactions,
    });
  } catch (err: any) {
    console.error('Error fetching CA client transactions:', err.message);
    return res.status(500).json({ error: 'Internal Server Error: Could not fetch transactions' });
  }
});

// 6. Get consolidated GSTR summary for all CA's clients
app.get('/api/ca/reports/gst', async (req, res) => {
  const caId = req.headers['x-ca-id'] as string;
  const { period } = req.query as { period?: string };

  if (!caId) {
    return res.status(401).json({ error: 'Unauthorized: Missing x-ca-id header' });
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

// --- END CA ENDPOINTS ---


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
