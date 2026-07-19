import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.warn(
    'WARNING: ANTHROPIC_API_KEY is not defined in the environment. Claude AI API will fail to initialize.'
  );
}

export const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY || 'placeholder-key',
});

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
 * Helper to call Claude API for text/conversational responses.
 */
export async function askClaude(
  systemPrompt: string,
  userMessage: string,
  language: 'en' | 'hi' = 'en'
): Promise<string> {
  const fallback =
    language === 'hi'
      ? 'प्रिय ग्राहक, वर्तमान में हमारे सर्वर पर कुछ तकनीकी रखरखाव चल रहा है। हमारी सहायता टीम को सूचित कर दिया गया है। आप सीधे info@theanantastore.in पर भी संपर्क कर सकते हैं। असुविधा के लिए खेद है! 🙏'
      : "We are currently conducting brief technical maintenance. Our support desk has been notified and you can reach out directly to us at info@theanantastore.in. We apologize for any inconvenience! 🙏";

  if (!ANTHROPIC_API_KEY) {
    return fallback;
  }

  try {
    const apiCall = anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const response = await withTimeout(apiCall, DEFAULT_TIMEOUT_MS, 'timeout');
    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    return content || fallback;
  } catch (error: any) {
    console.error('Claude API Error:', error.response?.data || error.message);
    return fallback;
  }
}