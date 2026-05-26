import { Transaction } from '../types';
import { getTransactionsByDateRange, periodToDateRange } from '../db/transactions';

export interface Gstr1Summary {
  period: string;
  totalTaxableValue: number;
  totalTaxAmount: number;
  b2b: {
    count: number;
    taxableValue: number;
    taxAmount: number;
    invoices: Array<{
      invoiceNumber: string;
      date: string;
      taxableValue: number;
      taxAmount: number;
      rate: number;
      hsnSac: string | null;
    }>;
  };
  b2c: {
    count: number;
    taxableValue: number;
    taxAmount: number;
    invoices: Array<{
      invoiceNumber: string;
      date: string;
      taxableValue: number;
      taxAmount: number;
      rate: number;
    }>;
  };
  exempted: {
    count: number;
    taxableValue: number;
  };
}

/**
 * Builds a GSTR-1 summary for a client in a given period.
 */
export async function buildGstr1(clientId: string, period: string): Promise<Gstr1Summary> {
  const { startDate, endDate } = periodToDateRange(period);
  const transactions = await getTransactionsByDateRange(clientId, startDate, endDate);

  const summary: Gstr1Summary = {
    period,
    totalTaxableValue: 0,
    totalTaxAmount: 0,
    b2b: { count: 0, taxableValue: 0, taxAmount: 0, invoices: [] },
    b2c: { count: 0, taxableValue: 0, taxAmount: 0, invoices: [] },
    exempted: { count: 0, taxableValue: 0 },
  };

  const sales = transactions.filter((tx) => tx.category === 'sales');

  for (const tx of sales) {
    const amount = Number(tx.amount);
    const taxAmount = Number(tx.tax_amount || 0);
    const rate = Number(tx.gst_rate || 0);

    summary.totalTaxableValue += amount;
    summary.totalTaxAmount += taxAmount;

    if (tx.gst_category === 'B2B') {
      summary.b2b.count++;
      summary.b2b.taxableValue += amount;
      summary.b2b.taxAmount += taxAmount;
      summary.b2b.invoices.push({
        invoiceNumber: tx.invoice_number || `INV-M-${tx.id.substring(0, 8)}`,
        date: tx.date,
        taxableValue: amount,
        taxAmount: taxAmount,
        rate: rate,
        hsnSac: tx.hsn_sac,
      });
    } else if (tx.gst_category === 'exempt' || tx.gst_category === 'nil_rated' || rate === 0) {
      summary.exempted.count++;
      summary.exempted.taxableValue += amount;
    } else {
      // Default to B2C (small/large combined for basic reporting)
      summary.b2c.count++;
      summary.b2c.taxableValue += amount;
      summary.b2c.taxAmount += taxAmount;
      summary.b2c.invoices.push({
        invoiceNumber: tx.invoice_number || `INV-C-${tx.id.substring(0, 8)}`,
        date: tx.date,
        taxableValue: amount,
        taxAmount: taxAmount,
        rate: rate,
      });
    }
  }

  return summary;
}
