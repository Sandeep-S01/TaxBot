import pdf from 'pdf-parse';
import { Client } from '../types';
import { sendMessage, sendInteractiveList } from '../whatsapp/send';
import { downloadMedia } from '../whatsapp/media';
import { categoriseDocumentText } from '../ai/categorise';
import { createTransaction } from '../db/transactions';
import { formatINR } from './commands/gst';
import { createPaymentLink } from '../utils/publicTokens';
import { getPublicAppOrigin } from '../utils/origin';

/**
 * Handles PDF uploads from WhatsApp.
 * Extracts text, runs document AI extraction, records transaction(s), and returns a summary.
 */
export async function handleDocument(
  client: Client,
  mediaId: string,
  filename: string,
  mimeType: string
): Promise<void> {
  // 1. Instant acknowledgment (must be < 2 seconds)
  await sendMessage(client.phone, `Analyzing your document: *${filename}*... 📄`);

  try {
    // 2. Download PDF file
    const downloaded = await downloadMedia(mediaId);

    // 3. Process the downloaded buffer
    await handleDocumentBuffer(client, downloaded.buffer, filename, mimeType);
  } catch (error: any) {
    console.error('Error downloading document:', error);
    await sendMessage(
      client.phone,
      '❌ Sorry, I had trouble downloading that PDF document. Please try uploading it again.'
    );
  }
}

/**
 * Processes a raw PDF buffer for document logging.
 * Reused by both WhatsApp document uploads and Inbound Email Webhooks.
 */
export async function handleDocumentBuffer(
  client: Client,
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<void> {
  // Only support PDF parsing. If it is another type, notify user.
  if (!mimeType.includes('pdf') && !filename.toLowerCase().endsWith('.pdf')) {
    await sendMessage(
      client.phone,
      '❌ Sorry, I currently only support PDF documents. Please export your statement/invoice as a PDF and try again.'
    );
    return;
  }

  // 1. Extract text contents using pdf-parse
  let parsedText = '';
  try {
    const pdfData = await pdf(buffer);
    parsedText = pdfData.text || '';
  } catch (parseErr: any) {
    console.error('PDF parsing error:', parseErr.message);
    await sendMessage(
      client.phone,
      '❌ Failed to read the PDF file. Please ensure it is not password-protected or corrupted.'
    );
    return;
  }

  const cleanText = parsedText.trim();

  // 2. Check for scanned PDFs (which have little to no selectable text)
  if (cleanText.length < 20) {
    await sendMessage(
      client.phone,
      '⚠️ This PDF appears to be a scanned document (image-only) and has no selectable text. Please upload high-quality pictures of the physical pages instead so I can read them with computer vision.'
    );
    return;
  }

  // 3. Send text to Claude to extract transactions
  const extraction = await categoriseDocumentText(cleanText);

  if (extraction.error || extraction.type === 'unknown' || !extraction.transactions || extraction.transactions.length === 0) {
    await sendMessage(
      client.phone,
      `❌ Document processing failed: ${extraction.error || 'unsupported document format'}. Please ensure this is a business invoice or bank statement.`
    );
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const savedTransactions = [];

  // 4. Save extracted transactions to database
  for (const rawTx of extraction.transactions) {
    const txDate = rawTx.date && /^\d{4}-\d{2}-\d{2}$/.test(rawTx.date) ? rawTx.date : todayStr;
    
    try {
      const tx = await createTransaction({
        client_id: client.id,
        date: txDate,
        description: rawTx.description || `Extracted: ${rawTx.vendor_name || 'Transaction'}`,
        vendor_name: rawTx.vendor_name || (rawTx.category === 'sales' ? 'Self' : 'Vendor'),
        amount: Number(rawTx.amount),
        tax_amount: Number(rawTx.tax_amount || 0),
        category: rawTx.category || 'other',
        gst_category: rawTx.gst_category || null,
        gst_rate: rawTx.gst_rate || 0,
        hsn_sac: rawTx.hsn_sac || null,
        invoice_number: rawTx.invoice_number || null,
        vendor_gstin: rawTx.vendor_gstin || null,
        source: 'whatsapp_pdf',
        raw_text: `PDF ${extraction.type} Row: ${JSON.stringify(rawTx)}`,
        confidence: rawTx.confidence || 'medium',
      });
      
      savedTransactions.push(tx);
    } catch (dbErr: any) {
      console.error('Error inserting PDF transaction:', dbErr.message);
    }
  }

  // 5. Send confirmation summaries
  if (extraction.type === 'invoice') {
    const tx = savedTransactions[0];
    if (!tx) {
      throw new Error('Failed to save extracted invoice transaction');
    }
    
    const directionEmoji = tx.category === 'sales' ? '📥' : '📤';
    let msg = `${directionEmoji} *Invoice PDF Logged!* (Single Transaction)\n\n`;
    msg += `• *Party:* ${tx.vendor_name}\n`;
    msg += `• *Date:* ${tx.date}\n`;
    msg += `• *Invoice No:* ${tx.invoice_number || 'N/A'}\n`;
    msg += `• *Amount:* ${formatINR(tx.amount)} (tax excl.)\n`;
    msg += `• *GST:* ${tx.gst_rate}% (${formatINR(tx.tax_amount)})\n`;
    msg += `• *Total Bill:* *${formatINR(tx.amount + tx.tax_amount)}*\n`;
    msg += `• *Category:* ${tx.category.toUpperCase()}\n`;

    if (tx.category === 'sales') {
      const renderHost = getPublicAppOrigin();
      msg += `\n🔗 *Customer Pay Link:* ${createPaymentLink(renderHost, tx.id)}\n`;
    }

    if (tx.status === 'needs_review') {
      msg += `\n⚠️ *Needs review before relying on reports.* Reason: ${tx.review_reason || 'verification_required'}.`;
    }
    
    try {
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
        msg,
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
    } catch (sendErr: any) {
      console.warn(`[Webhook] Could not dispatch WhatsApp invoice confirmation list (check WA_TOKEN):`, sendErr.message || sendErr);
    }
  } else {
    // bank_statement
    let totalSales = 0;
    let totalPurchases = 0;
    let totalExpenses = 0;
    let totalOther = 0;

    for (const tx of savedTransactions) {
      const amt = tx.amount + tx.tax_amount;
      if (tx.category === 'sales') {
        totalSales += amt;
      } else if (tx.category === 'purchase') {
        totalPurchases += amt;
      } else if (tx.category === 'expense') {
        totalExpenses += amt;
      } else {
        totalOther += amt;
      }
    }

    const reviewCount = savedTransactions.filter((tx) => tx.status === 'needs_review').length;

    let msg = `📄 *Bank Statement Processed!*\n\n`;
    msg += `• Extracted *${savedTransactions.length}* transaction entries.\n`;
    msg += `• *Needs Review:* ${reviewCount}\n`;
    msg += `• *Total Inward (Sales/Receipts):* ${formatINR(totalSales)}\n`;
    msg += `• *Total Outward (Purchases):* ${formatINR(totalPurchases)}\n`;
    msg += `• *Total Outward (Expenses):* ${formatINR(totalExpenses + totalOther)}\n\n`;
    msg += `All statement items have been added to your business logs. Type *report* to review your P&L sheet.`;

    try {
      await sendMessage(client.phone, msg);
    } catch (sendErr: any) {
      console.warn(`[Webhook] Could not dispatch WhatsApp statement confirmation message (check WA_TOKEN):`, sendErr.message || sendErr);
    }
  }
}
