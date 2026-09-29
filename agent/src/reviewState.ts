import type { Finding } from '../../src/types';
import { applyPolicy } from '../../src/policy/evaluatePolicy';
import type { VerificationReport } from '../../src/verification/verify';
import type { TeamPolicySnapshot } from './controlPlane/types';

export type ReviewCandidate = { fingerprint: string; bytes: Uint8Array; findings: Finding[]; policy: TeamPolicySnapshot };
export type ProtectedReview = { fingerprint: string; bytes: Uint8Array; findings: Finding[]; workspaceId: string; policyVersion: number };
export type ReviewStatus = 'review' | 'protecting' | 'verification-failed' | 'verified' | 'ready';
export type ReviewState = {
  active: ReviewCandidate | null;
  pending: ReviewCandidate | null;
  protected: ProtectedReview | null;
  verification: VerificationReport | null;
  approvedFingerprint: string | null;
  status: ReviewStatus;
};

export const emptyReviewState = (): ReviewState => ({ active: null, pending: null, protected: null, verification: null, approvedFingerprint: null, status: 'review' });
const samePolicy=(left:TeamPolicySnapshot,right:TeamPolicySnapshot)=>left.workspaceId===right.workspaceId&&left.version===right.version&&JSON.stringify(left.policy)===JSON.stringify(right.policy);

export function receiveReview(state: ReviewState, candidate: ReviewCandidate): ReviewState {
  if (state.active?.fingerprint === candidate.fingerprint || state.pending?.fingerprint === candidate.fingerprint) return state;
  if (!state.active) return { ...emptyReviewState(), active: candidate };
  return { ...state, pending: candidate };
}
export function beginProtection(state: ReviewState): ReviewState {
  if (!state.active) return state;
  return { ...state, protected: null, verification: null, approvedFingerprint: null, status: 'protecting' };
}
export function finishVerification(state: ReviewState, output: ProtectedReview, verification: VerificationReport): ReviewState {
  if (!state.active || output.workspaceId!==state.active.policy.workspaceId || output.policyVersion!==state.active.policy.version) return state;
  return { ...state, protected: output, verification, approvedFingerprint: null, status: verification.ready ? 'verified' : 'verification-failed' };
}
export function canApprove(state: ReviewState): boolean {
  return !!state.active&&!!state.protected&&state.verification?.ready===true&&state.status==='verified'&&state.protected.workspaceId===state.active.policy.workspaceId&&state.protected.policyVersion===state.active.policy.version;
}
export function approveExact(state: ReviewState, fingerprint: string): ReviewState {
  if (!canApprove(state) || state.protected?.fingerprint !== fingerprint) return state;
  return { ...state, approvedFingerprint: fingerprint, status: 'ready' };
}
export function revokeApproval(state: ReviewState): ReviewState {
  return { ...state, approvedFingerprint: null, status: state.verification?.ready ? 'verified' : 'verification-failed' };
}
export function applyTeamPolicy(state:ReviewState,policy:TeamPolicySnapshot):ReviewState{
  const update=(candidate:ReviewCandidate|null)=>candidate?{...candidate,findings:applyPolicy(candidate.findings,policy.policy),policy}:null;
  if((state.active&&!samePolicy(state.active.policy,policy))||(state.pending&&!samePolicy(state.pending.policy,policy))){
    state.protected?.bytes.fill(0);
    return{...emptyReviewState(),active:update(state.active),pending:update(state.pending)};
  }
  return state;
}
export function invalidateAuthorization(state:ReviewState):ReviewState{
  state.protected?.bytes.fill(0);
  return{...state,protected:null,verification:null,approvedFingerprint:null,status:'review'};
}export function clearReviewForSignOut(state:ReviewState):ReviewState{
  state.active?.bytes.fill(0);state.pending?.bytes.fill(0);state.protected?.bytes.fill(0);
  return emptyReviewState();
}export function dismissReview(state: ReviewState): ReviewState {
  if (!state.pending) return emptyReviewState();
  return { ...emptyReviewState(), active: state.pending };
}