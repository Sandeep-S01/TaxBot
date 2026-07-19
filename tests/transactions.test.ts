import { describe, it, expect } from 'vitest';
import {
  getTransactionReviewReasons,
  isDuplicateTransactionCandidate,
  periodToDateRange,
} from '../src/db/transactions';

describe('Period to Date Range Conversion', () => {
  it('should correctly calculate the start and end of months for standard months', () => {
    // May has 31 days
    expect(periodToDateRange('2026-05')).toEqual({
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });

    // April has 30 days
    expect(periodToDateRange('2026-04')).toEqual({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });
  });

  it('should correctly handle leap years and standard Februaries', () => {
    // 2024 is a leap year (February has 29 days)
    expect(periodToDateRange('2024-02')).toEqual({
      startDate: '2024-02-01',
      endDate: '2024-02-29',
    });

    // 2026 is not a leap year (February has 28 days)
    expect(periodToDateRange('2026-02')).toEqual({
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });
  });

  it('should throw an error for invalid period formats', () => {
    expect(() => periodToDateRange('2026-13')).toThrow();
    expect(() => periodToDateRange('invalid-period')).toThrow();
    expect(() => periodToDateRange('26-05')).toThrow();
  });
});

describe('Duplicate transaction candidate matching', () => {
  it('matches duplicate invoices across small date and amount differences', () => {
    expect(isDuplicateTransactionCandidate(
      {
        date: '2026-05-10',
        amount: 1000,
        tax_amount: 180,
        invoice_number: ' inv-001 ',
        vendor_gstin: null,
        vendor_name: 'Acme Traders',
      },
      {
        date: '2026-05-12',
        amount: 1000.5,
        tax_amount: 180,
        invoice_number: 'INV001',
        vendor_gstin: null,
        vendor_name: 'Other Name',
      }
    )).toBe(true);
  });

  it('rejects candidates outside amount or date tolerance', () => {
    const incoming = {
      date: '2026-05-10',
      amount: 1000,
      tax_amount: 180,
      invoice_number: 'INV-001',
      vendor_gstin: null,
      vendor_name: 'Acme Traders',
    };

    expect(isDuplicateTransactionCandidate(incoming, {
      ...incoming,
      date: '2026-05-20',
    })).toBe(false);

    expect(isDuplicateTransactionCandidate(incoming, {
      ...incoming,
      amount: 1200,
    })).toBe(false);
  });
});

describe('Transaction review reasons', () => {
  it('requires review when duplicate detection fails', () => {
    expect(getTransactionReviewReasons(
      { confidence: 'high' },
      null,
      true
    )).toEqual(['duplicate_check_failed']);
  });

  it('combines low-confidence and duplicate provenance reasons', () => {
    expect(getTransactionReviewReasons(
      { confidence: 'low' },
      { id: 'tx-duplicate' },
      false
    )).toEqual(['low_confidence_ai_extraction', 'possible_duplicate:tx-duplicate']);
  });
});
