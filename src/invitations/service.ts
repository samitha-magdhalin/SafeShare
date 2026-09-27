import type { SupabaseClient } from '@supabase/supabase-js';
import type { AcceptedWorkspace,CreatedInvitation,InvitationFailure,InvitationRole,WorkspaceInvitation } from './types';
import { InvitationError } from './types';

const messages:Record<InvitationFailure,string>={
  invalid:'This invite link is invalid.',
  expired:'This invitation has expired.',
  revoked:'This invitation has been revoked.',
  accepted:'This invitation has already been accepted.',
  'wrong-account':'This invitation was issued to a different account.',
  unconfirmed:'Confirm your email before accepting this invitation.',
  duplicate:'A pending invitation already exists for this email.',
  'already-member':'This account is already a workspace member.',
  forbidden:'You do not have permission to manage this invitation.',
  network:'The invitation request could not be completed. Please try again.'
};
function failure(error:unknown):InvitationError{
  const detail=typeof error==='object'&&error&&'message' in error?String((error as {message:unknown}).message):'';
  const match:Record<string,InvitationFailure>={
    INVITE_INVALID:'invalid',INVITE_EXPIRED:'expired',INVITE_REVOKED:'revoked',INVITE_ACCEPTED:'accepted',
    INVITE_WRONG_ACCOUNT:'wrong-account',INVITE_EMAIL_UNCONFIRMED:'unconfirmed',INVITE_DUPLICATE:'duplicate',
    INVITE_ALREADY_MEMBER:'already-member',INVITE_NOT_AUTHORIZED:'forbidden',INVITE_AUTH_REQUIRED:'forbidden',
    INVITE_NOT_FOUND:'invalid',INVITE_NOT_PENDING:'accepted',INVITE_INVALID_EMAIL:'invalid',INVITE_INVALID_ROLE:'forbidden'
  };
  const code=Object.entries(match).find(([key])=>detail.includes(key))?.[1]??'network';
  return new InvitationError(code,messages[code]);
}
export async function createInvitation(client:SupabaseClient,workspaceId:string,email:string,role:InvitationRole,origin=window.location.origin):Promise<CreatedInvitation>{
  const normalized=email.trim().toLowerCase();
  const{data,error}=await client.rpc('invite_workspace_member',{target_workspace:workspaceId,invite_email:normalized,invite_role:role});
  if(error||!data)throw failure(error);
  const row=(Array.isArray(data)?data[0]:data) as {invitation_id:string;invite_token:string;expires_at:string};
  if(!row?.invitation_id||!row?.invite_token)throw new InvitationError('network',messages.network);
  return{id:row.invitation_id,token:row.invite_token,expiresAt:row.expires_at,link:origin+'/invite/'+row.invite_token};
}
export async function listInvitations(client:SupabaseClient,workspaceId:string):Promise<WorkspaceInvitation[]>{
  const{data,error}=await client.rpc('list_workspace_invitations',{target_workspace:workspaceId});
  if(error)throw failure(error);
  return(data??[]).map((row:unknown)=>{const value=row as {id:string;email:string;role:InvitationRole;status:WorkspaceInvitation['status'];created_at:string;expires_at:string};return{id:value.id,email:value.email,role:value.role,status:value.status,createdAt:value.created_at,expiresAt:value.expires_at};});
}
export async function revokeInvitation(client:SupabaseClient,id:string):Promise<void>{
  const{error}=await client.rpc('revoke_workspace_invitation',{target_invitation:id});if(error)throw failure(error);
}
export async function acceptInvitation(client:SupabaseClient,token:string):Promise<AcceptedWorkspace>{
  if(!/^[0-9a-f]{64}$/.test(token))throw new InvitationError('invalid',messages.invalid);
  const{data,error}=await client.rpc('accept_workspace_invitation',{invite_token:token});
  if(error||!data)throw failure(error);
  const row=(Array.isArray(data)?data[0]:data) as {id:string;name:string;created_by:string;role:AcceptedWorkspace['role']};
  if(!row?.id||!['owner','admin','member'].includes(row.role))throw new InvitationError('network',messages.network);
  return{id:row.id,name:row.name,createdBy:row.created_by,role:row.role};
}
