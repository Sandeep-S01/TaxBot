import { TransactionCategory } from '../types';
import { isValidPeriod } from '../utils/validation';

const VALID_TRANSACTION_CATEGORIES: TransactionCategory[] = ['sales', 'purchase', 'expense', 'salary', 'other'];
const VALID_EXPORT_FORMATS = ['csv', 'xml'] as const;

export type ExportFormat = (typeof VALID_EXPORT_FORMATS)[number];

export function isValidTransactionCategory(value: string): value is TransactionCategory {
  return VALID_TRANSACTION_CATEGORIES.includes(value as TransactionCategory);
}

export function parseExportReplyId(replyId: string): { period: string; format: ExportFormat } | null {
  const parts = replyId.split('_');
  if (parts.length !== 3 || parts[0] !== 'exp') {
    return null;
  }

  const [, period, format] = parts;
  if (!isValidPeriod(period) || !VALID_EXPORT_FORMATS.includes(format as ExportFormat)) {
    return null;
  }

  return { period, format: format as ExportFormat };
}
