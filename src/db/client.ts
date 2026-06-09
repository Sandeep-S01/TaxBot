import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
// Prioritize using the secure service_role key to bypass RLS policies on the server side securely.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    'WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in the environment. Supabase client will fail to initialize correctly.'
  );
}

if (process.env.SUPABASE_SERVICE_ROLE_KEY === 'your_supabase_service_role_secret_key') {
  console.warn(
    'WARNING: SUPABASE_SERVICE_ROLE_KEY is configured with the default placeholder "your_supabase_service_role_secret_key". You must replace it with your actual Supabase service_role key.'
  );
}

// Fallback dummy WebSocket for Node.js versions < 22 (like Render's default Node 20)
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = class {};
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key',
  {
    auth: {
      persistSession: false,
    },
  }
);
