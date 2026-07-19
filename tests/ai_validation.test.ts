import { describe, expect, it } from 'vitest';
import { normalizeExtraction } from '../src/ai/validateExtraction';

describe('AI extraction normalization', () => {
  it('normalizes invalid categories, GST rates, and confidence values', () => {
    const tx = normalizeExtraction({
      amount: '100.50' as any,
      tax_amount: '-10' as any,
      gst_rate: 17 as any,
      category: 'unknown' as any,
      gst_category: 'bad' as any,
      confidence: 'certain' as any,
    });

    expect(tx.amount).toBe(100.5);
    expect(tx.tax_amount).toBe(0);
    expect(tx.gst_rate).toBe(18);
    expect(tx.category).toBe('other');
    expect(tx.gst_category).toBe('B2B');
    expect(tx.confidence).toBe('low');
  });

  it('defaults zero-rated transactions to exempt GST treatment', () => {
    const tx = normalizeExtraction({
      amount: 500,
      gst_rate: 0,
      category: 'expense',
      confidence: 'medium',
    });

    expect(tx.gst_category).toBe('exempt');
  });
});
