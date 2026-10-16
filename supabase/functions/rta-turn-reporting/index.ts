import { createHandler } from './handler.mjs';
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const backendKey = secretKeys['default'] || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!backendKey) throw new Error('Backend credential unavailable');
Deno.serve(createHandler({
  url: Deno.env.get('SUPABASE_URL'), backendKey,
  writerKeys: JSON.parse(Deno.env.get('RTA_TURN_WRITER_KEYS') || '{}'),
  origins: ['https://remogroup.github.io'],
}));
