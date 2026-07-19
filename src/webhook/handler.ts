import { Request, Response } from 'express';
import { getClientByPhone, createClient } from '../db/clients';
import { handleText } from '../handlers/text';
import { handleImage } from '../handlers/image';
import { handleDocument } from '../handlers/document';
import { handleAudio } from '../handlers/audio';
import { handleInteractive } from '../handlers/interactive';
import { sendMessage } from '../whatsapp/send';
import { WhatsAppIncomingNotification, WhatsAppMessage } from '../types';
import { claimInboundMessage, updateInboundMessageStatus } from '../db/inboundMessages';
import { hashIdentifier, summarizeHttpError } from '../utils/privacy';

/**
 * Handle incoming POST requests from WhatsApp webhook
 * Express POST /webhook
 */
export async function handleWebhook(req: Request, res: Response) {
  const body = req.body as WhatsAppIncomingNotification;

  logWebhookSummary(body);

  // Let Meta know we received the event immediately to prevent retries
  res.status(200).send('EVENT_RECEIVED');

  // Verify this is a messages webhook
  if (body.object !== 'whatsapp_business_account') {
    return;
  }

  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value;
      if (!value || !value.messages || value.messages.length === 0) {
        continue;
      }

      const message = value.messages[0];
      const phone = message.from;
      const contactName = value.contacts?.[0]?.profile?.name || 'Business Owner';

      // Execute asynchronously in the background so we don't block the Express thread
      processIncomingMessage(phone, contactName, message).catch((err) => {
        console.error('Error handling background message:', err);
      });
    }
  }
}

function logWebhookSummary(body: WhatsAppIncomingNotification) {
  const summaries = (body.entry || [])
    .flatMap((entry) => entry.changes || [])
    .flatMap((change) => change.value?.messages || [])
    .map((message) => ({
      messageId: message.id,
      type: message.type,
      phoneHash: hashIdentifier(message.from),
    }));

  console.log('[Webhook] Incoming event summary:', {
    object: body.object,
    messages: summaries,
  });
}

/**
 * Main message router running asynchronously
 */
async function processIncomingMessage(phone: string, contactName: string, message: WhatsAppMessage) {
  const metaMessageId = message.id;

  try {
    const claim = await claimInboundMessage(metaMessageId, phone, message.type);
    if (!claim.claimed) {
      console.log('[Webhook] Duplicate Meta message skipped:', {
        metaMessageId,
        phoneHash: hashIdentifier(phone),
        existingStatus: claim.message?.status,
      });
      return;
    }

    await updateInboundMessageStatus(metaMessageId, 'processing');

    // 1. Identify or register the client
    let client = await getClientByPhone(phone);
    if (!client) {
      console.log('[Webhook] New registration: creating client', { phoneHash: hashIdentifier(phone) });
      client = await createClient(phone, contactName);
      
      // Send a welcome message
      try {
        await sendMessage(
          phone,
          `Welcome to TaxBot, ${contactName}! 🇮🇳\n\nI am your AI accounting assistant. Send me your receipt photos, bank statement PDFs, or simply ask me tax questions in English or Hindi.\n\nType *help* to see what I can do.`
        );
      } catch (err: any) {
        console.warn('[Webhook] Could not dispatch WhatsApp welcome message:', summarizeHttpError(err));
      }
    }

    await updateInboundMessageStatus(metaMessageId, 'processing', { client_id: client.id });

    // 2. Route based on message type
    switch (message.type) {
      case 'text':
        if (message.text?.body) {
          await handleText(client, message.text.body);
        }
        break;

      case 'image':
        if (message.image?.id) {
          await handleImage(client, message.image.id, message.image.mime_type || 'image/jpeg');
        }
        break;

      case 'document':
        if (message.document?.id) {
          await handleDocument(
            client,
            message.document.id,
            message.document.filename || 'document.pdf',
            message.document.mime_type || 'application/pdf'
          );
        }
        break;

      case 'audio':
        if (message.audio?.id) {
          await handleAudio(client, message.audio.id, message.audio.mime_type || 'audio/ogg');
        }
        break;

      case 'interactive':
        if (message.interactive) {
          await handleInteractive(client, message.interactive);
        }
        break;

      default:
        await sendMessage(
          phone,
          'Sorry, this message format is not supported. Please send an invoice image, a bank statement PDF, or a text command.'
        );
    }

    await updateInboundMessageStatus(metaMessageId, 'processed', { client_id: client.id });
  } catch (error: any) {
    console.error('[Webhook] Error processing message:', {
      phoneHash: hashIdentifier(phone),
      messageId: metaMessageId,
      error: summarizeHttpError(error),
    });
    try {
      await updateInboundMessageStatus(metaMessageId, 'failed', {
        last_error: String(error?.message || error).slice(0, 1000),
      });
    } catch (statusErr) {
      console.error('Failed to persist inbound message failure status:', statusErr);
    }
    try {
      await sendMessage(
        phone,
        'An error occurred while processing your request. Please try again in a few moments.'
      );
    } catch (sendErr) {
      console.error('[Webhook] Failed to dispatch error response to client:', summarizeHttpError(sendErr));
    }
  }
}
