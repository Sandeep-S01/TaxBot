import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

function getConfiguredSecret(): string | undefined {
  return process.env.EMAIL_WEBHOOK_SECRET;
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function isValidEmailWebhookSecret(providedSecret: unknown, configuredSecret = getConfiguredSecret()): boolean {
  if (typeof providedSecret !== 'string' || !providedSecret || !configuredSecret) {
    return false;
  }
  return timingSafeEqualString(providedSecret, configuredSecret);
}

function extractEmailWebhookSecret(req: Request): string | undefined {
  const bearer = req.header('authorization');
  if (bearer?.toLowerCase().startsWith('bearer ')) {
    return bearer.slice('bearer '.length).trim();
  }
  return req.header('x-taxbot-email-secret');
}

export function requireEmailWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const configuredSecret = getConfiguredSecret();
  if (!configuredSecret) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ error: 'Email webhook verification is not configured' });
    }
    console.warn('[Email Webhook] EMAIL_WEBHOOK_SECRET is not set; skipping verification outside production.');
    return next();
  }

  if (!isValidEmailWebhookSecret(extractEmailWebhookSecret(req), configuredSecret)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid email webhook secret' });
  }

  return next();
}
