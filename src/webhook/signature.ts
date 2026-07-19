import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const SIGNATURE_HEADER = 'x-hub-signature-256';

function getMetaAppSecret(): string | undefined {
  return process.env.META_APP_SECRET;
}

export function captureRawBody(req: Request, _res: Response, buf: Buffer): void {
  if (buf.length > 0) {
    (req as any).rawBody = Buffer.from(buf);
  }
}

export function isValidMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | string[] | undefined,
  appSecret: string
): boolean {
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const receivedHex = signature.slice('sha256='.length);
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) {
    return false;
  }

  const expectedHex = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const received = Buffer.from(receivedHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export function requireMetaSignature(req: Request, res: Response, next: NextFunction) {
  const appSecret = getMetaAppSecret();
  const rawBody = (req as any).rawBody as Buffer | undefined;

  if (!appSecret) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).send('Webhook signature verification is not configured');
    }
    console.warn('[Webhook] META_APP_SECRET is not set; skipping signature verification outside production.');
    return next();
  }

  if (!rawBody) {
    return res.status(400).send('Bad Request: Raw request body missing');
  }

  if (!isValidMetaSignature(rawBody, req.headers[SIGNATURE_HEADER], appSecret)) {
    console.warn('[Webhook] Rejected request with invalid Meta signature.');
    return res.status(401).send('Unauthorized: Invalid webhook signature');
  }

  return next();
}
