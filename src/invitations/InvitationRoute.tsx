import { useEffect,useRef,useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthForm } from '../auth/AuthForm';
import type { Workspace } from '../workspace/types';
import { acceptInvitation } from './service';
import { InvitationError } from './types';

export function InvitationAccess({client,token}:{client:SupabaseClient;token:string}){
  const[mode,setMode]=useState<'signin'|'signup'>('signin');
  return <><section className="invite-intro"><div className="eyebrow">SAFESHARE WORKSPACE INVITATION</div><h1>Join a SafeShare workspace</h1><p>You've been invited to join a SafeShare workspace. Sign in or create an account with the invited email address to continue.</p></section><AuthForm client={client} mode={mode} invitationToken={token} allowModeSwitch onNavigate={()=>setMode(value=>value==='signin'?'signup':'signin')}/></>;
}
export function InvitationAcceptance({client,token,onAccepted,onContinue}:{client:SupabaseClient;token:string;onAccepted:(workspace:Workspace)=>void;onContinue:()=>void}){
  const[busy,setBusy]=useState(false),[error,setError]=useState(''),[failure,setFailure]=useState<InvitationError['code']|null>(null),[accepted,setAccepted]=useState<Workspace|null>(null);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
  async function accept(){setBusy(true);setError('');setFailure(null);try{const workspace=await acceptInvitation(client,token);if(mounted.current){setAccepted(workspace);onAccepted(workspace)}}catch(caught){if(mounted.current){setFailure(caught instanceof InvitationError?caught.code:'network');setError(caught instanceof Error?caught.message:'This invitation could not be accepted.')}}finally{if(mounted.current)setBusy(false)}}
  if(accepted)return <main className="state-page"><section className="auth-card"><div className="eyebrow">WORKSPACE INVITATION</div><h1>Invitation accepted</h1><div className="auth-message" role="status">You're now a member of {accepted.name}.</div><p>Open SafeShare Agent and sign in with this same account to load your company's protection policy.</p><button className="primary wide" onClick={onContinue}>Continue to SafeShare</button></section></main>;
  const canSwitch=failure==='wrong-account'||failure==='unconfirmed';
  return <main className="state-page"><section className="auth-card"><div className="eyebrow">WORKSPACE INVITATION</div><h1>{error?'Invitation unavailable':'Accept workspace invitation'}</h1>{error?<div className="auth-message" role="alert">{error}</div>:<p>Accept this invitation to join the workspace using your signed-in account.</p>}{!error&&<button className="primary wide" disabled={busy} onClick={()=>void accept()}>{busy?'Accepting invitation...':'Accept invitation'}</button>}{canSwitch&&<button className="secondary wide" onClick={()=>void client.auth.signOut()}>Sign in with another account</button>}{failure==='accepted'&&<button className="secondary wide" onClick={onContinue}>Continue to SafeShare</button>}</section></main>;
}