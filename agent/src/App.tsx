import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { actionForFinding } from '../../src/policy/evaluatePolicy';
import { scan } from '../../src/detection/scan';
import { loadImage, protect } from '../../src/utils/image';
import { verifyImage } from '../../src/verification/verify';
import { ClipboardScanController } from './controller';
import { fingerprintImage } from './deduplicate';
import { approveAndWriteExact } from './approval';
import { AgentActivityLifecycle } from './activityLifecycle';
import { tauriBridge } from './native';
import { configuredAgentControlPlane } from './controlPlane/adapter';
import { NativePolicyCache } from './controlPlane/policyCache';
import { resolveTeamPolicy } from './controlPlane/policyResolver';
import { resolveWorkspaceSelection } from './controlPlane/workspaceResolution';
import type { AgentAccount, AgentControlPlane, AgentWorkspace, TeamPolicySnapshot } from './controlPlane/types';
import {
  applyTeamPolicy, beginProtection, dismissReview, emptyReviewState, finishVerification,
  clearReviewForSignOut, invalidateAuthorization, receiveReview, revokeApproval, type ReviewState,
} from './reviewState';
import './style.css';

function imageBlob(bytes: Uint8Array): Blob { return new Blob([new Uint8Array(bytes).buffer], { type: 'image/png' }); }
function useImageUrl(bytes?: Uint8Array): string { const url=useMemo(()=>bytes?URL.createObjectURL(imageBlob(bytes)):'',[bytes]);useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url]);return url; }
const samePolicy=(left:TeamPolicySnapshot,right:TeamPolicySnapshot)=>left.workspaceId===right.workspaceId&&left.version===right.version&&JSON.stringify(left.policy)===JSON.stringify(right.policy);

