import type { AgentWorkspace } from './types';
export type WorkspaceResolution={kind:'none'}|{kind:'selected';workspace:AgentWorkspace}|{kind:'choose';workspaces:AgentWorkspace[]};
export function resolveWorkspaceSelection(workspaces:AgentWorkspace[]):WorkspaceResolution{
  if(workspaces.length===0)return{kind:'none'};
  if(workspaces.length===1)return{kind:'selected',workspace:workspaces[0]};
  return{kind:'choose',workspaces};
}