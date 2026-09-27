export type SupabasePublicConfig={url:string;anonKey:string};

export function readSupabaseConfig(env:Record<string,string|boolean|undefined>=import.meta.env):SupabasePublicConfig|null{
  const url=typeof env.VITE_SUPABASE_URL==='string'?env.VITE_SUPABASE_URL.trim():'';
  const anonKey=typeof env.VITE_SUPABASE_ANON_KEY==='string'?env.VITE_SUPABASE_ANON_KEY.trim():'';
  if(!url||!anonKey)return null;
  try{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))return null;}catch{return null;}
  return{url,anonKey};
}
export function isSupabaseConfigured(env:Record<string,string|boolean|undefined>=import.meta.env):boolean{return readSupabaseConfig(env)!==null;}
