import dotenv from 'dotenv';
dotenv.config();
import { supabase } from '../src/db/client';
import { printDevOnlyWarning, summarizeRows, logProviderError } from './dev_logging';

async function checkTransactions() {
  printDevOnlyWarning('check_tx');
  console.log('--- Checking Transactions in DB ---');
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    logProviderError('Error fetching transactions:', 'supabase', 'check_transactions', error);
    return;
  }

  console.log(`Found ${transactions?.length || 0} transactions:`);
  console.log(summarizeRows(transactions, [
    'id',
    'client_id',
    'date',
    'category',
    'gst_category',
    'amount',
    'tax_amount',
    'status',
    'confidence',
    'source',
    'created_at',
  ]));
}

checkTransactions();
