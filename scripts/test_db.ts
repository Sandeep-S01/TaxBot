import dotenv from 'dotenv';
import axios from 'axios';
dotenv.config();

import { supabase } from '../src/db/client';
import { getClientByPhone } from '../src/db/clients';
import { logData, logProviderError, printDevOnlyWarning, safeIdentifier } from './dev_logging';

async function testSupabase() {
  printDevOnlyWarning('test_db');
  console.log('--- Testing Supabase Connection ---');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  console.log('SUPABASE_URL:', url ? 'Present' : 'Missing');
  console.log('SUPABASE_KEY:', key ? 'Present' : 'Missing');
  
  if (!url || !key) return;

  try {
    const res = await axios.get(`${url}/rest/v1/clients?limit=1`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    console.log('Raw API Success! Status:', res.status);
    logData('Data summary', res.data);
  } catch (err: any) {
    console.error('Raw API Request Failed!');
    if (err.response) {
      console.error('Status:', err.response.status);
      logProviderError('Supabase REST error:', 'supabase', 'test_db_rest', err);
    } else {
      logProviderError('Supabase REST error:', 'supabase', 'test_db_rest', err);
    }
  }
}

async function testGetClient() {
  try {
    console.log('\n--- Testing getClientByPhone ---');
    const client = await getClientByPhone('15556700514');
    console.log('Client result:', client ? {
      id: safeIdentifier(client.id, 'client'),
      phone: safeIdentifier(client.phone, 'phone'),
      gst_registered: client.gst_registered,
      plan: client.plan,
    } : null);
  } catch (err: any) {
    logProviderError('getClientByPhone failed:', 'supabase', 'test_get_client_by_phone', err);
  }
}

async function run() {
  await testSupabase();
  await testGetClient();
}

run();
