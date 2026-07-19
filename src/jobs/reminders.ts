import cron from 'node-cron';
import { getGstRegisteredClients } from '../db/clients';
import { buildGstr3b } from '../gst/gstr3b';
import { sendMessage } from '../whatsapp/send';
import { formatINR } from '../handlers/commands/gst';

/**
 * Calculates the previous month's period string (YYYY-MM).
 */
export function getPreviousMonthPeriod(): string {
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth(); // 0-indexed, so current month - 1

  if (month === 0) {
    // If current month is January, previous month is December of previous year
    month = 12;
    year -= 1;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Initializes and schedules the GST filing reminders cron job.
 * Runs on the 18th of every month at 9:00 AM IST (Asia/Kolkata timezone).
 */
export function initRemindersJob() {
  console.log('Initializing TaxBot cron scheduler...');

  // '0 9 18 * *' => Minute 0, Hour 9, Day 18 of Month *, Day of Week *
  cron.schedule(
    '0 9 18 * *',
    async () => {
      console.log('Cron triggered: Dispatching monthly GST deadline reminders...');
      await runGstReminders();
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );
}

/**
 * Fetches all GST clients and sends reminders.
 */
export async function runGstReminders(): Promise<void> {
  const period = getPreviousMonthPeriod();
  
  try {
    const clients = await getGstRegisteredClients();
    console.log(`Found ${clients.length} GST registered client(s) to notify.`);

    for (const client of clients) {
      try {
        const summary = await buildGstr3b(client.id, period);
        
        const businessName = client.business_name || client.name || 'your business';
        const netPayable = formatINR(summary.netGstPayable);
        const itc = formatINR(summary.itcAvailable);
        
        const reminderText = `🚨 *GST Filing Reminder* 🚨

Dear Owner of *${businessName}*,

This is a reminder that your *GSTR-3B* return for the period *${period}* is due in 2 days on the *20th of this month*.

📊 *Pre-Filing Summary:*
• Estimated Net GST Payable: *${netPayable}*
• Input Tax Credit (ITC) Claimable: ${itc}

Please review your bills and transactions to ensure accuracy. 
• Reply with *gst ${period}* to check your detailed summary.
• Reply with *report ${period}* to view your P&L sheet.

_TaxBot - AI-native compliance for Indian SMBs._`;

        await sendMessage(client.phone, reminderText);
        console.log(`Successfully dispatched GST reminder to client: ${client.phone}`);
      } catch (clientErr: any) {
        console.error(`Failed to send reminder to client ID ${client.id}:`, clientErr.message);
      }
    }
  } catch (error: any) {
    console.error('Error running GST reminders task:', error.message);
  }
}
