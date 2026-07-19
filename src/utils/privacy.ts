import crypto from 'crypto';

export function hashIdentifier(value: unknown, length = 12): string {
  return crypto
    .createHash('sha256')
    .update(String(value || ''))
    .digest('hex')
    .slice(0, length);
}

export function summarizeHttpError(error: any): { status?: number; code?: string; message: string } {
  return {
    status: error?.response?.status,
    code: error?.code,
    message: String(error?.message || 'Unknown error').slice(0, 300),
  };
}

export type ProviderName = 'anthropic' | 'gemini' | 'meta_whatsapp' | 'sandbox_gst' | 'supabase' | 'unknown';
export type ProviderErrorCategory =
  | 'auth'
  | 'rate_limited'
  | 'timeout'
  | 'validation'
  | 'unavailable'
  | 'network'
  | 'unknown';

export interface ProviderErrorSummary {
  provider: ProviderName;
  operation: string;
  category: ProviderErrorCategory;
  status?: number;
  code?: string;
  message: string;
}

export function summarizeProviderError(
  provider: ProviderName,
  operation: string,
  error: any
): ProviderErrorSummary {
  const http = summarizeHttpError(error);
  return {
    provider,
    operation,
    category: classifyProviderError(error, http.status),
    status: http.status,
    code: http.code,
    message: http.message,
  };
}

function classifyProviderError(error: any, status?: number): ProviderErrorCategory {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();

  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }
  if (status === 401 || status === 403) {
    return 'auth';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  if (status === 400 || status === 422) {
    return 'validation';
  }
  if (status && status >= 500) {
    return 'unavailable';
  }
  if (!status && (code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ECONNREFUSED')) {
    return 'network';
  }
  return 'unknown';
}
