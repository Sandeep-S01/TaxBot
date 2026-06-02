import { Client, TransactionCategory, GstCategory, GstRate } from '../types';
import { executeHelp } from './commands/help';
import { executeGstin } from './commands/gstin';
import { executeGst } from './commands/gst';
import { executeReport } from './commands/report';
import { executeExport } from './commands/export';
import { createTransaction } from '../db/transactions';
import { askClaude } from '../ai/claude';
import { askGemini } from '../ai/gemini';
import { CONVERSATIONAL_ASSISTANT_SYSTEM_PROMPT } from '../ai/prompts';
import { sendMessage } from '../whatsapp/send';
import { formatINR } from './commands/gst';

/**
 * Handles incoming text messages and routes them to appropriate commands or conversational AI.
 */
export async function handleText(client: Client, text: string): Promise<void> {
  const cleanText = text.trim();
  const lowerText = cleanText.toLowerCase();

  // 1. HELP command
  if (lowerText === 'help' || lowerText === 'commands' || lowerText === 'hello' || lowerText === 'hi') {
    await executeHelp(client);
    return;
  }

  // 2. GSTIN registration command
  if (lowerText.startsWith('gstin')) {
    const parts = cleanText.split(/\s+/);
    if (parts.length < 2) {
      await sendMessage(client.phone, '⚠️ Please provide a GSTIN. Example: *gstin 29ABCDE1234F1Z5*');
      return;
    }
    await executeGstin(client, parts[1]);
    return;
  }

  // 3. GST Report command
  if (lowerText.startsWith('gst') || lowerText.startsWith('gst summary')) {
    const parts = cleanText.split(/\s+/);
    // Find if a YYYY-MM period is specified
    const period = parts.find((p) => /^\d{4}-\d{2}$/.test(p));
    await executeGst(client, period);
    return;
  }

  // 4. P&L Report command
  if (lowerText === 'report' || lowerText === 'pl' || lowerText === 'p&l' || lowerText.startsWith('report ') || lowerText.startsWith('pl ') || lowerText.startsWith('p&l ')) {
    const parts = cleanText.split(/\s+/);
    const period = parts.find((p) => /^\d{4}-\d{2}$/.test(p));
    await executeReport(client, period);
    return;
  }

  // 5. CA Export command
  if (lowerText.startsWith('export')) {
    const parts = cleanText.split(/\s+/);
    const period = parts.find((p) => /^\d{4}-\d{2}$/.test(p));
    await executeExport(client, period);
    return;
  }

  // 5. MANUAL TRANSACTION ENTRIES
  // Match "add sale 5000 [description]"
  const saleMatch = cleanText.match(/^add\s+sale\s+(\d+(?:\.\d{1,2})?)(?:\s+(.+))?$/i);
  if (saleMatch) {
    await handleManualAdd(client, 'sales', parseFloat(saleMatch[1]), saleMatch[2]);
    return;
  }

  // Match "add purchase 5000 [description]"
  const purchaseMatch = cleanText.match(/^add\s+purchase\s+(\d+(?:\.\d{1,2})?)(?:\s+(.+))?$/i);
  if (purchaseMatch) {
    await handleManualAdd(client, 'purchase', parseFloat(purchaseMatch[1]), purchaseMatch[2]);
    return;
  }

  // Match "add expense 500 [description]"
  const expenseMatch = cleanText.match(/^add\s+expense\s+(\d+(?:\.\d{1,2})?)(?:\s+(.+))?$/i);
  if (expenseMatch) {
    await handleManualAdd(client, 'expense', parseFloat(expenseMatch[1]), expenseMatch[2]);
    return;
  }

  // 6. Conversational query fallback
  // Detect if Hindi script is present to provide hint to helper.
  const hasHindi = /[\u0900-\u097F]/.test(cleanText);
  const lang = hasHindi ? 'hi' : 'en';

  const reply = (process.env.GEMINI_API_KEY || process.env.Gemini_API_KEY)
    ? await askGemini(CONVERSATIONAL_ASSISTANT_SYSTEM_PROMPT, cleanText, lang)
    : await askClaude(CONVERSATIONAL_ASSISTANT_SYSTEM_PROMPT, cleanText, lang);
  await sendMessage(client.phone, reply);
}

/**
 * Helper to record manual transactions in the database
 */
async function handleManualAdd(
  client: Client,
  category: 'sales' | 'purchase' | 'expense',
  amount: number,
  description?: string
): Promise<void> {
  const todayStr = new Date().toISOString().split('T')[0];
  const desc = description?.trim() || `Manual ${category}`;

  const gstCategory: GstCategory = category === 'sales' ? 'B2C' : 'exempt';
  const gstRate: GstRate = 0;

  try {
    const tx = await createTransaction({
      client_id: client.id,
      date: todayStr,
      description: desc,
      vendor_name: category === 'sales' ? 'Self' : 'Vendor',
      amount,
      tax_amount: 0,
      category,
      gst_category: gstCategory,
      gst_rate: gstRate,
      hsn_sac: null,
      invoice_number: null,
      source: 'manual',
      raw_text: `Manual input: add ${category} ${amount} ${desc}`,
      confidence: 'high',
    });

    const successMessage = `✅ *Transaction Logged!*
• *Type:* ${category.toUpperCase()}
• *Date:* ${tx.date}
• *Amount:* ${formatINR(amount)} (excluding tax)
• *Description:* "${desc}"

Your reports and summaries have been updated automatically.`;

    await sendMessage(client.phone, successMessage);
  } catch (err: any) {
    console.error('Error logging manual transaction:', err.message);
    await sendMessage(
      client.phone,
      `⚠️ Could not record transaction. Please check the amount formatting and try again.`
    );
  }
}
