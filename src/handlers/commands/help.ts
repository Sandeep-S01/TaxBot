import { Client } from '../../types';
import { sendMessage } from '../../whatsapp/send';

/**
 * Executes the "help" command, displaying instructions and manual commands.
 */
export async function executeHelp(client: Client): Promise<void> {
  const name = client.name || 'valued customer';
  const helpText = `Hello ${name}! Here is what you can do with TaxBot:

*Receipt / Invoice Parsing*
Upload an image of a bill, receipt, or invoice. I will extract the date, vendor, taxable value, GST rate, and category for review.

*PDF Bank Statement Analysis*
Send a PDF bank statement. I will extract transaction entries and mark review-needed items clearly.

*Financial Reports*
- Type *report* or *pl* - Get your monthly Profit & Loss summary.
- Type *gst* - Get your regular-GST summary with estimated figures.
- Type *export* - Get CSV and Tally XML ledger download links. Example: *export 2026-05*

*GSTIN Validation & Setup*
- Type *gstin 29ABCDE1234F1Z5* - Validate and save your GSTIN.

*Manual Entries*
- *add sale <amount> <description>*
- *add purchase <amount> <description>*
- *add expense <amount> <description>*
Example: "add sale 12000 consulting invoice #2"

*Conversational Advisor*
Just ask me any general tax or GST query in Hindi or English.
Example: "What is the last date for GSTR-3B?" or "GST input tax credit kaise claim kare?"

TaxBot assists bookkeeping and GST summary preparation. CA review is recommended before filing.`;

  await sendMessage(client.phone, helpText);
}
