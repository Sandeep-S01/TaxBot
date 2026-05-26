import { supabase } from './client';
import { Transaction, TransactionCategory } from '../types';

export async function createTransaction(
  transaction: Omit<Transaction, 'id' | 'created_at'>
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .insert([transaction])
    .select()
    .single();

  if (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }

  return data;
}

export async function getTransactionsByDateRange(
  clientId: string,
  startDate: string,
  endDate: string
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('client_id', clientId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching transactions by date range:', error);
    throw error;
  }

  return data || [];
}

// Convert YYYY-MM period to start/end dates
export function periodToDateRange(period: string): { startDate: string; endDate: string } {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(`Invalid period format: ${period}. Expected YYYY-MM`);
  }

  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  if (month < 1 || month > 12) {
    throw new Error(`Invalid period format: ${period}. Expected YYYY-MM`);
  }

  const startDate = `${period}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${period}-${String(lastDay).padStart(2, '0')}`;

  return { startDate, endDate };
}


export interface MonthlyPLReport {
  period: string;
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  totalSalaries: number;
  totalOther: number;
  netProfit: number;
}

export async function getMonthlyPLReport(
  clientId: string,
  period: string
): Promise<MonthlyPLReport> {
  const { startDate, endDate } = periodToDateRange(period);
  const transactions = await getTransactionsByDateRange(clientId, startDate, endDate);

  let totalSales = 0;
  let totalPurchases = 0;
  let totalExpenses = 0;
  let totalSalaries = 0;
  let totalOther = 0;

  for (const tx of transactions) {
    const amount = Number(tx.amount);
    switch (tx.category) {
      case 'sales':
        totalSales += amount;
        break;
      case 'purchase':
        totalPurchases += amount;
        break;
      case 'expense':
        totalExpenses += amount;
        break;
      case 'salary':
        totalSalaries += amount;
        break;
      case 'other':
        totalOther += amount;
        break;
    }
  }

  const netProfit = totalSales - (totalPurchases + totalExpenses + totalSalaries + totalOther);

  return {
    period,
    totalSales,
    totalPurchases,
    totalExpenses,
    totalSalaries,
    totalOther,
    netProfit,
  };
}

export interface GSTR3BData {
  period: string;
  outwardSupplies: {
    taxableValue: number;
    igst: number; // For simplicity in our summaries we calculate tax_amount
    cgst: number; // and split it or report it under consolidated GST columns
    sgst: number;
    totalTax: number;
    byRate: { [rate: number]: { taxableValue: number; taxAmount: number } };
  };
  inwardEligibleITC: {
    taxableValue: number;
    totalTax: number;
    byRate: { [rate: number]: { taxableValue: number; taxAmount: number } };
  };
}

export async function getGSTR3BSummary(
  clientId: string,
  period: string
): Promise<GSTR3BData> {
  const { startDate, endDate } = periodToDateRange(period);
  const transactions = await getTransactionsByDateRange(clientId, startDate, endDate);

  const outwardSupplies = {
    taxableValue: 0,
    igst: 0,
    cgst: 0,
    sgst: 0,
    totalTax: 0,
    byRate: {} as { [rate: number]: { taxableValue: number; taxAmount: number } },
  };

  const inwardEligibleITC = {
    taxableValue: 0,
    totalTax: 0,
    byRate: {} as { [rate: number]: { taxableValue: number; taxAmount: number } },
  };

  for (const tx of transactions) {
    const amount = Number(tx.amount);
    const taxAmount = Number(tx.tax_amount || 0);
    const rate = Number(tx.gst_rate || 0);

    if (tx.category === 'sales') {
      outwardSupplies.taxableValue += amount;
      outwardSupplies.totalTax += taxAmount;

      // Group by rate
      if (!outwardSupplies.byRate[rate]) {
        outwardSupplies.byRate[rate] = { taxableValue: 0, taxAmount: 0 };
      }
      outwardSupplies.byRate[rate].taxableValue += amount;
      outwardSupplies.byRate[rate].taxAmount += taxAmount;

      // Split tax (approximate 50-50 for CGST/SGST, and IGST for simplicity if we don't have place of supply details)
      // Standard rule: if it's B2B and we want to show it, or assume local (CGST/SGST) unless specified.
      // We will split the tax for presentation
      outwardSupplies.cgst += taxAmount / 2;
      outwardSupplies.sgst += taxAmount / 2;
    } else {
      // purchase, expense, salary, other are parts of business inputs (eligible for ITC if GST registered)
      inwardEligibleITC.taxableValue += amount;
      inwardEligibleITC.totalTax += taxAmount;

      // Group by rate
      if (!inwardEligibleITC.byRate[rate]) {
        inwardEligibleITC.byRate[rate] = { taxableValue: 0, taxAmount: 0 };
      }
      inwardEligibleITC.byRate[rate].taxableValue += amount;
      inwardEligibleITC.byRate[rate].taxAmount += taxAmount;
    }
  }

  return {
    period,
    outwardSupplies,
    inwardEligibleITC,
  };
}
