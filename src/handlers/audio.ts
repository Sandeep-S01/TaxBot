import { Client } from '../types';
import { sendMessage } from '../whatsapp/send';
import { downloadMedia } from '../whatsapp/media';
import { askGeminiAudio, askGemini } from '../ai/gemini';
import { normalizeExtraction } from '../ai/validateExtraction';
import { createTransaction } from '../db/transactions';
import { formatINR } from './commands/gst';

/**
 * Handles incoming WhatsApp audio voice notes.
 * Transcribes the audio, extracts transaction details, and saves them to the ledger.
 */
export async function handleAudio(
  client: Client,
  mediaId: string,
  mimeType: string
): Promise<void> {
  // Send immediate receipt acknowledgement
  await sendMessage(client.phone, '🎙️ Processing your voice note... Please wait.');

  try {
    // 1. Download binary ogg/aac audio buffer from Meta Cloud API
    const downloaded = await downloadMedia(mediaId);
    const audioBuffer = downloaded.buffer;
    const finalMimeType = downloaded.mimeType || mimeType;

    // 2. Draft audio prompting instructions
    const systemPrompt = `You are an Indian GST-compliant accounting AI. Listen to the audio clip and extract the transaction details.
The audio might be in English, Hindi, or a mix of both (Hinglish).
Translate the spoken details to English, determine if it is a "sales", "purchase", or "expense", categorize it, and return the data as valid JSON only.
Always return JSON. If the audio is not a transaction (e.g. general greeting or chit-chat), return: {"error": "not_a_transaction"}

The response must conform exactly to this schema:
{
  "date": "YYYY-MM-DD (defaults to today's date if not spoken)",
  "vendor_name": "string or null (default 'Self' for sales, 'Vendor' for purchases/expenses)",
  "description": "string or null (include category or nature of transaction)",
  "amount": number (excluding tax),
  "tax_amount": number (total GST tax paid/received, defaults to 0),
  "gst_rate": number (must be one of: 0, 5, 12, 18, 28, defaults to 0),
  "category": "sales" | "purchase" | "expense" | "salary" | "other",
  "gst_category": "B2B" | "B2C" | "B2CL" | "exempt" | "nil_rated" | null (default 'B2C' for sales, 'exempt' for purchases/expenses),
  "hsn_sac": "string or null",
  "invoice_number": "string or null",
  "confidence": "high" | "medium" | "low",
  "transcription": "string (the raw transcription of what the user said)"
}`;

    const todayStr = new Date().toISOString().split('T')[0];
    const userPrompt = `Extract transaction details. Today's date is ${todayStr}.`;

    // 3. Query Gemini Multimodal API with the audio binary
    const resultText = await askGeminiAudio(
      audioBuffer,
      finalMimeType,
      systemPrompt,
      userPrompt
    );

    let jsonText = resultText.trim();
    if (jsonText.startsWith('```')) {
      const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        jsonText = match[1];
      }
    }

    const extractionRaw = JSON.parse(jsonText);

    // 4. Handle conversational fallback or errors
    if (extractionRaw.error) {
      if (extractionRaw.error === 'not_a_transaction') {
        const prompt = `You are a helpful Indian GST-compliant accounting assistant. The user sent a voice message that was transcribed as: "${extractionRaw.transcription || 'Hi/Hello'}"
Respond politely in a single, helpful sentence.`;
        const reply = await askGemini(prompt, extractionRaw.transcription || 'hello', 'en');
        await sendMessage(client.phone, reply);
        return;
      }
      throw new Error(extractionRaw.error);
    }

    // 5. Build and insert transaction
    const extraction = {
      ...normalizeExtraction(extractionRaw),
      transcription: extractionRaw.transcription,
    };

    const tx = await createTransaction({
      client_id: client.id,
      date: extraction.date || todayStr,
      description: extraction.description || `Voice logged: ${extraction.category}`,
      vendor_name: extraction.vendor_name || (extraction.category === 'sales' ? 'Self' : 'Vendor'),
      amount: extraction.amount,
      tax_amount: extraction.tax_amount || 0,
      category: extraction.category,
      gst_category: extraction.gst_category,
      gst_rate: extraction.gst_rate,
      hsn_sac: extraction.hsn_sac || null,
      invoice_number: extraction.invoice_number || null,
      source: 'whatsapp_text',
      raw_text: extractionRaw.transcription || 'Voice message',
      confidence: extraction.confidence || 'high',
    });

    const successMessage = `🎙️ *Voice Transaction Logged!*
• *What I heard:* "${extraction.transcription}"
• *Type:* ${tx.category.toUpperCase()}
• *Date:* ${tx.date}
• *Amount:* ${formatINR(tx.amount)} (excluding tax)
• *Description:* "${tx.description}"

Ledger and GSTR reports updated successfully.`;

    await sendMessage(client.phone, successMessage);
  } catch (err: any) {
    console.error('Error handling voice note:', err.message);
    await sendMessage(
      client.phone,
      '⚠️ Sorry, I could not process that audio clip. Please try speaking clearly or send a text transaction instead.'
    );
  }
}
