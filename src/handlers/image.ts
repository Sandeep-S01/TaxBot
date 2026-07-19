import { Client } from '../types';
import { sendMessage, sendInteractiveList } from '../whatsapp/send';
import { downloadMedia } from '../whatsapp/media';
import { categoriseReceipt } from '../ai/categorise';
import { createTransaction } from '../db/transactions';
import { formatINR } from './commands/gst';
import { createPaymentLink } from '../utils/publicTokens';
import { getPublicAppOrigin } from '../utils/origin';

/**
 * Handles incoming WhatsApp images (receipts/invoices).
 * Sends an acknowledgement, downloads media, runs AI extraction, and stores the transaction.
 */
export async function handleImage(client: Client, mediaId: string, mimeType: string): Promise<void> {
  // 1. Instant acknowledgment (must be < 2 seconds)
  await sendMessage(client.phone, 'Reading your receipt... 🔍');

  try {
    // 2. Download receipt image from WhatsApp Cloud API
    const downloaded = await downloadMedia(mediaId);

    // 3. Process image with Claude Vision API
    const extraction = await categoriseReceipt(downloaded.buffer, downloaded.mimeType || mimeType);

    if (extraction.error) {
      if (extraction.error === 'not_a_receipt') {
        await sendMessage(
          client.phone,
          "❌ This doesn't look like a valid receipt or invoice. Please send a clear, well-lit photo of your receipt or bill."
        );
      } else {
        await sendMessage(
          client.phone,
          "⚠️ I encountered a brief technical delay while analyzing your receipt. Our engineering team has been notified. Please try uploading the image again in a few minutes, or feel free to reach out to us at info@theanantastore.in if the issue persists."
        );
      }
      return;
    }


    // 4. Save transaction to database
    const todayStr = new Date().toISOString().split('T')[0];
    const txDate = extraction.date && /^\d{4}-\d{2}-\d{2}$/.test(extraction.date) ? extraction.date : todayStr;

    const tx = await createTransaction({
      client_id: client.id,
      date: txDate,
      description: extraction.description || `OCR: ${extraction.vendor_name || 'Receipt'}`,
      vendor_name: extraction.vendor_name || 'Vendor',
      amount: Number(extraction.amount),
      tax_amount: Number(extraction.tax_amount || 0),
      category: extraction.category || 'expense',
      gst_category: extraction.gst_category || 'B2C',
      gst_rate: extraction.gst_rate || 0,
      hsn_sac: extraction.hsn_sac || null,
      invoice_number: extraction.invoice_number || null,
      vendor_gstin: extraction.vendor_gstin || null,
      source: 'whatsapp_image',
      raw_text: JSON.stringify(extraction),
      confidence: extraction.confidence || 'medium',
    });

    // 5. Build response message based on confidence levels
    const directionEmoji = tx.category === 'sales' ? '📥' : '📤';
    const amountFormatted = formatINR(tx.amount);
    const taxFormatted = formatINR(tx.tax_amount);
    const totalFormatted = formatINR(tx.amount + tx.tax_amount);

    let message = `${directionEmoji} *Receipt Logged Successfully!*\n\n`;
    message += `• *Vendor/Party:* ${tx.vendor_name}\n`;
    message += `• *Date:* ${tx.date}\n`;
    message += `• *Invoice No:* ${tx.invoice_number || 'N/A'}\n`;
    message += `• *Category:* ${tx.category.toUpperCase()}\n`;
    message += `• *Taxable Value:* ${amountFormatted}\n`;
    message += `• *GST Rate:* ${tx.gst_rate}%\n`;
    message += `• *GST Tax Paid:* ${taxFormatted}\n`;
    message += `• *Total Bill:* *${totalFormatted}*\n`;
    
    if (tx.hsn_sac) {
      message += `• *HSN/SAC:* ${tx.hsn_sac}\n`;
    }

    if (tx.category === 'sales') {
      const renderHost = getPublicAppOrigin();
      message += `\n🔗 *Customer Pay Link:* ${createPaymentLink(renderHost, tx.id)}\n`;
    }
    
    if (tx.status === 'needs_review') {
      message += `\n⚠️ *Needs review before relying on reports.* Reason: ${tx.review_reason || 'verification_required'}. Please use *Change Category* if the category is wrong, or send a clearer document if the figures look incorrect.`;
    } else if (tx.confidence === 'low') {
      message += `\n⚠️ *Warning: Low confidence extraction.* Please verify these figures in your ledger. If incorrect, you can replace this by sending a clearer photo or adding it manually.`;
    } else {
      message += `\n✨ *Confidence:* High (Auto-categorized)`;
    }

    const reviewSections = tx.status === 'needs_review'
      ? [
          {
            title: 'Review Entry',
            rows: [
              { id: `review_${tx.id}_confirm`, title: 'Confirm Entry', description: 'Include this entry in reports' },
              { id: `review_${tx.id}_reject`, title: 'Reject Entry', description: 'Exclude this entry from reports' }
            ]
          }
        ]
      : [];

    await sendInteractiveList(
      client.phone,
      message,
      'Change Category',
      [
        ...reviewSections,
        {
          title: 'Correct Category',
          rows: [
            { id: `cat_${tx.id}_sales`, title: 'Sales', description: 'Inward business revenue' },
            { id: `cat_${tx.id}_purchase`, title: 'Purchase', description: 'Cost of goods/stock' },
            { id: `cat_${tx.id}_expense`, title: 'Expense', description: 'General business expense' },
            { id: `cat_${tx.id}_salary`, title: 'Salary', description: 'Staff payroll/wages' },
            { id: `cat_${tx.id}_other`, title: 'Other', description: 'Miscellaneous' }
          ]
        }
      ]
    );
  } catch (error: any) {
    console.error('Error handling receipt image:', error);
    await sendMessage(
      client.phone,
      '❌ Sorry, I had trouble reading that image. Please ensure the invoice details and GST numbers are clearly visible.'
    );
  }
}
