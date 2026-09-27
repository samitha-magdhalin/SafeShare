import { useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import App from '../App';
import { AuthForm } from '../auth/AuthForm';
import { getSupabaseClient } from '../lib/supabase/client';
import { loadMembers, loadWorkspace } from '../workspace/service';
import type { Workspace, WorkspaceMember } from '../workspace/types';
import { WorkspaceOnboarding } from '../workspace/WorkspaceOnboarding';
import { loadWorkspacePolicy, type WorkspacePolicy } from '../workspace/policyService';
import { TeamPolicy } from '../workspace/TeamPolicy';
import { ActivityDashboard } from '../activity/ActivityDashboard';
import { recordActivity } from '../activity/service';
import type { SafeActivityInput } from '../activity/types';
import { InviteManager } from '../invitations/InviteManager';
import { InvitationAcceptance, InvitationAccess } from '../invitations/InvitationRoute';
type Page='scanner'|'batch'|'activity'|'team'|'settings';
const navigate=(path:string)=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'))};
function Landing(){return <main className="saas-landing"><section><div className="eyebrow">SAFESHARE</div><h1>Scan before you share.</h1><p>Protect sensitive information in screenshots before they leave your workflow.</p><div className="landing-actions"><button className="primary" onClick={()=>navigate('/login')}>Sign in</button><button className="secondary" onClick={()=>navigate('/signup')}>Create account</button></div><small>Screenshot analysis runs locally in your browser.</small></section></main>}
function TeamPage({client,workspace,teamPolicy,onPolicyChange,onActivity}:{client:SupabaseClient;workspace:Workspace;teamPolicy:WorkspacePolicy;onPolicyChange:(value:WorkspacePolicy)=>void;onActivity:(event:SafeActivityInput)=>Promise<void>}){const[members,setMembers]=useState<WorkspaceMember[]>([]),[error,setError]=useState('');useEffect(()=>{let active=true;loadMembers(client,workspace.id).then(v=>{if(active)setMembers(v)}).catch(()=>{if(active)setError('Workspace members could not be loaded.')});return()=>{active=false}},[client,workspace.id]);return <section className="shell-panel team-page"><div className="eyebrow">TEAM</div><h2>{workspace.name}</h2><p>Your role: <strong>{workspace.role}</strong></p>{error&&<div className="auth-message" role="alert">{error}</div>}<h3 className="subsection-title">Workspace Members</h3><div className="member-list">{members.map(m=><article key={m.userId}><span>{m.displayName}</span><strong>{m.role}</strong></article>)}</div><InviteManager client={client} workspace={workspace}/><TeamPolicy client={client} workspace={workspace} value={teamPolicy} onChange={onPolicyChange} onActivity={onActivity}/></section>}
function SettingsPage({session,workspace}:{session:Session;workspace:Workspace}){return <section className="shell-panel settings-page"><div className="eyebrow">SETTINGS</div><h2>Account and workspace</h2><dl className="settings-list"><div><dt>Account</dt><dd>{session.user.email}</dd></div><div><dt>Workspace</dt><dd>{workspace.name}</dd></div><div className="privacy-settings"><dt>Privacy &amp; Processing</dt><dd><section><strong>Browser-local processing</strong><span>Screenshot contents, OCR text and detected values are processed in your browser and are not intentionally uploaded to the SafeShare control plane.</span></section><section><strong>Workspace data</strong><span>Account, workspace, Team Policy and privacy-safe activity metadata may be stored.</span></section></dd></div></dl></section>}
export function Shell({client,session,workspace,teamPolicy,onPolicyChange}:{client:SupabaseClient;session:Session;workspace:Workspace;teamPolicy:WorkspacePolicy;onPolicyChange:(value:WorkspacePolicy)=>void}){
  const[page,setPage]=useState<Page>('scanner'),[scannerMode,setScannerMode]=useState<'single'|'batch'>('single'),[activityRefresh,setActivityRefresh]=useState(0);
  const activity=async(event:SafeActivityInput)=>{await recordActivity(client,workspace.id,event);setActivityRefresh(value=>value+1)};
  function open(item:Page){if(item==='scanner'||item==='batch')setScannerMode(item==='batch'?'batch':'single');setPage(item)}
  return <><header className="saas-shell-header"><div className="shell-brand"><strong>SafeShare</strong><small>Scan before you share.</small></div><span className="workspace-chip" title="Current workspace">{workspace.name}</span><nav aria-label="Workspace">{(['scanner','batch','activity','team','settings'] as Page[]).map(item=><button key={item} className={page===item?'active':''} onClick={()=>open(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}</nav><button className="shell-signout" onClick={()=>void client.auth.signOut()}>Sign out</button></header><div className="scanner-shell-view" hidden={page==='activity'||page==='team'||page==='settings'}><App initialMode={scannerMode} teamPolicy={teamPolicy.policy} teamPolicyVersion={teamPolicy.version} onActivity={activity}/></div>{page==='activity'&&<ActivityDashboard client={client} workspaceId={workspace.id} currentPolicyVersion={teamPolicy.version} refreshKey={activityRefresh}/>} {page==='team'&&<main className="shell-main"><TeamPage client={client} workspace={workspace} teamPolicy={teamPolicy} onPolicyChange={onPolicyChange} onActivity={activity}/></main>}{page==='settings'&&<main className="shell-main"><SettingsPage session={session} workspace={workspace}/></main>}</>;
}
export default function SaaSApp(){
  const client=getSupabaseClient();
  const [path,setPath]=useState(location.pathname);
  const inviteToken=path.match(/^\/invite\/([0-9a-f]{64})$/)?.[1]??null;
  const [session,setSession]=useState<Session|null>(null);
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [checking,setChecking]=useState(Boolean(client));
  const [workspaceLoading,setWorkspaceLoading]=useState(false);
  const [workspaceError,setWorkspaceError]=useState('');
  const [teamPolicy,setTeamPolicy]=useState<WorkspacePolicy|null>(null);
  const [policyLoading,setPolicyLoading]=useState(false),[policyError,setPolicyError]=useState('');
  useEffect(()=>{const update=()=>setPath(location.pathname);addEventListener('popstate',update);return()=>removeEventListener('popstate',update)},[]);
  useEffect(()=>{
    if(!client)return;
    let active=true;
    client.auth.getSession().then(({data})=>{if(active){setSession(data.session);setChecking(false)}}).catch(()=>{if(active)setChecking(false)});
    const {data}=client.auth.onAuthStateChange((_event,next)=>{if(active){setSession(next);setWorkspace(null)}});
    return()=>{active=false;data.subscription.unsubscribe()};
  },[client]);
  useEffect(()=>{
    if(!client||!session||inviteToken){if(!inviteToken)setWorkspace(null);return}
    let active=true;setWorkspaceLoading(true);setWorkspaceError('');
    loadWorkspace(client).then(value=>{if(active)setWorkspace(value)}).catch(()=>{if(active)setWorkspaceError('Workspace could not be loaded.')}).finally(()=>{if(active)setWorkspaceLoading(false)});
    return()=>{active=false};
  },[client,session,inviteToken]);
  useEffect(()=>{if(!client||!workspace){setTeamPolicy(null);return}let active=true;setPolicyLoading(true);setPolicyError('');loadWorkspacePolicy(client,workspace.id).then(value=>{if(active)setTeamPolicy(value)}).catch(()=>{if(active)setPolicyError('The required team policy could not be loaded. Sharing authorization is disabled.')}).finally(()=>{if(active)setPolicyLoading(false)});return()=>{active=false}},[client,workspace]);
  if(!client)return import.meta.env.DEV?<><div className="local-mode-banner">Local development mode: Supabase is not configured. Account and workspace features are disabled.</div><App/></>:<main className="state-page"><div className="auth-message" role="alert">SafeShare account configuration is unavailable.</div></main>;
  if(checking)return <main className="state-page">Checking session...</main>;
  if(path.startsWith('/invite/')&&!inviteToken)return <main className="state-page"><section className="auth-card"><h1>Invalid invite link</h1><div className="auth-message" role="alert">This invite link is invalid.</div></section></main>;
  if(!session){if(inviteToken)return <InvitationAccess client={client} token={inviteToken}/>;if(path==='/login')return <AuthForm client={client} mode="signin" onNavigate={navigate}/>;if(path==='/signup')return <AuthForm client={client} mode="signup" onNavigate={navigate}/>;return <Landing/>}
  if(inviteToken)return <InvitationAcceptance client={client} token={inviteToken} onAccepted={joined=>{setWorkspace(joined);navigate('/')}}/>;
  if(workspaceLoading)return <main className="state-page">Loading workspace...</main>;
  if(workspaceError)return <main className="state-page"><div className="auth-message" role="alert">{workspaceError}</div></main>;
  if(!workspace)return <WorkspaceOnboarding client={client} onCreated={setWorkspace}/>;
  if(policyLoading||(!teamPolicy&&!policyError))return <main className="state-page">Loading team policy...</main>;
  if(policyError||!teamPolicy)return <main className="state-page"><div className="auth-message" role="alert">{policyError}</div></main>;
  return <Shell client={client} session={session} workspace={workspace} teamPolicy={teamPolicy} onPolicyChange={setTeamPolicy}/>;
}
