import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import multer from 'multer';
import { handleDocumentBuffer } from './handlers/document';
import { verifyWebhook } from './webhook/verify';
import { handleWebhook } from './webhook/handler';
import { initRemindersJob } from './jobs/reminders';
import { validateExportToken } from './handlers/commands/export';
import { getClientById, getClientByPhone, createClient, updateClient } from './db/clients';
import { getTransactionsByDateRange, periodToDateRange, getTransactionById, getTransactionsSince } from './db/transactions';
import { exportToCSV, exportToTallyXML } from './utils/exporter';
import { createCA, getCAByEmail, getCAClients, getConsolidatedGSTRSummary, linkClientToCA } from './db/cas';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

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

// Tally sync pull endpoint
app.get('/api/sync/:clientId', async (req, res) => {
  const caId = req.headers['x-ca-id'] as string;
  const { clientId } = req.params;
  const { since } = req.query as { since?: string };

  if (!caId) {
    return res.status(401).json({ error: 'Unauthorized: Missing x-ca-id header' });
  }

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
      const xmlContent = exportToTallyXML(
        transactions, 
        client.business_name || client.name || 'Client Account',
        client.gstin
      );
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

// Dynamic Mobile Checkout Pay Page Redirect
app.get('/pay/:txId', async (req, res) => {
  const { txId } = req.params;

  try {
    const tx = await getTransactionById(txId);
    if (!tx) {
      return res.status(404).send('<h1>Invoice/Transaction not found</h1>');
    }

    const client = await getClientById(tx.client_id);
    if (!client) {
      return res.status(404).send('<h1>Merchant account not found</h1>');
    }

    // Standardize phone for VPA fallback
    const rawPhone = client.phone.trim();
    const phoneNo = rawPhone.startsWith('91') && rawPhone.length > 10 ? rawPhone.substring(2) : rawPhone;
    
    // Default VPA to a phone-linked Paytm VPA if they don't have GSTIN
    const merchantVpa = client.gstin ? `${client.gstin}@okaxis` : `${phoneNo}@paytm`;
    const merchantName = client.business_name || client.name || 'TaxBot Merchant';
    const amount = Number(tx.amount) + Number(tx.tax_amount || 0);
    const invoiceNo = tx.invoice_number || txId.substring(0, 8).toUpperCase();
    const description = tx.description || 'Payment via TaxBot';

    // Build the UPI deep link
    const upiUri = `upi://pay?pa=${encodeURIComponent(merchantVpa)}&pn=${encodeURIComponent(merchantName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Inv_' + invoiceNo)}`;
    
    // Render responsive checkout card
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pay ${merchantName} - TaxBot CheckOut</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body {
      background-color: #0b0d19;
      color: #f3f4f6;
      font-family: 'Inter', sans-serif;
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .checkout-card {
      background: rgba(17, 24, 39, 0.7);
      border: 1px solid rgba(99, 102, 241, 0.25);
      backdrop-filter: blur(20px);
      width: 100%;
      max-width: 420px;
      padding: 32px;
      border-radius: 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5), 0 0 30px rgba(99, 102, 241, 0.15);
      text-align: center;
      margin: 16px;
    }
    h2 {
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      font-size: 24px;
      margin: 0 0 4px 0;
      color: #fff;
    }
    .merchant-subtitle {
      color: #9ca3af;
      font-size: 13px;
      margin-bottom: 24px;
      word-break: break-all;
    }
    .price-tag {
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      font-size: 40px;
      color: #10b981;
      margin-bottom: 8px;
    }
    .details-box {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
      text-align: left;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .detail-row:last-child {
      margin-bottom: 0;
    }
    .label {
      color: #9ca3af;
    }
    .value {
      color: #fff;
      font-weight: 600;
    }
    .btn-pay {
      background: linear-gradient(135deg, #6366f1, #a855f7);
      color: #fff;
      border: none;
      padding: 16px 24px;
      font-family: 'Outfit', sans-serif;
      font-weight: 600;
      font-size: 16px;
      border-radius: 9999px;
      cursor: pointer;
      width: 100%;
      text-decoration: none;
      display: inline-block;
      box-sizing: border-box;
      box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn-pay:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
    }
    .qr-container {
      margin: 24px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .qr-code {
      background: #fff;
      padding: 12px;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      width: 160px;
      height: 160px;
    }
    .qr-text {
      font-size: 12px;
      color: #9ca3af;
      margin-top: 10px;
    }
    .footer-logo {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: 24px;
      font-size: 13px;
      color: #6b7280;
    }
    .logo-dot {
      width: 6px;
      height: 6px;
      background-color: #6366f1;
      border-radius: 50%;
    }
  </style>
</head>
<body>
  <div class="checkout-card">
    <h2>Pay ${merchantName}</h2>
    <div class="merchant-subtitle">VPA: ${merchantVpa}</div>
    
    <div class="price-tag">₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
    
    <div class="details-box">
      <div class="detail-row">
        <span class="label">Invoice No:</span>
        <span class="value">#${invoiceNo}</span>
      </div>
      <div class="detail-row">
        <span class="label">Description:</span>
        <span class="value">${description}</span>
      </div>
      <div class="detail-row">
        <span class="label">Billing Date:</span>
        <span class="value">${tx.date}</span>
      </div>
    </div>

    <!-- Mobile CTA -->
    <a href="${upiUri}" class="btn-pay">Pay with UPI App</a>

    <!-- Desktop Scan QR Code Fallback -->
    <div class="qr-container">
      <img class="qr-code" src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=090b10&data=${encodeURIComponent(upiUri)}" alt="UPI QR Code">
      <div class="qr-text">Or scan this QR using GPay, PhonePe, or Paytm</div>
    </div>

    <div class="footer-logo">
      <span class="logo-dot"></span> Powered by TaxBot Secure Pay
    </div>
  </div>
</body>
</html>
    `;
    return res.status(200).send(html);
  } catch (err: any) {
    console.error('UPI checkout page error:', err.message);
    return res.status(500).send('Internal Server Error: Could not resolve checkout details.');
  }
});

// Inbound Email Bank Statement PDF Webhook
app.post('/api/webhooks/email', upload.any(), async (req, res) => {
  console.log('Received inbound email webhook:', req.body);

  const toEmail = req.body.to || '';
  const fromEmail = req.body.from || '';
  const subject = req.body.subject || '';

  // Extract Client ID using pattern: ledger-<client_id>@taxbot.in
  const match = toEmail.match(/ledger-([a-zA-Z0-9\-]+)@taxbot\.in/i);
  if (!match) {
    console.warn(`[Email Webhook] Recipient address does not match ledger pattern: ${toEmail}`);
    return res.status(400).json({ error: 'Invalid recipient address format' });
  }

  const clientId = match[1];

  try {
    // 1. Resolve client
    const client = await getClientById(clientId);
    if (!client) {
      console.warn(`[Email Webhook] Client not found with ID: ${clientId}`);
      return res.status(404).json({ error: 'Client not found' });
    }

    // 2. Identify attachments. Multer stores files in req.files
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      console.warn('[Email Webhook] No file attachments found in webhook payload');
      return res.status(400).json({ error: 'No attachments found' });
    }

    // Find the first PDF attachment
    const pdfFile = files.find(
      (f) =>
        f.mimetype.includes('pdf') ||
        f.originalname.toLowerCase().endsWith('.pdf')
    );

    if (!pdfFile) {
      console.warn('[Email Webhook] No PDF files found in attachments');
      return res.status(400).json({ error: 'No PDF attachment found' });
    }

    console.log(`[Email Webhook] Processing PDF: name=${pdfFile.originalname}, size=${pdfFile.size} bytes, client=${client.name}`);

    // Process PDF buffer asynchronously
    handleDocumentBuffer(client, pdfFile.buffer, pdfFile.originalname, pdfFile.mimetype)
      .then(() => {
        console.log(`[Email Webhook] PDF statement parsed and logged for client: ${client.id}`);
      })
      .catch((err) => {
        console.error(`[Email Webhook] Failed to process PDF for client ${client.id}:`, err);
      });

    return res.status(200).json({ message: 'Email received, processing started' });
  } catch (err: any) {
    console.error('Error in email webhook route:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
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
