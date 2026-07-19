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
