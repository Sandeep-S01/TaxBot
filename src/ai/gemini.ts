import axios from 'axios';
import dotenv from 'dotenv';
import { summarizeProviderError } from '../utils/privacy';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.Gemini_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn(
    'WARNING: GEMINI_API_KEY is not defined in the environment. Gemini AI API will fail to initialize.'
  );
}

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Executes a promise with a timeout limit.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  fallbackMessage: string = 'Request timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(fallbackMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Helper to call Gemini API for text/conversational responses.
 */
export async function askGemini(
  systemPrompt: string,
  userMessage: string,
  language: 'en' | 'hi' = 'en'
): Promise<string> {
  const fallback =
    language === 'hi'
      ? 'प्रिय ग्राहक, वर्तमान में हमारे सर्वर पर कुछ तकनीकी रखरखाव चल रहा है। हमारी सहायता टीम को सूचित कर दिया गया है। आप सीधे info@theanantastore.in पर भी संपर्क कर सकते हैं। असुविधा के लिए खेद है! 🙏'
      : "We are currently conducting brief technical maintenance. Our support desk has been notified and you can reach out directly to us at info@theanantastore.in. We apologize for any inconvenience! 🙏";

  if (!GEMINI_API_KEY) {
    return fallback;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [
        {
          parts: [{ text: userMessage }]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1000
      }
    };

    const apiCall = axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    const response = await withTimeout(apiCall, DEFAULT_TIMEOUT_MS, 'timeout');
    const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return content || fallback;
  } catch (error: any) {
    console.error('Gemini API Error:', summarizeProviderError('gemini', 'generate_text', error));
    return fallback;
  }
}

/**
 * Helper to call Gemini API for processing audio inputs (multimodal)
 */
export async function askGeminiAudio(
  audioBuffer: Buffer,
  mimeType: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not defined in the environment.');
  }

  const base64Data = audioBuffer.toString('base64');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
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
            text: userPrompt,
          },
        ],
      },
    ],
    systemInstruction: {
      parts: [
        {
          text: systemPrompt,
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

  const response = await withTimeout(apiCall, DEFAULT_TIMEOUT_MS, 'Audio processing timed out.');
  const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error('No content returned from Gemini Audio API');
  }

  return content;
}
