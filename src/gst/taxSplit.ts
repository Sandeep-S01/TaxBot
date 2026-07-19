import { Transaction } from '../types';

export interface GstTaxSplit {
  igst: number;
  cgst: number;
  sgst: number;
  splitType: 'intra_state' | 'inter_state' | 'unknown';
}

export function getGstinStateCode(gstin: string | null | undefined): string | null {
  const normalized = String(gstin || '').trim().toUpperCase();
  return /^[0-9]{2}[A-Z0-9]{13}$/.test(normalized) ? normalized.slice(0, 2) : null;
}

export function splitGstTax(
  taxAmount: number,
  clientGstin: string | null | undefined,
  counterpartyGstin: string | null | undefined
): GstTaxSplit {
  const tax = Number(taxAmount || 0);
  if (tax <= 0) {
    return { igst: 0, cgst: 0, sgst: 0, splitType: 'unknown' };
  }

  const clientState = getGstinStateCode(clientGstin);
  const counterpartyState = getGstinStateCode(counterpartyGstin);

  if (clientState && counterpartyState && clientState !== counterpartyState) {
    return { igst: tax, cgst: 0, sgst: 0, splitType: 'inter_state' };
  }

  const half = tax / 2;
  return {
    igst: 0,
    cgst: half,
    sgst: half,
    splitType: clientState && counterpartyState ? 'intra_state' : 'unknown',
  };
}

export function splitTransactionGst(
  transaction: Transaction,
  clientGstin: string | null | undefined
): GstTaxSplit {
  return splitGstTax(Number(transaction.tax_amount || 0), clientGstin, transaction.vendor_gstin);
}
