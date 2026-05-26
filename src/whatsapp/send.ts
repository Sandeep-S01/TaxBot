import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WA_TOKEN = process.env.WA_TOKEN;
const WA_PHONE_ID = process.env.WA_PHONE_ID;
const BASE_URL = `https://graph.facebook.com/v19.0/${WA_PHONE_ID}`;

if (!WA_TOKEN || !WA_PHONE_ID) {
  console.warn(
    'WARNING: WA_TOKEN or WA_PHONE_ID is not defined in the environment. WhatsApp API will fail to make requests.'
  );
}

/**
 * Sends a standard text message via WhatsApp Cloud API
 */
export async function sendMessage(to: string, text: string): Promise<any> {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    console.error('Cannot send message: WA_TOKEN or WA_PHONE_ID is missing.');
    return null;
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (error: any) {
    console.error('Error sending WhatsApp message:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Sends a template-based message (e.g. for reminders or welcome)
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string = 'en_US',
  components: any[] = []
): Promise<any> {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    console.error('Cannot send template: WA_TOKEN or WA_PHONE_ID is missing.');
    return null;
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (error: any) {
    console.error('Error sending WhatsApp template:', error.response?.data || error.message);
    throw error;
  }
}
