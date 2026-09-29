import type { SupabaseClient } from '@supabase/supabase-js';
import type { Workspace, WorkspaceMember, WorkspaceRole } from './types';

export function validWorkspaceName(value:string):boolean{return value.trim().length>=2&&value.trim().length<=80;}
export async function loadWorkspace(client:SupabaseClient,userId:string):Promise<Workspace|null>{
  const {data,error}=await client.from('workspace_members').select('role,workspaces!inner(id,name,created_by)').eq('user_id',userId).limit(1).maybeSingle();
  if(error)throw new Error('Workspace could not be loaded.');if(!data)return null;
  const raw=data as unknown as {role:WorkspaceRole;workspaces:{id:string;name:string;created_by:string}};
  return{id:raw.workspaces.id,name:raw.workspaces.name,createdBy:raw.workspaces.created_by,role:raw.role};
}
export async function createWorkspace(client:SupabaseClient,name:string):Promise<Workspace>{
  const clean=name.trim();if(!validWorkspaceName(clean))throw new Error('Workspace name must be between 2 and 80 characters.');
  const {data,error}=await client.rpc('create_workspace',{workspace_name:clean});if(error||!data)throw new Error('Workspace could not be created. Please try again.');
  const row=(Array.isArray(data)?data[0]:data) as {id:string;name:string;created_by:string};return{id:row.id,name:row.name,createdBy:row.created_by,role:'owner'};
}
export async function loadMembers(client:SupabaseClient,workspaceId:string):Promise<WorkspaceMember[]>{
  const {data,error}=await client.rpc('list_workspace_members',{target_workspace:workspaceId});
  if(error)throw new Error('Workspace members could not be loaded.');
  return(data??[]).map((row:unknown)=>{const raw=row as unknown as {user_id:string;display_name:string|null;email:string;role:WorkspaceRole};return{userId:raw.user_id,role:raw.role,email:raw.email,displayName:raw.display_name?.trim()||raw.email||'Workspace member'};});
}
