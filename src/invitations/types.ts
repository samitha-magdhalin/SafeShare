import type { Workspace } from '../workspace/types';

export type InvitationRole='admin'|'member';
export type InvitationStatus='pending'|'accepted'|'revoked'|'expired';
export type WorkspaceInvitation={
  id:string;
  email:string;
  role:InvitationRole;
  status:InvitationStatus;
  createdAt:string;
  expiresAt:string;
};
export type CreatedInvitation={id:string;token:string;expiresAt:string;link:string};
export type InvitationFailure='invalid'|'expired'|'revoked'|'accepted'|'wrong-account'|'unconfirmed'|'duplicate'|'already-member'|'forbidden'|'network';

export class InvitationError extends Error{
  constructor(public code:InvitationFailure,message:string){super(message);this.name='InvitationError';}
}
export type AcceptedWorkspace=Workspace;
