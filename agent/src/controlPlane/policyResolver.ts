import { isPolicy } from '../../../src/policy/profiles';
import type { AgentWorkspace, PolicyCacheRecord, PolicyCacheStore, TeamPolicySnapshot } from './types';
import { ControlPlaneUnavailableError, InvalidTeamPolicyError, type AgentControlPlane } from './types';

export function validPolicyCache(value:unknown):value is PolicyCacheRecord{
  if(!value||typeof value!=='object')return false;
  const raw=value as Record<string,unknown>;
  return typeof raw.workspaceId==='string'&&raw.workspaceId.length>0&&typeof raw.workspaceName==='string'&&raw.workspaceName.length>0&&typeof raw.version==='number'&&Number.isSafeInteger(raw.version)&&raw.version>0&&isPolicy(raw.policy)&&typeof raw.fetchedAt==='string'&&!Number.isNaN(Date.parse(raw.fetchedAt));
}
export async function resolveTeamPolicy(controlPlane:AgentControlPlane,cache:PolicyCacheStore,workspace:AgentWorkspace):Promise<TeamPolicySnapshot>{
  try{
    const current=await controlPlane.getTeamPolicy(workspace);
    await cache.write({workspaceId:current.workspaceId,workspaceName:current.workspaceName,version:current.version,policy:current.policy,fetchedAt:current.fetchedAt}).catch(()=>undefined);
    return current;
  }catch(error){
    if(error instanceof InvalidTeamPolicyError)throw error;
    if(!(error instanceof ControlPlaneUnavailableError))throw new ControlPlaneUnavailableError();
    const cached=await cache.read().catch(()=>null);
    if(!validPolicyCache(cached)||cached.workspaceId!==workspace.id)throw new ControlPlaneUnavailableError();
    return{...cached,source:'cache'};
  }
}