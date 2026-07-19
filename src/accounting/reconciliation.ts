import { Transaction } from '../types';

export interface ReconciliationMatch {
  bankTransactionId: string;
  ledgerTransactionId: string;
  amountDifference: number;
  dateDifferenceDays: number;
  confidence: 'high' | 'medium';
}

export interface ReconciliationSummary {
  totalBankLines: number;
  matchedBankLines: number;
  unmatchedBankLines: Transaction[];
  unmatchedLedgerEntries: Transaction[];
  matches: ReconciliationMatch[];
}

interface ReconciliationOptions {
  amountTolerance?: number;
  dateToleranceDays?: number;
}

export function reconcileTransactions(
  transactions: Transaction[],
  options: ReconciliationOptions = {}
): ReconciliationSummary {
  const amountTolerance = options.amountTolerance ?? 1;
  const dateToleranceDays = options.dateToleranceDays ?? 3;

  const confirmed = transactions.filter((tx) => !tx.status || tx.status === 'confirmed');
  const bankLines = confirmed.filter(isBankStatementLine);
  const ledgerEntries = confirmed.filter((tx) => !isBankStatementLine(tx));
  const unmatchedLedgerIds = new Set(ledgerEntries.map((tx) => tx.id));
  const matches: ReconciliationMatch[] = [];
  const unmatchedBankLines: Transaction[] = [];

  for (const bankLine of bankLines) {
    const match = findBestLedgerMatch(bankLine, ledgerEntries, unmatchedLedgerIds, amountTolerance, dateToleranceDays);

    if (!match) {
      unmatchedBankLines.push(bankLine);
      continue;
    }

    unmatchedLedgerIds.delete(match.ledger.id);
    matches.push({
      bankTransactionId: bankLine.id,
      ledgerTransactionId: match.ledger.id,
      amountDifference: match.amountDifference,
      dateDifferenceDays: match.dateDifferenceDays,
      confidence: match.amountDifference === 0 && match.dateDifferenceDays <= 1 ? 'high' : 'medium',
    });
  }

  return {
    totalBankLines: bankLines.length,
    matchedBankLines: matches.length,
    unmatchedBankLines,
    unmatchedLedgerEntries: ledgerEntries.filter((tx) => unmatchedLedgerIds.has(tx.id)),
    matches,
  };
}

export function isBankStatementLine(transaction: Transaction): boolean {
  return (
    transaction.source === 'whatsapp_pdf' &&
    (transaction.raw_text || '').toLowerCase().includes('bank_statement')
  );
}

function findBestLedgerMatch(
  bankLine: Transaction,
  ledgerEntries: Transaction[],
  unmatchedLedgerIds: Set<string>,
  amountTolerance: number,
  dateToleranceDays: number
): { ledger: Transaction; amountDifference: number; dateDifferenceDays: number } | null {
  let bestMatch: { ledger: Transaction; amountDifference: number; dateDifferenceDays: number } | null = null;

  for (const ledger of ledgerEntries) {
    if (!unmatchedLedgerIds.has(ledger.id)) continue;
    if (ledger.category !== bankLine.category) continue;

    const amountDifference = Math.abs(totalAmount(bankLine) - totalAmount(ledger));
    if (amountDifference > amountTolerance) continue;

    const dateDifferenceDays = Math.abs(daysBetween(bankLine.date, ledger.date));
    if (dateDifferenceDays > dateToleranceDays) continue;

    if (
      !bestMatch ||
      amountDifference < bestMatch.amountDifference ||
      (amountDifference === bestMatch.amountDifference && dateDifferenceDays < bestMatch.dateDifferenceDays)
    ) {
      bestMatch = { ledger, amountDifference, dateDifferenceDays };
    }
  }

  return bestMatch;
}

function totalAmount(transaction: Transaction): number {
  return Number(transaction.amount) + Number(transaction.tax_amount || 0);
}

function daysBetween(a: string, b: string): number {
  const aTime = new Date(`${a}T00:00:00Z`).getTime();
  const bTime = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.round((aTime - bTime) / (24 * 60 * 60 * 1000));
}
