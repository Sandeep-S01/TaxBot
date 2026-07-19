import { Router } from 'express';
import { verifyWebhook } from '../webhook/verify';
import { handleWebhook } from '../webhook/handler';

export function createWebhookRoutes(): Router {
  const router = Router();

  router.get('/webhook', verifyWebhook);
  router.post('/webhook', handleWebhook);

  return router;
}
