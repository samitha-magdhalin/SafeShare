import type { Finding } from '../../src/types';
import type { VerificationReport } from '../../src/verification/verify';

export type ReviewCandidate = { fingerprint: string; bytes: Uint8Array; findings: Finding[] };
export type ProtectedReview = { fingerprint: string; bytes: Uint8Array; findings: Finding[] };
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
  if (!state.active) return state;
  return { ...state, protected: output, verification, approvedFingerprint: null, status: verification.ready ? 'verified' : 'verification-failed' };
}

export function canApprove(state: ReviewState): boolean {
  return !!state.protected && state.verification?.ready === true && state.status === 'verified';
}

export function approveExact(state: ReviewState, fingerprint: string): ReviewState {
  if (!canApprove(state) || state.protected?.fingerprint !== fingerprint) return state;
  return { ...state, approvedFingerprint: fingerprint, status: 'ready' };
}

export function revokeApproval(state: ReviewState): ReviewState {
  return { ...state, approvedFingerprint: null, status: state.verification?.ready ? 'verified' : 'verification-failed' };
}

export function dismissReview(state: ReviewState): ReviewState {
  if (!state.pending) return emptyReviewState();
  return { ...emptyReviewState(), active: state.pending };
}
