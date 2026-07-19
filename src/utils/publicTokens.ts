import crypto from 'crypto';
import { getExportTokenSecret } from '../config/env';

const PAYMENT_TOKEN_TTL_DAYS = 7;

export function generatePaymentToken(txId: string, issuedDate: string): string {
  return crypto
    .createHmac('sha256', getExportTokenSecret())
    .update(`payment:${txId}:${issuedDate}`)
    .digest('hex');
}

export function validatePaymentToken(txId: string, issuedDate: string, token: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedDate) || !/^[a-f0-9]{64}$/i.test(token)) {
    return false;
  }

  const issuedTime = new Date(`${issuedDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(issuedTime)) {
    return false;
  }

  const now = Date.now();
  const maxAgeMs = PAYMENT_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  if (issuedTime > now || now - issuedTime > maxAgeMs) {
    return false;
  }

  const expected = generatePaymentToken(txId, issuedDate);
  const receivedBuffer = Buffer.from(token, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function createPaymentLink(baseUrl: string, txId: string, issuedDate = new Date().toISOString().split('T')[0]): string {
  const token = generatePaymentToken(txId, issuedDate);
  const normalizedBase = baseUrl.replace(/\/$/, '');
  return `${normalizedBase}/pay/${encodeURIComponent(txId)}?issued=${encodeURIComponent(issuedDate)}&token=${encodeURIComponent(token)}`;
}
