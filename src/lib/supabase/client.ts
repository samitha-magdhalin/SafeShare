import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './config';

let browserClient:SupabaseClient|null|undefined;
export function getSupabaseClient():SupabaseClient|null{
  if(browserClient!==undefined)return browserClient;
  const config=readSupabaseConfig();
  browserClient=config?createClient(config.url,config.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
  return browserClient;
}
