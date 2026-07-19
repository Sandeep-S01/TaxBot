import { Router } from 'express';
import { RateLimitRequestHandler } from 'express-rate-limit';
import { validateExportToken } from '../handlers/commands/export';
import { getClientById } from '../db/clients';
import {
  getTransactionById,
  getTransactionsByDateRange,
  periodToDateRange,
} from '../db/transactions';
import { exportToCSV, exportToTallyXML } from '../utils/exporter';
import { escapeHtml } from '../utils/sanitize';

export function createPublicRoutes(downloadLimiter: RateLimitRequestHandler): Router {
  const router = Router();

  router.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'TaxBot API',
      uptime: process.uptime(),
    });
  });

  router.get('/export/:clientId', downloadLimiter, async (req, res) => {
    const { clientId } = req.params;
    const { format, period, token } = req.query as { format: string; period: string; token: string };

    if (!format || !period || !token) {
      return res.status(400).send('Bad Request: Missing parameters (format, period, token)');
    }

    const isValid = validateExportToken(clientId, period, token);
    if (!isValid) {
      return res.status(403).send('Forbidden: Invalid or expired download token');
    }

    try {
      const client = await getClientById(clientId);
      if (!client) {
        return res.status(404).send('Not Found: Client not found');
      }

      const { startDate, endDate } = periodToDateRange(period);
      const transactions = await getTransactionsByDateRange(clientId, startDate, endDate);

      if (format === 'csv') {
        const csvContent = exportToCSV(transactions);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="TaxBot_Ledger_${period}.csv"`);
        return res.status(200).send(csvContent);
      }

      if (format === 'xml') {
        const xmlContent = exportToTallyXML(
          transactions,
          client.business_name || client.name || 'Client Account',
          client.gstin
        );
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="TaxBot_Tally_${period}.xml"`);
        return res.status(200).send(xmlContent);
      }

      return res.status(400).send('Bad Request: Invalid format (must be csv or xml)');
    } catch (err: any) {
      console.error('Export download error:', err.message);
      return res.status(500).send('Internal Server Error: Could not generate export file');
    }
  });

  router.get('/pay/:txId', downloadLimiter, async (req, res) => {
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

      const rawPhone = client.phone.trim();
      const phoneNo = rawPhone.startsWith('91') && rawPhone.length > 10 ? rawPhone.substring(2) : rawPhone;
      const merchantVpa = client.gstin ? `${client.gstin}@okaxis` : `${phoneNo}@paytm`;
      const merchantName = client.business_name || client.name || 'TaxBot Merchant';
      const amount = Number(tx.amount) + Number(tx.tax_amount || 0);
      const invoiceNo = tx.invoice_number || txId.substring(0, 8).toUpperCase();
      const description = tx.description || 'Payment via TaxBot';
      const safeMerchantName = escapeHtml(merchantName);
      const safeMerchantVpa = escapeHtml(merchantVpa);
      const safeInvoiceNo = escapeHtml(invoiceNo);
      const safeDescription = escapeHtml(description);
      const safeDate = escapeHtml(tx.date);
      const upiUri = `upi://pay?pa=${encodeURIComponent(merchantVpa)}&pn=${encodeURIComponent(merchantName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Inv_' + invoiceNo)}`;

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pay ${safeMerchantName} - TaxBot CheckOut</title>
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
    <h2>Pay ${safeMerchantName}</h2>
    <div class="merchant-subtitle">VPA: ${safeMerchantVpa}</div>
    <div class="price-tag">INR ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
    <div class="details-box">
      <div class="detail-row">
        <span class="label">Invoice No:</span>
        <span class="value">#${safeInvoiceNo}</span>
      </div>
      <div class="detail-row">
        <span class="label">Description:</span>
        <span class="value">${safeDescription}</span>
      </div>
      <div class="detail-row">
        <span class="label">Billing Date:</span>
        <span class="value">${safeDate}</span>
      </div>
    </div>
    <a href="${escapeHtml(upiUri)}" class="btn-pay">Pay with UPI App</a>
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

  return router;
}
