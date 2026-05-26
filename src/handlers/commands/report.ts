import { Client } from '../../types';
import { getMonthlyPLReport } from '../../db/transactions';
import { sendMessage } from '../../whatsapp/send';
import { formatINR } from './gst';

/**
 * Handles the "report" or "pl" command.
 * Returns the monthly Profit & Loss sheet.
 */
export async function executeReport(client: Client, periodParam?: string): Promise<void> {
  let period = periodParam?.trim();

  // If no period is specified, use the current year-month
  if (!period) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    period = `${year}-${month}`;
  }

  // Basic validation of YYYY-MM format
  if (!/^\d{4}-\d{2}$/.test(period)) {
    await sendMessage(client.phone, '⚠️ Please provide the period in YYYY-MM format. Example: *report 2026-05*');
    return;
  }

  await sendMessage(client.phone, `Compiling your Profit & Loss statement for *${period}*...`);

  try {
    const report = await getMonthlyPLReport(client.id, period);

    const formatName = client.business_name || client.name || 'Your Business';
    const netProfitSymbol = report.netProfit >= 0 ? '🟢 Net Profit' : '🔴 Net Loss';

    const message = `📈 *Profit & Loss Statement*
🏢 *Business:* ${formatName}
📅 *Period:* ${period}

🟢 *Operating Revenue (Sales)*
• Gross Sales: *${formatINR(report.totalSales)}*

🔴 *Operating Expenses*
• Purchases (Inventory/Raw materials): ${formatINR(report.totalPurchases)}
• Salaries & Wages: ${formatINR(report.totalSalaries)}
• Regular Expenses (Rent, Utilities, etc.): ${formatINR(report.totalExpenses)}
• Other Expenses: ${formatINR(report.totalOther)}
• *Total Expenses:* *${formatINR(
      report.totalPurchases + report.totalSalaries + report.totalExpenses + report.totalOther
    )}*

----------------------------------------
${netProfitSymbol}: *${formatINR(report.netProfit)}*
----------------------------------------

_All figures represent taxable value excluding GST. To download the detailed transactions ledger, reply with "ledger ${period}"._`;

    await sendMessage(client.phone, message);
  } catch (error: any) {
    console.error('Error generating P&L report:', error);
    await sendMessage(
      client.phone,
      `⚠️ Could not compile your P&L report for ${period} right now. Please verify your transaction logs.`
    );
  }
}
