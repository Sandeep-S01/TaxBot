import {
  ConfidenceLevel,
  GstCategory,
  GstRate,
  ReceiptExtractionResult,
  TransactionCategory,
} from '../types';

const VALID_GST_RATES: GstRate[] = [0, 5, 12, 18, 28];
const VALID_CATEGORIES: TransactionCategory[] = ['sales', 'purchase', 'expense', 'salary', 'other'];
const VALID_GST_CATEGORIES: GstCategory[] = ['B2B', 'B2C', 'B2CL', 'exempt', 'nil_rated'];
const VALID_CONFIDENCE: ConfidenceLevel[] = ['high', 'medium', 'low'];

export function normalizeExtraction(raw: Partial<ReceiptExtractionResult>): ReceiptExtractionResult {
  const category = normalizeCategory(raw.category);
  const gstRate = normalizeGstRate(raw.gst_rate);
  const confidence = normalizeConfidence(raw.confidence);

  return {
    date: typeof raw.date === 'string' ? raw.date : '',
    vendor_name: normalizeString(raw.vendor_name) || (category === 'sales' ? 'Self' : 'Vendor'),
    description: normalizeString(raw.description) || `${category} transaction`,
    amount: normalizeAmount(raw.amount),
    tax_amount: normalizeAmount(raw.tax_amount),
    gst_rate: gstRate,
    category,
    gst_category: normalizeGstCategory(raw.gst_category, category, gstRate),
    hsn_sac: normalizeString(raw.hsn_sac),
    invoice_number: normalizeString(raw.invoice_number),
    vendor_gstin: normalizeString(raw.vendor_gstin),
    confidence,
    error: raw.error,
  };
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function normalizeCategory(value: unknown): TransactionCategory {
  const category = String(value || '').toLowerCase() as TransactionCategory;
  return VALID_CATEGORIES.includes(category) ? category : 'other';
}

function normalizeGstRate(value: unknown): GstRate {
  const rate = Number(value);
  if (VALID_GST_RATES.includes(rate as GstRate)) {
    return rate as GstRate;
  }
  return VALID_GST_RATES.reduce((prev, curr) =>
    Math.abs(curr - rate) < Math.abs(prev - rate) ? curr : prev
  );
}

function normalizeGstCategory(value: unknown, category: TransactionCategory, rate: GstRate): GstCategory {
  const raw = String(value || '').trim();
  const gstCategory = (raw.toUpperCase() === 'B2B' || raw.toUpperCase() === 'B2C' || raw.toUpperCase() === 'B2CL'
    ? raw.toUpperCase()
    : raw.toLowerCase()) as GstCategory;

  if (VALID_GST_CATEGORIES.includes(gstCategory)) {
    return gstCategory;
  }
  if (rate === 0) {
    return 'exempt';
  }
  return category === 'sales' ? 'B2C' : 'B2B';
}

function normalizeConfidence(value: unknown): ConfidenceLevel {
  const confidence = String(value || '').toLowerCase() as ConfidenceLevel;
  return VALID_CONFIDENCE.includes(confidence) ? confidence : 'low';
}
