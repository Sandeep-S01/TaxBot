import dotenv from 'dotenv';
dotenv.config();
import { supabase } from '../src/db/client';

async function checkCAs() {
  const { data, error } = await supabase
    .from('cas')
    .select('id, name, email, firm_name')
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log('CA accounts:', JSON.stringify(data, null, 2));
}

checkCAs();
