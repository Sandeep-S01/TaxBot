import axios from 'axios';
import { anthropic, withTimeout } from './claude';
import { RECEIPT_EXTRACTION_SYSTEM_PROMPT, RECEIPT_EXTRACTION_USER_PROMPT } from './prompts';
import { ReceiptExtractionResult, GstRate } from '../types';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VALID_GST_RATES: GstRate[] = [0, 5, 12, 18, 28];

export interface DocumentExtractionResult {
  type: 'invoice' | 'bank_statement' | 'unknown';
  transactions: ReceiptExtractionResult[];
  error?: string;
}

/**
 * Helper to clean and parse JSON response from LLM
 */
function cleanAndParseJSON<T>(content: string): T {
  let jsonText = content.trim();
  if (jsonText.startsWith('```')) {
    const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      jsonText = match[1];
    }
  }
  return JSON.parse(jsonText) as T;
}

/**
 * Extracts transaction details from a receipt image buffer.
 * Automatically chooses Gemini 1.5 Flash (free) if GEMINI_API_KEY is available,
 * otherwise falls back to Claude 3.5 Sonnet.
 */
export async function categoriseReceipt(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ReceiptExtractionResult> {
  const base64Data = imageBuffer.toString('base64');
  const fallbackMessage = 'Receipt processing timed out.';

  try {
    let content = '';

    // If Gemini key is present, use Gemini 1.5 Flash (Free Tier)
    if (GEMINI_API_KEY) {
      console.log('Using Gemini 1.5 Flash for receipt OCR (Free)...');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data,
                },
              },
              {
                text: RECEIPT_EXTRACTION_USER_PROMPT,
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [
            {
              text: RECEIPT_EXTRACTION_SYSTEM_PROMPT,
            },
          ],
        },
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1000,
          responseMimeType: 'application/json',
        },
      };

      const apiCall = axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await withTimeout(apiCall, 30000, fallbackMessage);
      content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      // Fallback to Claude 3.5 Sonnet
      console.log('Using Claude 3.5 Sonnet for receipt OCR (Paid)...');
      const apiCall = anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        system: RECEIPT_EXTRACTION_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType as any,
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: RECEIPT_EXTRACTION_USER_PROMPT,
              },
            ],
          },
        ],
      });

      const response = await withTimeout(apiCall, 30000, fallbackMessage);
      content = response.content[0].type === 'text' ? response.content[0].text : '';
    }

    if (!content) {
      return { error: 'No content received from AI', confidence: 'low' } as any;
    }

    const result = cleanAndParseJSON<ReceiptExtractionResult>(content);

    if (result.error) {
      return result;
    }

    // Validate GST Rate
    if (result.gst_rate !== undefined) {
      const rate = Number(result.gst_rate) as GstRate;
      if (!VALID_GST_RATES.includes(rate)) {
        const closestRate = VALID_GST_RATES.reduce((prev, curr) =>
          Math.abs(curr - rate) < Math.abs(prev - rate) ? curr : prev
        );
        result.gst_rate = closestRate;
      }
    } else {
      result.gst_rate = 0;
    }

    return result;
  } catch (error: any) {
    console.error('Error categorising receipt:', error.message);
    return {
      error: error.message || 'Failed to process receipt',
      confidence: 'low',
    } as any;
  }
}

/**
 * Extracts multiple transactions from document text (e.g. invoice or bank statement PDF).
 * Automatically chooses Gemini 1.5 Flash (free) if GEMINI_API_KEY is available,
 * otherwise falls back to Claude 3.5 Sonnet.
 */
export async function categoriseDocumentText(text: string): Promise<DocumentExtractionResult> {
  const fallbackMessage = 'Document text processing timed out.';
  
  const systemPrompt = `You are an Indian GST-compliant accounting AI. Analyze the text of a document (invoice PDF or bank statement) and extract transactions.
Always return valid JSON only — no markdown, no explanation.
If this is not an invoice or bank statement, return: {"type": "unknown", "transactions": [], "error": "not_supported"}

The response must conform exactly to this schema:
{
  "type": "invoice" | "bank_statement",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "vendor_name": "string or null",
      "description": "string or null (include category or nature of transaction)",
      "amount": number (excluding tax),
      "tax_amount": number (total GST tax paid/received),
      "gst_rate": number (must be one of: 0, 5, 12, 18, 28),
      "category": "sales" | "purchase" | "expense" | "salary" | "other",
      "gst_category": "B2B" | "B2C" | "B2CL" | "exempt" | "nil_rated" | null,
      "hsn_sac": "string or null",
      "invoice_number": "string or null",
      "vendor_gstin": "string or null",
      "confidence": "high" | "medium" | "low"
    }
  ]
}`;

  try {
    let content = '';

    if (GEMINI_API_KEY) {
      console.log('Using Gemini 1.5 Flash for document text extraction (Free)...');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const payload = {
        contents: [
          {
            parts: [
              {
                text: `Analyze this text and extract all transactions:\n---\n${text.substring(0, 15000)}\n---`,
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2500,
          responseMimeType: 'application/json',
        },
      };

      const apiCall = axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await withTimeout(apiCall, 30000, fallbackMessage);
      content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      console.log('Using Claude 3.5 Sonnet for document text extraction (Paid)...');
      const apiCall = anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2500,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Analyze this text and extract all transactions:
---
${text.substring(0, 15000)}
---`,
          },
        ],
      });

      const response = await withTimeout(apiCall, 30000, fallbackMessage);
      content = response.content[0].type === 'text' ? response.content[0].text : '';
    }

    if (!content) {
      return {
        type: 'unknown',
        transactions: [],
        error: 'No response from AI model',
      };
    }

    const result = cleanAndParseJSON<DocumentExtractionResult>(content);

    // Validate rate for all transactions
    if (result.transactions && Array.isArray(result.transactions)) {
      result.transactions = result.transactions.map((tx) => {
        if (tx.gst_rate !== undefined) {
          const rate = Number(tx.gst_rate) as GstRate;
          if (!VALID_GST_RATES.includes(rate)) {
            tx.gst_rate = VALID_GST_RATES.reduce((prev, curr) =>
              Math.abs(curr - rate) < Math.abs(prev - rate) ? curr : prev
            );
          }
        } else {
          tx.gst_rate = 0;
        }
        return tx;
      });
    }

    return result;
  } catch (error: any) {
    console.error('Error parsing document text:', error.message);
    return {
      type: 'unknown',
      transactions: [],
      error: error.message || 'Failed to parse text',
    };
  }
}