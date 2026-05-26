import { Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN;

/**
 * Validates Meta WhatsApp Cloud API subscription webhook verify requests.
 * Express GET /webhook
 */
export function verifyWebhook(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
      console.log('Webhook verification successful. Registered with Meta.');
      return res.status(200).send(challenge);
    } else {
      console.warn('Webhook verification failed. Verify tokens mismatch.');
      return res.status(403).send('Forbidden');
    }
  }
  
  return res.status(400).send('Bad Request');
}
