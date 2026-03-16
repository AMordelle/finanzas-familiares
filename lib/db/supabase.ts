import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL para inicializar Supabase.');
}

if (!supabaseAnonKey) {
  throw new Error('Falta NEXT_PUBLIC_SUPABASE_ANON_KEY para inicializar el cliente público de Supabase.');
}

if (!supabaseServiceRoleKey) {
  throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY para inicializar el cliente servidor de Supabase.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
