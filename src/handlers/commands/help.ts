import { Client } from '../../types';
import { sendMessage } from '../../whatsapp/send';

/**
 * Executes the "help" command, displaying instructions and manual commands.
 */
export async function executeHelp(client: Client): Promise<void> {
  const name = client.name || 'valued customer';
  const helpText = `Hello ${name}! Here is what you can do with TaxBot:

📸 *OCR Receipt / Invoice Parsing*
Simply upload an image of a bill, receipt, or invoice. I will automatically extract the dates, vendor, taxable value, GST rate, and category.

📄 *PDF Bank Statement Analysis*
Send a PDF bank statement. I will extract transactions and log them for you.

📊 *Financial Reports*
• Type *report* or *pl* - Get your monthly Profit & Loss summary.
• Type *gst* - Get your GSTR-3B tax summary with estimated filing figures.

⚙️ *GSTIN Validation & Setup*
• Type *gstin 29ABCDE1234F1Z5* - Validate against the GST database and register your GSTIN.

✏️ *Manual Adjustments*
• *add sale <amount> <description>*
• *add purchase <amount> <description>*
• *add expense <amount> <description>*
_Example: "add sale 12000 consulting invoice #2"_

💬 *Conversational Advisor*
Just ask me any general tax or GST query (in Hindi or English).
_Example: "What is the last date for GSTR-3B?" or "GST input tax credit kaise claim kare?"_`;

  await sendMessage(client.phone, helpText);
}
