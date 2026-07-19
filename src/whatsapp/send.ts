import axios from 'axios';
import dotenv from 'dotenv';
import { isRetriableHttpError, withRetry } from '../utils/retry';
import { summarizeHttpError } from '../utils/privacy';

dotenv.config();

const WA_TOKEN = process.env.WA_TOKEN;
const WA_PHONE_ID = process.env.WA_PHONE_ID;
const BASE_URL = `https://graph.facebook.com/v19.0/${WA_PHONE_ID}`;
const WHATSAPP_TIMEOUT_MS = 10000;

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
    const response = await postWhatsAppMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    });
    return response.data;
  } catch (error: any) {
    console.error('Error sending WhatsApp message:', summarizeHttpError(error));
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
    const response = await postWhatsAppMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    });
    return response.data;
  } catch (error: any) {
    console.error('Error sending WhatsApp template:', summarizeHttpError(error));
    throw error;
  }
}

/**
 * Sends a message with interactive buttons (up to 3) via WhatsApp Cloud API
 */
export async function sendInteractiveButtons(
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>
): Promise<any> {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    console.error('Cannot send interactive buttons: WA_TOKEN or WA_PHONE_ID is missing.');
    return null;
  }

  if (buttons.length > 3) {
    throw new Error('Meta interactive buttons are limited to a maximum of 3.');
  }

  try {
    const response = await postWhatsAppMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map((btn) => ({
            type: 'reply',
            reply: { id: btn.id, title: btn.title },
          })),
        },
      },
    });
    return response.data;
  } catch (error: any) {
    console.error('Error sending WhatsApp interactive buttons:', summarizeHttpError(error));
    throw error;
  }
}

/**
 * Sends a list-menu interactive message (up to 10 choices) via WhatsApp Cloud API
 */
export async function sendInteractiveList(
  to: string,
  bodyText: string,
  buttonText: string,
  sections: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }>
): Promise<any> {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    console.error('Cannot send interactive list: WA_TOKEN or WA_PHONE_ID is missing.');
    return null;
  }

  try {
    const response = await postWhatsAppMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: buttonText,
          sections,
        },
      },
    });
    return response.data;
  } catch (error: any) {
    console.error('Error sending WhatsApp interactive list:', summarizeHttpError(error));
    throw error;
  }
}

function postWhatsAppMessage(payload: Record<string, unknown>) {
  return withRetry(
    () => axios.post(
      `${BASE_URL}/messages`,
      payload,
      {
        timeout: WHATSAPP_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    ),
    {
      attempts: 3,
      shouldRetry: isRetriableHttpError,
      onRetry: (error, attempt) => {
        console.warn(`[WhatsApp] send retry ${attempt}:`, summarizeHttpError(error));
      },
    }
  );
}
