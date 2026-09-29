import type { Policy } from '../../../src/policy/types';
import type { WorkspaceRole } from '../../../src/workspace/types';

export type AgentAccount={id:string;email:string};
export type AgentWorkspace={id:string;name:string;role:WorkspaceRole};
export type TeamPolicySnapshot={workspaceId:string;workspaceName:string;version:number;policy:Policy;fetchedAt:string;source:'server'|'cache'};
export type PolicyCacheRecord=Omit<TeamPolicySnapshot,'source'>;
export type AgentActivityEventType='SCREENSHOT_VERIFIED'|'SCREENSHOT_APPROVED';
export type AgentActivityInput={workspaceId:string;eventType:AgentActivityEventType;policyVersion:number};

export interface AgentControlPlane{
  signIn(email:string,password:string):Promise<AgentAccount>;
  signOut():Promise<void>;
  getSession():Promise<AgentAccount|null>;
  listAccessibleWorkspaces():Promise<AgentWorkspace[]>;
  getTeamPolicy(workspace:AgentWorkspace):Promise<TeamPolicySnapshot>;
  recordActivity(input:AgentActivityInput):Promise<void>;
}

export interface PolicyCacheStore{
  read():Promise<unknown|null>;
  write(value:PolicyCacheRecord):Promise<void>;
}

export class AuthenticationError extends Error{constructor(){super('AUTHENTICATION_FAILED');this.name='AuthenticationError';}}
export class ControlPlaneUnavailableError extends Error{constructor(){super('CONTROL_PLANE_UNAVAILABLE');this.name='ControlPlaneUnavailableError';}}
export class InvalidTeamPolicyError extends Error{constructor(){super('INVALID_TEAM_POLICY');this.name='InvalidTeamPolicyError';}}
