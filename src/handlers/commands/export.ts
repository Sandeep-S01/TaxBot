import crypto from 'crypto';
import { Client } from '../../types';
import { sendMessage } from '../../whatsapp/send';

// Secret token base
const SECRET = process.env.SUPABASE_ANON_KEY || 'default-secret';

/**
 * Computes a secure, stateless, 24-hour temporary token for downloading client documents.
 */
export function generateExportToken(clientId: string, period: string, dateStr: string): string {
  return crypto
    .createHmac('sha256', SECRET)
    .update(`${clientId}-${period}-${dateStr}`)
    .digest('hex');
}

/**
 * Validates the temporary download token.
 */
export function validateExportToken(clientId: string, period: string, token: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Token is valid if generated today or yesterday (allows 24-48 hour window)
  const tokenToday = generateExportToken(clientId, period, today);
  const tokenYesterday = generateExportToken(clientId, period, yesterday);

  return token === tokenToday || token === tokenYesterday;
}

/**
 * Handles the 'export' WhatsApp command.
 * Format: export [YYYY-MM]
 */
export async function executeExport(client: Client, periodParam?: string): Promise<void> {
  let period = periodParam?.trim();

  // If no period is specified, use the current month
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    period = `${yyyy}-${mm}`;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const token = generateExportToken(client.id, period, todayStr);

  // Host URL from environment or fallback to local
  const host = process.env.NODE_ENV === 'production' 
    ? 'https://taxbot-u2vh.onrender.com' 
    : `http://localhost:${process.env.PORT || 3000}`;

  const csvUrl = `${host}/export/${client.id}?format=csv&period=${period}&token=${token}`;
  const xmlUrl = `${host}/export/${client.id}?format=xml&period=${period}&token=${token}`;

  const message = `📤 *CA Export Prepared!* (${period})\n\n` +
    `Your files have been generated. Click the links below to download them directly. These links are secure and valid for 24 hours.\n\n` +
    `📊 *Download Excel CSV:*\n${csvUrl}\n\n` +
    `🧾 *Download Tally XML:*\n${xmlUrl}\n\n` +
    `_Tip: Send these files to your Chartered Accountant (CA) to import transactions directly._`;

  await sendMessage(client.phone, message);
}
