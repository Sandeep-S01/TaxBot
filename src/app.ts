import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { createCARoutes } from './routes/ca';
import { createPublicRoutes } from './routes/public';
import { createEmailRoutes } from './routes/email';
import { createSyncRoutes } from './routes/sync';
import { createWebhookRoutes } from './routes/webhook';
import { initRemindersJob } from './jobs/reminders';
import { captureRawBody } from './webhook/signature';
import { getCorsOptions, getHelmetOptions } from './config/security';
import { requestIdMiddleware } from './middleware/requestId';
import { shouldTrustProxy } from './runtime/serverLifecycle';

export interface CreateAppOptions {
  startJobs?: boolean;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const publicDir = path.resolve(__dirname, '..', 'public');
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
  const downloadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });
  const emailWebhookLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

  if (shouldTrustProxy()) {
    app.set('trust proxy', 1);
  }

  app.use(requestIdMiddleware);
  app.use(helmet(getHelmetOptions()));
  app.use(cors(getCorsOptions()));
  app.use(express.json({ limit: '1mb', verify: captureRawBody }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(express.static(publicDir));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use(createCARoutes(authLimiter));
  app.use(createPublicRoutes(downloadLimiter));
  app.use(createEmailRoutes(emailWebhookLimiter));
  app.use(createSyncRoutes());
  app.use(createWebhookRoutes());

  if (options.startJobs !== false) {
    initRemindersJob();
  }

  return app;
}
