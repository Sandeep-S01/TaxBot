import crypto from 'crypto';
import { Client } from '../../types';
import { sendMessage, sendInteractiveButtons } from '../../whatsapp/send';

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

  const message = `📤 *CA Export Prepared!* (${period})\n\nChoose the file format you want to download. You can import these directly into your accounting software.`;
  const buttons = [
    { id: `exp_${period}_csv`, title: 'Excel CSV' },
    { id: `exp_${period}_xml`, title: 'Tally XML' }
  ];

  await sendInteractiveButtons(client.phone, message, buttons);
}
