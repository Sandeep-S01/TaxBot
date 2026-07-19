import dotenv from 'dotenv';
dotenv.config();
import { supabase } from '../src/db/client';

async function checkTransactions() {
  console.log('--- Checking Transactions in DB ---');
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching transactions:', error);
    return;
  }

  console.log(`Found ${transactions?.length || 0} transactions:`);
  console.log(JSON.stringify(transactions, null, 2));
}

checkTransactions();
