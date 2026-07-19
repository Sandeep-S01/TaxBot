import { supabase } from './client';
import { Transaction, TransactionCategory, TransactionStatus } from '../types';
import { getClientById } from './clients';
import { splitTransactionGst } from '../gst/taxSplit';
import { summarizeProviderError } from '../utils/privacy';

type TransactionInsert = Omit<Transaction, 'id' | 'created_at' | 'status' | 'review_reason' | 'confirmed_at'> &
  Partial<Pick<Transaction, 'status' | 'review_reason' | 'confirmed_at'>>;

interface DuplicateCheckOutcome {
  candidate: Transaction | null;
  failed: boolean;
}

export interface TransactionPage {
  data: Transaction[];
  count: number | null;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export async function createTransaction(
  transaction: TransactionInsert
): Promise<Transaction> {
  const reviewedTransaction = await applyReviewStatus(transaction);

  const { data, error } = await supabase
    .from('transactions')
    .insert([reviewedTransaction])
    .select()
    .single();

  if (error) {
    console.error('Error creating transaction:', summarizeProviderError('supabase', 'create_transaction', error));
    throw error;
  }

  return data;
}

async function applyReviewStatus(transaction: TransactionInsert): Promise<TransactionInsert> {
  const duplicateOutcome = await findDuplicateCandidateWithStatus(transaction);
  const reasons = getTransactionReviewReasons(
    transaction,
    duplicateOutcome.candidate,
    duplicateOutcome.failed
  );

  if (reasons.length === 0) {
    return {
      ...transaction,
      status: transaction.status || 'confirmed',
      review_reason: transaction.review_reason || null,
      confirmed_at: transaction.confirmed_at || new Date().toISOString(),
    };
  }

  return {
    ...transaction,
    status: 'needs_review',
    review_reason: reasons.join(','),
    confirmed_at: null,
  };
}

export async function findDuplicateCandidate(
  transaction: Pick<TransactionInsert, 'client_id' | 'date' | 'amount' | 'tax_amount' | 'invoice_number' | 'vendor_gstin' | 'vendor_name'>
): Promise<Transaction | null> {
  return (await findDuplicateCandidateWithStatus(transaction)).candidate;
}

async function findDuplicateCandidateWithStatus(
  transaction: Pick<TransactionInsert, 'client_id' | 'date' | 'amount' | 'tax_amount' | 'invoice_number' | 'vendor_gstin' | 'vendor_name'>
): Promise<DuplicateCheckOutcome> {
  if (!transaction.invoice_number && !transaction.vendor_gstin && !transaction.vendor_name) {
    return { candidate: null, failed: false };
  }

  const { startDate, endDate } = duplicateDateWindow(transaction.date);
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('client_id', transaction.client_id)
    .gte('date', startDate)
    .lte('date', endDate)
    .limit(50);

  if (error) {
    console.warn('Duplicate transaction check failed:', summarizeProviderError('supabase', 'find_duplicate_transaction_candidate', error));
    return { candidate: null, failed: true };
  }

  return {
    candidate: (data || []).find((candidate) => isDuplicateTransactionCandidate(transaction, candidate)) || null,
    failed: false,
  };
}

export function getTransactionReviewReasons(
  transaction: Pick<TransactionInsert, 'confidence'>,
  duplicateCandidate: Pick<Transaction, 'id'> | null,
  duplicateCheckFailed = false
): string[] {
  const reasons: string[] = [];

  if (transaction.confidence === 'low') {
    reasons.push('low_confidence_ai_extraction');
  }

  if (duplicateCheckFailed) {
    reasons.push('duplicate_check_failed');
  }

  if (duplicateCandidate) {
    reasons.push(`possible_duplicate:${duplicateCandidate.id}`);
  }

  return reasons;
}

export function isDuplicateTransactionCandidate(
  incoming: Pick<TransactionInsert, 'date' | 'amount' | 'tax_amount' | 'invoice_number' | 'vendor_gstin' | 'vendor_name'>,
  existing: Pick<Transaction, 'date' | 'amount' | 'tax_amount' | 'invoice_number' | 'vendor_gstin' | 'vendor_name'>
): boolean {
  const amountDifference = Math.abs(Number(incoming.amount) - Number(existing.amount));
  const taxDifference = Math.abs(Number(incoming.tax_amount || 0) - Number(existing.tax_amount || 0));
  if (amountDifference > 1 || taxDifference > 1) {
    return false;
  }

  if (Math.abs(daysBetween(incoming.date, existing.date)) > 3) {
    return false;
  }

  const invoiceA = normalizeDuplicateKey(incoming.invoice_number);
  const invoiceB = normalizeDuplicateKey(existing.invoice_number);
  if (invoiceA && invoiceB) {
    return invoiceA === invoiceB;
  }

  const gstinA = normalizeDuplicateKey(incoming.vendor_gstin);
  const gstinB = normalizeDuplicateKey(existing.vendor_gstin);
  if (gstinA && gstinB) {
    return gstinA === gstinB;
  }

  const vendorA = normalizeDuplicateKey(incoming.vendor_name);
  const vendorB = normalizeDuplicateKey(existing.vendor_name);
  return Boolean(vendorA && vendorB && vendorA === vendorB);
}

function normalizeDuplicateKey(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function duplicateDateWindow(date: string): { startDate: string; endDate: string } {
  const base = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(base.getTime())) {
    return { startDate: date, endDate: date };
  }
  const start = new Date(base);
  start.setUTCDate(start.getUTCDate() - 3);
  const end = new Date(base);
  end.setUTCDate(end.getUTCDate() + 3);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

function daysBetween(a: string, b: string): number {
  const aTime = new Date(`${a}T00:00:00Z`).getTime();
  const bTime = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.round((aTime - bTime) / (24 * 60 * 60 * 1000));
}

export async function getTransactionById(id: string): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching transaction by ID:', summarizeProviderError('supabase', 'get_transaction_by_id', error));
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
    console.error('Error fetching transactions by date range:', summarizeProviderError('supabase', 'get_transactions_by_date_range', error));
    throw error;
  }

