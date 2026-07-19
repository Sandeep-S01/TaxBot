import { describe, expect, it } from 'vitest';
import { reconcileTransactions } from '../src/accounting/reconciliation';
import { Transaction } from '../src/types';

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-default',
    client_id: 'client-1',
    date: '2026-05-10',
    vendor_name: 'Party',
    description: 'Entry',
    amount: 1000,
    tax_amount: 0,
    category: 'sales',
    gst_category: 'B2C',
    gst_rate: 0,
    hsn_sac: null,
    invoice_number: null,
    source: 'manual',
    raw_text: null,
    confidence: 'high',
    status: 'confirmed',
    review_reason: null,
    confirmed_at: '2026-05-10T00:00:00Z',
    created_at: '2026-05-10T00:00:00Z',
    ...overrides,
  };
}

describe('Bank reconciliation', () => {
  it('matches confirmed bank statement lines to ledger entries by amount, date, and category', () => {
    const summary = reconcileTransactions([
      tx({
        id: 'bank-1',
        source: 'whatsapp_pdf',
        raw_text: 'PDF bank_statement Row: credited by customer',
        date: '2026-05-11',
      }),
      tx({
        id: 'ledger-1',
        source: 'whatsapp_image',
        raw_text: 'invoice',
        date: '2026-05-10',
      }),
    ]);

    expect(summary.totalBankLines).toBe(1);
    expect(summary.matchedBankLines).toBe(1);
    expect(summary.matches[0]).toMatchObject({
      bankTransactionId: 'bank-1',
      ledgerTransactionId: 'ledger-1',
      dateDifferenceDays: 1,
      confidence: 'high',
    });
  });

  it('flags bank lines and ledger entries that do not reconcile', () => {
    const summary = reconcileTransactions([
      tx({
        id: 'bank-1',
        source: 'whatsapp_pdf',
        raw_text: 'PDF bank_statement Row',
        amount: 1200,
      }),
      tx({
        id: 'ledger-1',
        source: 'manual',
        amount: 1000,
      }),
    ]);

    expect(summary.matchedBankLines).toBe(0);
    expect(summary.unmatchedBankLines.map((line) => line.id)).toEqual(['bank-1']);
    expect(summary.unmatchedLedgerEntries.map((line) => line.id)).toEqual(['ledger-1']);
  });

  it('excludes review-needed rows from reconciliation', () => {
    const summary = reconcileTransactions([
      tx({
        id: 'bank-review',
        source: 'whatsapp_pdf',
        raw_text: 'PDF bank_statement Row',
        status: 'needs_review',
      }),
      tx({
        id: 'ledger-1',
        source: 'manual',
      }),
    ]);

    expect(summary.totalBankLines).toBe(0);
    expect(summary.unmatchedLedgerEntries.map((line) => line.id)).toEqual(['ledger-1']);
  });
});