export default function App() {
  const controlPlane=useMemo<AgentControlPlane|null>(()=>configuredAgentControlPlane(),[]);
  const cache=useMemo(()=>new NativePolicyCache(tauriBridge),[]);
  const activity=useMemo(()=>new AgentActivityLifecycle(),[]);
  const[account,setAccount]=useState<AgentAccount|null>(null),[workspaces,setWorkspaces]=useState<AgentWorkspace[]>([]),[workspace,setWorkspace]=useState<AgentWorkspace|null>(null),[effectivePolicy,setEffectivePolicy]=useState<TeamPolicySnapshot|null>(null);
  const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const[review,setReview]=useState<ReviewState>(emptyReviewState),[progress,setProgress]=useState(''),[error,setError]=useState('');
  const reviewRef=useRef(review),workspaceRef=useRef(workspace),policyRef=useRef(effectivePolicy),controllerRef=useRef<ClipboardScanController|null>(null);
  reviewRef.current=review;workspaceRef.current=workspace;policyRef.current=effectivePolicy;
  const originalUrl=useImageUrl(review.active?.bytes),protectedUrl=useImageUrl(review.protected?.bytes);

  async function syncPolicy(showMessage=false):Promise<TeamPolicySnapshot|null>{
    const selected=workspaceRef.current;if(!controlPlane||!selected)return null;
    try{
      const next=await resolveTeamPolicy(controlPlane,cache,selected);activity.bind(next.workspaceId,next.version);policyRef.current=next;setEffectivePolicy(next);setReview(current=>applyTeamPolicy(current,next));
      await tauriBridge.setCompanyStatus(selected.name,next.version,next.source==='cache').catch(()=>undefined);
      if(showMessage)setMessage(next.source==='cache'?`Offline - using cached Team Policy v${next.version}`:`Team Policy v${next.version} is current.`);
      return next;
    }catch{
      activity.clear();policyRef.current=null;setEffectivePolicy(null);setReview(current=>invalidateAuthorization(current));setMessage('Team Policy unavailable');
      await tauriBridge.setCompanyStatus(selected.name,null,false).catch(()=>undefined);return null;
    }
  }
  async function activateWorkspace(selected:AgentWorkspace){workspaceRef.current=selected;setWorkspace(selected);setMessage('');await syncPolicy();}
  async function loadWorkspaces(){
    if(!controlPlane)return;const available=await controlPlane.listAccessibleWorkspaces();setWorkspaces(available);
    const resolution=resolveWorkspaceSelection(available);
    if(resolution.kind==='selected')await activateWorkspace(resolution.workspace);
    else if(resolution.kind==='none')setMessage('No company workspace is available for this account. Ask your SafeShare administrator to invite you.');
  }
  useEffect(()=>{if(!controlPlane)return;let active=true;controlPlane.getSession().then(async current=>{if(!active||!current)return;setAccount(current);try{await loadWorkspaces()}catch{if(active)setMessage('Company workspaces could not be loaded.')}});return()=>{active=false}},[controlPlane]);
  useEffect(()=>{void tauriBridge.setCompanyStatus(effectivePolicy?workspace?.name??null:null,effectivePolicy?.version??null,effectivePolicy?.source==='cache').catch(()=>undefined)},[workspace?.name,effectivePolicy]);
  useEffect(()=>{
    if(!account||!workspace||!controlPlane)return;
    const controller=new ClipboardScanController(tauriBridge,()=>syncPolicy(),candidate=>setReview(current=>receiveReview(current,candidate)));
    controllerRef.current=controller;let disposed=false,stopImages:(()=>void)|undefined,stopReview:(()=>void)|undefined,stopClose:(()=>void)|undefined;
    void controller.start().then(stop=>{if(disposed)stop();else stopImages=stop});
    void tauriBridge.listenForReview(()=>setError('')).then(stop=>{if(disposed)stop();else stopReview=stop});
    void getCurrentWindow().onCloseRequested(event=>{event.preventDefault();void getCurrentWindow().hide()}).then(stop=>{if(disposed)stop();else stopClose=stop});
    return()=>{disposed=true;stopImages?.();stopReview?.();stopClose?.();controllerRef.current=null};
  },[account?.id,workspace?.id,controlPlane]);

  async function signIn(event:FormEvent){event.preventDefault();if(!controlPlane)return;setBusy(true);setMessage('');try{const signedIn=await controlPlane.signIn(email,password);setPassword('');setAccount(signedIn);try{await loadWorkspaces()}catch{setMessage('Company workspaces could not be loaded.')}}catch{setMessage('Sign in could not finish. Check your email and password.')}finally{setBusy(false)}}
  async function signOut(){
    activity.clear();setReview(clearReviewForSignOut(reviewRef.current));setEffectivePolicy(null);policyRef.current=null;setWorkspace(null);workspaceRef.current=null;setWorkspaces([]);setAccount(null);setPassword('');setMessage('');setError('');
    await tauriBridge.setReviewAvailable(false).catch(()=>undefined);await tauriBridge.setCompanyStatus(null,null,false).catch(()=>undefined);await tauriBridge.hideReviewWindow().catch(()=>undefined);await controlPlane?.signOut().catch(()=>undefined);
  }
  async function protectAndVerify(){if(!controlPlane)return;
    const active=reviewRef.current.active;if(!active)return;const current=await syncPolicy();if(!current||!samePolicy(current,active.policy)){setMessage('Team Policy changed. Review the current actions and protect again.');return;}
    setError('');setProgress('Creating protected image...');setReview(state=>beginProtection(state));
    try{const image=await loadImage(imageBlob(active.bytes));let protectedBlob:Blob;try{protectedBlob=await protect(image,active.findings)}finally{image.close()}setProgress('Running a fresh verification scan...');const fresh=await scan(protectedBlob,setProgress);const verification=verifyImage(active.findings,fresh.findings,active.policy.policy);const bytes=new Uint8Array(await protectedBlob.arrayBuffer()),fingerprint=await fingerprintImage(bytes);if(reviewRef.current.active?.fingerprint!==active.fingerprint||!samePolicy(reviewRef.current.active.policy,active.policy)){bytes.fill(0);return}const output={fingerprint,bytes,findings:active.findings,workspaceId:active.policy.workspaceId,policyVersion:active.policy.version};setReview(state=>finishVerification(state,output,verification));setProgress('');if(verification.ready)try{await activity.recordVerified({workspaceId:output.workspaceId,policyVersion:output.policyVersion,protectedFingerprint:output.fingerprint},true,controlPlane)}catch{setMessage('Protected successfully. Workspace activity could not be updated.')}}catch{setReview(state=>({...revokeApproval(state),protected:null,verification:null,status:'review'}));setProgress('');setError('Protection or verification could not finish. Please retry.')}
  }
  async function approveAndCopy(){if(!controlPlane)return;const current=reviewRef.current,result=await approveAndWriteExact(current,{suppress:fingerprint=>controllerRef.current?.suppressOwnWrite(fingerprint),clearSuppression:fingerprint=>controllerRef.current?.clearOwnWriteSuppression(fingerprint),write:bytes=>tauriBridge.writeClipboardImage(bytes)});setReview(result.state);setError(result.copied?'':'SafeShare could not copy the exact verified image. Protect and verify again if the output changed.');if(result.copied&&current.protected)try{await activity.recordApproved({workspaceId:current.protected.workspaceId,policyVersion:current.protected.policyVersion,protectedFingerprint:current.protected.fingerprint},true,controlPlane)}catch{setMessage('Protected successfully. Workspace activity could not be updated.')}}
  async function dismiss(){const current=reviewRef.current;current.active?.bytes.fill(0);current.protected?.bytes.fill(0);const next=dismissReview(current);setReview(next);setError('');setProgress('');await tauriBridge.setReviewAvailable(!!next.active).catch(()=>undefined);if(!next.active)await tauriBridge.hideReviewWindow().catch(()=>undefined)}

  if(!controlPlane)return <main className="empty"><h1>SafeShare Agent</h1><p>Company authentication is not configured. Add the public Supabase URL and publishable key.</p></main>;
  if(!account)return <main className="auth-shell"><form className="agent-auth" onSubmit={signIn}><h1>SafeShare Agent</h1><h2>Company protection for screenshots</h2><label>Email<input type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/></label>{message&&<div className="error" role="alert">{message}</div>}<button disabled={busy}>{busy?'Signing in...':'Sign in'}</button><small>Accounts and company workspaces are managed through the SafeShare Console.</small></form></main>;
  if(!workspace){return <main className="company-shell"><h1>SafeShare Agent</h1><p>Signed in as {account.email}</p>{workspaces.length>1&&<section><h2>Select company workspace</h2>{workspaces.map(item=><button key={item.id} onClick={()=>void activateWorkspace(item)}>{item.name} - {item.role}</button>)}</section>}{message&&<div className="error" role="alert">{message}</div>}<button className="secondary" onClick={()=>void signOut()}>Sign Out</button></main>}
  const policy=review.active?.policy??effectivePolicy;
  const actionCounts=review.active?.findings.reduce<Record<string,number>>((counts,finding)=>{const action=actionForFinding(finding,review.active!.policy.policy);counts[action]=(counts[action]??0)+1;return counts},{})??{};
  const attentionCount=(actionCounts.BLOCK??0)+(actionCounts.PROTECT??0)+(actionCounts.WARN??0);
  return <main className="review-shell"><header><div><strong>SafeShare Agent</strong><span>{workspace.name} - {workspace.role}</span></div><div className="header-actions"><button className="secondary" onClick={()=>void syncPolicy(true)}>Refresh Policy</button><button className="secondary" onClick={()=>void signOut()}>Sign Out</button>{review.active&&<button className="secondary" onClick={()=>void dismiss()}>Dismiss Review</button>}</div></header><section className="company-status"><span>Workspace <strong>{workspace.name}</strong></span><span>Role <strong>{workspace.role}</strong></span><span>Team Policy <strong>{effectivePolicy?`v${effectivePolicy.version}`:'Unavailable'}</strong></span><span>Status <strong>{effectivePolicy?(effectivePolicy.source==='cache'?`Offline - using cached Team Policy v${effectivePolicy.version}`:'Protected by company policy'):'Team Policy unavailable'}</strong></span></section>{message&&<div className={effectivePolicy?'pending':'error'} role="status">{message}</div>}{!review.active?<section className="empty-review"><h1>Company protection is running</h1><p>{effectivePolicy?'Take a screenshot with Win+Shift+S.':'Sharing authorization is unavailable until Team Policy can be loaded.'}</p></section>:<><section className="intro"><p className="eyebrow">REVIEW BEFORE SHARING</p><h1>Review before sharing</h1><div className="profile"><span>Policy</span><strong>Team Policy v{policy?.version}</strong><small>{policy?.source==='cache'?'Offline cached policy':workspace.name}</small></div><p><strong>{attentionCount}</strong> finding{attentionCount===1?'':'s'} require attention.</p>{review.pending&&<div className="pending">A newer screenshot is waiting. Finish or dismiss this review first.</div>}</section><section className={protectedUrl?'images comparison':'images'}><figure><figcaption>Original</figcaption><img src={originalUrl} alt="Original screenshot"/></figure>{protectedUrl&&<figure><figcaption>Protected</figcaption><img src={protectedUrl} alt="Exact protected screenshot from fresh verification"/></figure>}</section><section className="summary" aria-label="Policy summary">{(['BLOCK','PROTECT','WARN','ALLOW'] as const).map(action=><div key={action}><strong>{actionCounts[action]??0}</strong><span>{action}</span></div>)}</section>{error&&<div className="error" role="alert">{error}</div>}{review.status==='protecting'?<section className="action"><h2>Protecting and verifying...</h2><p>{progress}</p></section>:review.status==='verification-failed'?<section className="action"><h2>Verification needs attention</h2><p>{review.verification?.unresolved.length??0} required finding{review.verification?.unresolved.length===1?'':'s'} remain. Approve & Copy is unavailable.</p><button disabled={!effectivePolicy} onClick={()=>void protectAndVerify()}>Protect & Verify again</button></section>:review.status==='verified'?<section className="action verified"><h2>Verified</h2><p>Awaiting your approval under Team Policy v{review.active.policy.version}</p><button disabled={!effectivePolicy} onClick={()=>void approveAndCopy()}>Approve & Copy</button></section>:review.status==='ready'?<section className="action ready"><h2>Ready to Share</h2><p>Protected image copied to clipboard.</p><button className="secondary" onClick={()=>void dismiss()}>{review.pending?'Review next screenshot':'Done'}</button></section>:<section className="action"><h2>Protect required findings</h2><p>Protection and verification use Team Policy v{review.active.policy.version}.</p><button disabled={!effectivePolicy} onClick={()=>void protectAndVerify()}>Protect & Verify</button></section>}</>}</main>;
}