  return data || [];
}

export async function getTransactionsByDateRangePage(
  clientId: string,
  startDate: string,
  endDate: string,
  options: { limit: number; offset?: number; ascending?: boolean }
): Promise<TransactionPage> {
  const limit = options.limit;
  const offset = options.offset || 0;
  const { data, error, count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .eq('client_id', clientId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: options.ascending ?? true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching paginated transactions by date range:', summarizeProviderError('supabase', 'get_transactions_by_date_range_page', error));
    throw error;
  }

  return {
    data: data || [],
    count,
    limit,
    offset,
    hasMore: count === null ? (data || []).length === limit : offset + (data || []).length < count,
  };
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
    if (tx.status && tx.status !== 'confirmed') {
      continue;
    }

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
  const client = await getClientById(clientId);
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
    if (tx.status && tx.status !== 'confirmed') {
      continue;
    }

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

      const split = splitTransactionGst(tx, client?.gstin);
      outwardSupplies.igst += split.igst;
      outwardSupplies.cgst += split.cgst;
      outwardSupplies.sgst += split.sgst;
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

export async function updateTransactionCategory(
  id: string,
  category: TransactionCategory
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .update({
      category,
      status: 'confirmed',
      review_reason: null,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating transaction category:', summarizeProviderError('supabase', 'update_transaction_category', error));
    throw error;
  }

  return data;
}

export async function updateTransactionStatus(
  id: string,
  status: TransactionStatus,
  reviewReason: string | null = null
): Promise<Transaction> {
  const updates: Partial<Pick<Transaction, 'status' | 'review_reason' | 'confirmed_at'>> = {
    status,
    review_reason: reviewReason,
    confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating transaction status:', summarizeProviderError('supabase', 'update_transaction_status', error));
    throw error;
  }

  return data;
}

export async function getTransactionsSince(
  clientId: string,
  since: string
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('client_id', clientId)
    .gt('created_at', since)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching transactions since timestamp:', summarizeProviderError('supabase', 'get_transactions_since', error));
    throw error;
  }

  return data || [];
}

// Batch-fetch transactions across multiple clients within a date range
export async function getTransactionsForMultipleClients(
  clientIds: string[],
  startDate: string,
  endDate: string
): Promise<Transaction[]> {
  if (clientIds.length === 0) return [];

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .in('client_id', clientIds)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching transactions for multiple clients:', summarizeProviderError('supabase', 'get_transactions_for_multiple_clients', error));
    throw error;
  }

  return data || [];
}

export async function getTransactionsForMultipleClientsPage(
  clientIds: string[],
  startDate: string,
  endDate: string,
  options: { limit: number; offset?: number }
): Promise<TransactionPage> {
  if (clientIds.length === 0) {
    return { data: [], count: 0, limit: options.limit, offset: options.offset || 0, hasMore: false };
  }

  const limit = options.limit;
  const offset = options.offset || 0;
  const { data, error, count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .in('client_id', clientIds)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching paginated transactions for multiple clients:', summarizeProviderError('supabase', 'get_transactions_for_multiple_clients_page', error));
    throw error;
  }

  return {
    data: data || [],
    count,
    limit,
    offset,
    hasMore: count === null ? (data || []).length === limit : offset + (data || []).length < count,
  };
}
