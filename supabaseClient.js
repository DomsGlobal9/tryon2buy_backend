/**
 * supabaseClient.js — Supabase client singleton for storage operations
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_KEY = process.env.SUPABASE_KEY?.trim();
console.log('SUPABASE_KEY length in supabaseClient:', SUPABASE_KEY ? SUPABASE_KEY.length : 'undefined');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('[Supabase] WARNING: SUPABASE_URL or SUPABASE_KEY not set. Storage uploads will fail.');
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_KEY || '');

module.exports = supabase;
