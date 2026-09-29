import type { SupabaseClient } from '@supabase/supabase-js';
import { isPolicy } from '../policy/profiles';
import type { Policy } from '../policy/types';

export type WorkspacePolicy={workspaceId:string;policy:Policy;version:number;updatedAt:string;updatedBy:string};

export async function loadWorkspacePolicy(client:SupabaseClient,workspaceId:string):Promise<WorkspacePolicy>{
  const{data,error}=await client.from('workspace_policies').select('workspace_id,policy,version,updated_at,updated_by').eq('workspace_id',workspaceId).single();
  if(error||!data)throw new Error('Team policy could not be loaded.');
  const row=data as Record<string,unknown>;
  if(!isPolicy(row.policy)||typeof row.version!=='number')throw new Error('Team policy is invalid.');
  return{workspaceId:String(row.workspace_id),policy:row.policy,version:row.version,updatedAt:String(row.updated_at),updatedBy:String(row.updated_by)};
}

export async function canManageWorkspacePolicy(client:SupabaseClient,workspaceId:string):Promise<boolean>{
  const response=await client.rpc('can_manage_workspace',{target_workspace:workspaceId});
  return response?.error==null&&response.data===true;
}

export async function saveWorkspacePolicy(client:SupabaseClient,workspaceId:string,policy:Policy,expectedVersion:number):Promise<WorkspacePolicy>{
  if(!isPolicy(policy))throw new Error('Team policy is invalid.');
  const{data,error}=await client.rpc('update_workspace_policy',{target_workspace:workspaceId,new_policy:policy,expected_version:expectedVersion});
  if(error||!data)throw new Error('Team policy could not be saved. Reload and try again.');
  const row=(Array.isArray(data)?data[0]:data) as Record<string,unknown>;
  if(!isPolicy(row.policy)||typeof row.version!=='number')throw new Error('Team policy response is invalid.');
  return{workspaceId:String(row.workspace_id),policy:row.policy,version:row.version,updatedAt:String(row.updated_at),updatedBy:String(row.updated_by)};
}