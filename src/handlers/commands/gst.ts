import { Client } from '../../types';
import { buildGstr3b } from '../../gst/gstr3b';
import { sendMessage } from '../../whatsapp/send';

export function formatINR(amount: number): string {
  // Ensure we round to 2 decimal places first to prevent float issues
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  return '₹' + rounded.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Handles the "gst" or "gst summary" command.
 * Returns the estimated GSTR-3B return parameters.
 */
export async function executeGst(client: Client, periodParam?: string): Promise<void> {
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
    await sendMessage(client.phone, '⚠️ Please provide the period in YYYY-MM format. Example: *gst 2026-05*');
    return;
  }

  await sendMessage(client.phone, `Calculating GST GSTR-3B summary for period *${period}*...`);

  try {
    const summary = await buildGstr3b(client.id, period);

    // Calculate deadlines
    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    
    // GSTR-1 is due on the 11th of next month, GSTR-3B on the 20th of next month
    const nextMonthDate = new Date(year, month, 1);
    const nextMonthName = nextMonthDate.toLocaleString('en-US', { month: 'long' });
    const nextMonthYear = nextMonthDate.getFullYear();
    
    const gstr1Deadline = `11th ${nextMonthName} ${nextMonthYear}`;
    const gstr3bDeadline = `20th ${nextMonthName} ${nextMonthYear}`;

    // Format rate breakdown
    let ratesOutwardText = '';
    const outwardRates = Object.keys(summary.outwardSupplies.byRate).map(Number);
    if (outwardRates.length === 0) {
      ratesOutwardText = '_No outward supplies recorded_\n';
    } else {
      outwardRates.forEach((rate) => {
        const item = summary.outwardSupplies.byRate[rate];
        ratesOutwardText += `  • *${rate}% GST:* Value: ${formatINR(item.taxableValue)} | Tax: ${formatINR(item.taxAmount)}\n`;
      });
    }

    let ratesInwardText = '';
    const inwardRates = Object.keys(summary.inwardEligibleITC.byRate).map(Number);
    if (inwardRates.length === 0) {
      ratesInwardText = '_No eligible input purchases recorded_\n';
    } else {
      inwardRates.forEach((rate) => {
        const item = summary.inwardEligibleITC.byRate[rate];
        ratesInwardText += `  • *${rate}% GST:* Value: ${formatINR(item.taxableValue)} | ITC: ${formatINR(item.taxAmount)}\n`;
      });
    }

    const message = `📊 *GSTR-3B Return Summary*
📅 *Filing Period:* ${period}

1. *Outward Taxable Supplies (Sales)*
   • Total Taxable Value: ${formatINR(summary.outwardSupplies.taxableValue)}
   • Total Outward GST Liability: ${formatINR(summary.liability)}
${ratesOutwardText}
2. *Eligible Input Tax Credit (ITC)*
   • Total Input Value: ${formatINR(summary.inwardEligibleITC.taxableValue)}
   • Total Available ITC: ${formatINR(summary.itcAvailable)}
${ratesInwardText}
3. *Net Tax Payable*
   • *Net GST Cash Liability:* *${formatINR(summary.netGstPayable)}*

⏰ *Filing Deadlines:*
• *GSTR-1* (Sales details): *${gstr1Deadline}*
• *GSTR-3B* (Tax summary): *${gstr3bDeadline}*

_Note: This is an AI-generated calculation based on your transactions. To file this return, type "file gst ${period}"._`;

    await sendMessage(client.phone, message);
  } catch (error: any) {
    console.error('Error generating GST summary:', error);
    await sendMessage(
      client.phone,
      `⚠️ Could not generate GST summary for ${period} right now. Please verify your transaction logs.`
    );
  }
}
