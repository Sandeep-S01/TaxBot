import { Router } from 'express';
import { RateLimitRequestHandler } from 'express-rate-limit';
import multer from 'multer';
import { handleDocumentBuffer } from '../handlers/document';
import { getClientById } from '../db/clients';
import { requireEmailWebhookSecret } from '../webhook/emailAuth';

export function createEmailRoutes(emailWebhookLimiter: RateLimitRequestHandler): Router {
  const router = Router();
  const upload = multer({
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 5,
      fields: 20,
      parts: 30,
    },
  });

  router.post('/api/webhooks/email', emailWebhookLimiter, requireEmailWebhookSecret, upload.any(), async (req, res) => {
    console.log('[Email Webhook] Received inbound email webhook', {
      to: req.body.to || undefined,
      attachmentCount: Array.isArray(req.files) ? req.files.length : 0,
    });

    const toEmail = req.body.to || '';
    const match = toEmail.match(/ledger-([a-zA-Z0-9\-]+)@taxbot\.in/i);
    if (!match) {
      console.warn(`[Email Webhook] Recipient address does not match ledger pattern: ${toEmail}`);
      return res.status(400).json({ error: 'Invalid recipient address format' });
    }

    const clientId = match[1];

    try {
      const client = await getClientById(clientId);
      if (!client) {
        console.warn(`[Email Webhook] Client not found with ID: ${clientId}`);
        return res.status(404).json({ error: 'Client not found' });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        console.warn('[Email Webhook] No file attachments found in webhook payload');
        return res.status(400).json({ error: 'No attachments found' });
      }

      const pdfFile = files.find(
        (file) =>
          file.mimetype.includes('pdf') ||
          file.originalname.toLowerCase().endsWith('.pdf')
      );

      if (!pdfFile) {
        console.warn('[Email Webhook] No PDF files found in attachments');
        return res.status(400).json({ error: 'No PDF attachment found' });
      }

      console.log(`[Email Webhook] Processing PDF: name=${pdfFile.originalname}, size=${pdfFile.size} bytes, client=${client.name}`);

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

  return router;
}
