import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { validateEnvironment } from './config/env';
import { createCARoutes } from './routes/ca';
import { createPublicRoutes } from './routes/public';
import { createEmailRoutes } from './routes/email';
import { createSyncRoutes } from './routes/sync';
import { createWebhookRoutes } from './routes/webhook';
import { initRemindersJob } from './jobs/reminders';
import { captureRawBody } from './webhook/signature';
import { getCorsOptions, getHelmetOptions } from './config/security';
import { requestIdMiddleware } from './middleware/requestId';

dotenv.config();
validateEnvironment();

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.resolve(__dirname, '..', 'public');
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const downloadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });

// Standard middleware
app.use(requestIdMiddleware);
app.use(helmet(getHelmetOptions()));
app.use(cors(getCorsOptions()));
app.use(express.json({ limit: '1mb', verify: captureRawBody }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve static landing page & dashboard files from the public folder
app.use(express.static(publicDir));
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});
app.use(createCARoutes(authLimiter));
app.use(createPublicRoutes(downloadLimiter));
app.use(createEmailRoutes());
app.use(createSyncRoutes());
app.use(createWebhookRoutes());




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
