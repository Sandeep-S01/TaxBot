import { describe, expect, it } from 'vitest';
import { getGstinStateCode, splitGstTax } from '../src/gst/taxSplit';

describe('GST tax split helper', () => {
  it('extracts GSTIN state codes', () => {
    expect(getGstinStateCode('27AAAAA1111A1Z1')).toBe('27');
    expect(getGstinStateCode('invalid')).toBeNull();
  });

  it('splits intra-state GST into CGST and SGST', () => {
    expect(splitGstTax(1800, '27AAAAA1111A1Z1', '27BBBBB2222B2Z2')).toEqual({
      igst: 0,
      cgst: 900,
      sgst: 900,
      splitType: 'intra_state',
    });
  });

  it('uses IGST for inter-state GST when state codes differ', () => {
    expect(splitGstTax(1800, '27AAAAA1111A1Z1', '09BBBBB2222B2Z2')).toEqual({
      igst: 1800,
      cgst: 0,
      sgst: 0,
      splitType: 'inter_state',
    });
  });

  it('falls back to local split when state evidence is missing', () => {
    expect(splitGstTax(100, '27AAAAA1111A1Z1', null)).toEqual({
      igst: 0,
      cgst: 50,
      sgst: 50,
      splitType: 'unknown',
    });
  });
});
