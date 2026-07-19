const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERIOD_RE = /^\d{4}-\d{2}$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value: unknown): boolean {
  return EMAIL_RE.test(normalizeEmail(value));
}

export function isStrongPassword(value: unknown): boolean {
  const password = String(value || '');
  return password.length >= 10 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

export function normalizeIndianPhone(value: unknown): string | null {
  let phone = String(value || '').trim().replace(/\D/g, '');
  if (phone.length === 10) {
    phone = `91${phone}`;
  }
  return /^91[6-9][0-9]{9}$/.test(phone) ? phone : null;
}

export function normalizeGstin(value: unknown): string | null {
  const gstin = String(value || '').trim().toUpperCase();
  if (!gstin) return null;
  return GSTIN_RE.test(gstin) ? gstin : null;
}

export function isUuid(value: unknown): boolean {
  return UUID_RE.test(String(value || ''));
}

export function isValidPeriod(value: unknown): boolean {
  const period = String(value || '');
  if (!PERIOD_RE.test(period)) return false;
  const month = Number(period.slice(5, 7));
  return month >= 1 && month <= 12;
}

export function normalizeReportType(value: unknown): 'pl' | 'gst' | null {
  const reportType = String(value || '').trim().toLowerCase();
  return reportType === 'pl' || reportType === 'gst' ? reportType : null;
}
