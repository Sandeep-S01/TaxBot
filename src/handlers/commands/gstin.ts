import { Client } from '../../types';
import { lookupGstin } from '../../gst/sandbox';
import { updateClient } from '../../db/clients';
import { sendMessage } from '../../whatsapp/send';

/**
 * Handles the "gstin <GSTIN>" command.
 * Validates, checks Sandbox database, and updates client info.
 */
export async function executeGstin(client: Client, gstinParam: string): Promise<void> {
  const cleanGstin = gstinParam.trim().toUpperCase();

  await sendMessage(client.phone, `Verifying GSTIN *${cleanGstin}* with the government registry...`);

  try {
    const verification = await lookupGstin(cleanGstin);

    if (verification.valid) {
      const bizName = verification.legalName || verification.tradeName || 'GST Business';
      
      // Update database
      await updateClient(client.id, {
        gstin: cleanGstin,
        business_name: bizName,
        gst_registered: true,
      });

      const message = `✅ *GSTIN Verified & Saved!*\n\n• *Business Name:* ${bizName}\n• *GSTIN:* ${cleanGstin}\n• *Status:* ${verification.status || 'Active'}\n\nWe have updated your profile. Your GSTR summaries will now be calculated using this registration.`;
      
      await sendMessage(client.phone, message);
    } else {
      const errMsg = `❌ *Verification Failed*\n\n${verification.message || 'The GSTIN provided is invalid. Please double-check and try again.'}`;
      await sendMessage(client.phone, errMsg);
    }
  } catch (error: any) {
    console.error('Error executing GSTIN verification command:', error);
    await sendMessage(
      client.phone,
      `⚠️ Could not complete GSTIN verification right now. Please try again later.`
    );
  }
}
