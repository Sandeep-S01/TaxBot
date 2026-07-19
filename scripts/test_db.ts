import dotenv from 'dotenv';
import axios from 'axios';
dotenv.config();

import { supabase } from '../src/db/client';
import { getClientByPhone } from '../src/db/clients';

async function testSupabase() {
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
    console.log('Data:', res.data);
  } catch (err: any) {
    console.error('Raw API Request Failed!');
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Headers:', err.response.headers);
      console.error('Body:', err.response.data);
    } else {
      console.error('Error:', err.message);
    }
  }
}

async function testGetClient() {
  try {
    console.log('\n--- Testing getClientByPhone ---');
    const client = await getClientByPhone('15556700514');
    console.log('Client result:', client);
  } catch (err: any) {
    console.error('getClientByPhone failed:', err.message || err);
  }
}

async function run() {
  await testSupabase();
  await testGetClient();
}

run();
