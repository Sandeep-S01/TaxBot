import { Client, WhatsAppMessage, TransactionCategory } from '../types';
import { getTransactionById, updateTransactionCategory } from '../db/transactions';
import { sendMessage } from '../whatsapp/send';
import { generateExportToken } from './commands/export';
import { formatINR } from './commands/gst';

/**
 * Handles incoming interactive replies (buttons, list selections) from WhatsApp webhook.
 */
export async function handleInteractive(
  client: Client,
  interactive: NonNullable<WhatsAppMessage['interactive']>
): Promise<void> {
  const replyType = interactive.type;
  let replyId = '';
  let replyTitle = '';

  if (replyType === 'button_reply' && interactive.button_reply) {
    replyId = interactive.button_reply.id;
    replyTitle = interactive.button_reply.title;
  } else if (replyType === 'list_reply' && interactive.list_reply) {
    replyId = interactive.list_reply.id;
    replyTitle = interactive.list_reply.title;
  }

  if (!replyId) {
    console.warn('Received interactive message without reply ID');
    return;
  }

  console.log(`Processing interactive reply: type=${replyType}, id=${replyId}, title=${replyTitle}`);

  // 1. Handle category changes: cat_<txId>_<category>
  if (replyId.startsWith('cat_')) {
    const parts = replyId.split('_');
    if (parts.length < 3) {
      await sendMessage(client.phone, '⚠️ Invalid category change request.');
      return;
    }

    const txId = parts[1];
    const newCategory = parts[2] as TransactionCategory;

    try {
      const tx = await getTransactionById(txId);
      if (!tx || tx.client_id !== client.id) {
        await sendMessage(client.phone, '⚠️ Transaction not found or access denied.');
        return;
      }

      await updateTransactionCategory(txId, newCategory);

      const totalFormatted = formatINR(tx.amount + tx.tax_amount);
      const confirmationMsg = `✅ *Category Updated!*\n\n` +
        `• *Transaction:* ${tx.vendor_name || 'Receipt'}\n` +
        `• *Amount:* ${totalFormatted}\n` +
        `• *New Category:* *${newCategory.toUpperCase()}*\n\n` +
        `Your business reports and GST calculations have been successfully adjusted.`;

      await sendMessage(client.phone, confirmationMsg);
    } catch (err: any) {
      console.error('Error handling interactive category update:', err.message);
      await sendMessage(client.phone, '⚠️ Failed to update transaction category. Please try again.');
    }
    return;
  }

  // 2. Handle export format selection: exp_<period>_<format>
  if (replyId.startsWith('exp_')) {
    const parts = replyId.split('_');
    if (parts.length < 3) {
      await sendMessage(client.phone, '⚠️ Invalid export request.');
      return;
    }

    const period = parts[1];
    const format = parts[2]; // csv or xml

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const token = generateExportToken(client.id, period, todayStr);

      const host = process.env.NODE_ENV === 'production' 
        ? 'https://taxbot-u2vh.onrender.com' 
        : `http://localhost:${process.env.PORT || 3000}`;

      const downloadUrl = `${host}/export/${client.id}?format=${format}&period=${period}&token=${token}`;
      const formatLabel = format === 'csv' ? 'Excel CSV' : 'Tally XML';
      const emoji = format === 'csv' ? '📊' : '🧾';

      const msg = `${emoji} *Your ${formatLabel} Link is Ready!*\n\n` +
        `Click the secure link below to download your transactions for *${period}*:\n\n` +
        `${downloadUrl}\n\n` +
        `_Note: This link is secure and will expire in 24 hours._`;

      await sendMessage(client.phone, msg);
    } catch (err: any) {
      console.error('Error handling interactive export:', err.message);
      await sendMessage(client.phone, '⚠️ Failed to generate export link. Please try again.');
    }
    return;
  }

  // Unsupported interactive reply
  console.warn(`Unsupported interactive reply ID prefix: ${replyId}`);
}
