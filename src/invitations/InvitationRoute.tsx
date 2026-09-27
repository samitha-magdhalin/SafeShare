import { useEffect,useRef,useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthForm } from '../auth/AuthForm';
import type { Workspace } from '../workspace/types';
import { acceptInvitation } from './service';

export function InvitationAccess({client,token}:{client:SupabaseClient;token:string}){
  const[mode,setMode]=useState<'signin'|'signup'>('signin');
  const redirect=window.location.origin+'/invite/'+token;
  return <><section className="invite-intro"><div className="eyebrow">SAFESHARE WORKSPACE INVITATION</div><h1>Join a SafeShare workspace</h1><p>You've been invited to join a SafeShare workspace. Sign in or create an account with the invited email address to continue.</p></section><AuthForm client={client} mode={mode} emailRedirectTo={redirect} onNavigate={()=>setMode(value=>value==='signin'?'signup':'signin')}/></>;
}
export function InvitationAcceptance({client,token,onAccepted}:{client:SupabaseClient;token:string;onAccepted:(workspace:Workspace)=>void}){
  const[started]=useState(()=>({value:false})),[error,setError]=useState(''),[loading,setLoading]=useState(true);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;if(started.value)return;started.value=true;acceptInvitation(client,token).then(workspace=>{if(mounted.current)onAccepted(workspace)}).catch(caught=>{if(mounted.current){setError(caught instanceof Error?caught.message:'This invitation could not be accepted.');setLoading(false)}});return()=>{mounted.current=false}},[client,token,onAccepted,started]);
  return <main className="state-page"><section className="auth-card"><div className="eyebrow">WORKSPACE INVITATION</div><h1>{loading?'Joining workspace...':'Invitation unavailable'}</h1>{loading?<p role="status">Checking this invitation securely...</p>:<div className="auth-message" role="alert">{error}</div>}{!loading&&<button className="secondary wide" onClick={()=>void client.auth.signOut()}>Sign in with another account</button>}</section></main>;
}
