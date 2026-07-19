import { Router } from 'express';
import { verifyWebhook } from '../webhook/verify';
import { handleWebhook } from '../webhook/handler';
import { requireMetaSignature } from '../webhook/signature';

export function createWebhookRoutes(): Router {
  const router = Router();

  router.get('/webhook', verifyWebhook);
  router.post('/webhook', requireMetaSignature, handleWebhook);

  return router;
}
