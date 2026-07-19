import dotenv from 'dotenv';
dotenv.config();
import { supabase } from '../src/db/client';
import { printDevOnlyWarning, summarizeRows, logProviderError } from './dev_logging';

async function checkCAs() {
  printDevOnlyWarning('check_cas');
  const { data, error } = await supabase
    .from('cas')
    .select('id, name, email, firm_name')
    .limit(5);

  if (error) {
    logProviderError('Error fetching CA accounts:', 'supabase', 'check_cas', error);
    return;
  }
  console.log('CA accounts:', summarizeRows(data, ['id', 'name', 'email', 'firm_name']));
}

checkCAs();
