import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSupabaseConfig, type SupabasePublicConfig } from '../../../src/lib/supabase/config';
import { isPolicy } from '../../../src/policy/profiles';
import type { WorkspaceRole } from '../../../src/workspace/types';
import {
  AuthenticationError, ControlPlaneUnavailableError, InvalidTeamPolicyError,
  type AgentAccount, type AgentActivityInput, type AgentControlPlane, type AgentWorkspace, type TeamPolicySnapshot,
} from './types';

const roles=new Set<WorkspaceRole>(['owner','admin','member']);
function account(session:{user?:{id?:unknown;email?:unknown}}|null):AgentAccount|null{
  const id=session?.user?.id,email=session?.user?.email;
  return typeof id==='string'&&typeof email==='string'?{id,email}:null;
}

export function createAgentSupabaseClient(config:SupabasePublicConfig):SupabaseClient{
  return createClient(config.url,config.anonKey,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});
}
export function configuredAgentControlPlane(env:Record<string,string|boolean|undefined>=import.meta.env):AgentControlPlane|null{
  const config=readSupabaseConfig(env);return config?new SupabaseAgentControlPlane(createAgentSupabaseClient(config)):null;
}

export class SupabaseAgentControlPlane implements AgentControlPlane{
  constructor(private readonly client:SupabaseClient){}
  async signIn(email:string,password:string):Promise<AgentAccount>{
    const result=await this.client.auth.signInWithPassword({email:email.trim(),password});
    const signedIn=!result.error?account(result.data.session):null;
    if(!signedIn)throw new AuthenticationError();
    return signedIn;
  }
  async signOut():Promise<void>{await this.client.auth.signOut({scope:'local'});}
  async getSession():Promise<AgentAccount|null>{
    const {data,error}=await this.client.auth.getSession();
    if(error)return null;
    return account(data.session);
  }
  async listAccessibleWorkspaces():Promise<AgentWorkspace[]>{
    const {data:sessionData,error:sessionError}=await this.client.auth.getSession();
    const signedIn=!sessionError?account(sessionData.session):null;
    if(!signedIn)throw new AuthenticationError();
    const {data,error}=await this.client.from('workspace_members').select('role,workspaces!inner(id,name)').eq('user_id',signedIn.id);
    if(error)throw new ControlPlaneUnavailableError();
    if(!Array.isArray(data))throw new ControlPlaneUnavailableError();
    return data.map(row=>{
      const raw=row as unknown as {role:unknown;workspaces:{id?:unknown;name?:unknown}|Array<{id?:unknown;name?:unknown}>};
      const workspace=Array.isArray(raw.workspaces)?raw.workspaces[0]:raw.workspaces;
      if(!roles.has(raw.role as WorkspaceRole)||typeof workspace?.id!=='string'||typeof workspace.name!=='string')throw new ControlPlaneUnavailableError();
      return{id:workspace.id,name:workspace.name,role:raw.role as WorkspaceRole};
    });
  }
  async recordActivity(input:AgentActivityInput):Promise<void>{
    const keys=Object.keys(input);
    if(keys.length!==3||!keys.includes('workspaceId')||!keys.includes('eventType')||!keys.includes('policyVersion')||typeof input.workspaceId!=='string'||!['SCREENSHOT_VERIFIED','SCREENSHOT_APPROVED'].includes(input.eventType)||!Number.isSafeInteger(input.policyVersion)||input.policyVersion<=0)throw new ControlPlaneUnavailableError();
    const verified=input.eventType==='SCREENSHOT_VERIFIED';
    const {error}=await this.client.rpc('record_workspace_activity',{
      target_workspace:input.workspaceId,event_type:input.eventType,workflow_type:'SINGLE',sharing_context:'Team Policy',policy_version:input.policyVersion,
      total_findings:0,credential_count:0,email_count:0,phone_count:0,internal_ip_count:0,internal_url_count:0,public_url_count:0,qr_count:0,metadata_count:0,protected_count:0,warning_count:0,
      verification_status:verified?'VERIFIED':'APPROVED',review_status:verified?'PENDING':'APPROVED',
    });
    if(error)throw new ControlPlaneUnavailableError();
  }
  async getTeamPolicy(workspace:AgentWorkspace):Promise<TeamPolicySnapshot>{
    const {data,error}=await this.client.from('workspace_policies').select('workspace_id,policy,version,updated_at').eq('workspace_id',workspace.id).single();
    if(error||!data)throw new ControlPlaneUnavailableError();
    const row=data as Record<string,unknown>;
    if(row.workspace_id!==workspace.id||!isPolicy(row.policy)||typeof row.version!=='number'||!Number.isSafeInteger(row.version)||row.version<=0||typeof row.updated_at!=='string')throw new InvalidTeamPolicyError();
    return{workspaceId:workspace.id,workspaceName:workspace.name,version:row.version,policy:row.policy,fetchedAt:new Date().toISOString(),source:'server'};
  }
}