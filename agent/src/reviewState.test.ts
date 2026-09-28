import { describe, expect, it } from 'vitest';
import type { Finding } from '../../src/types';
import type { VerificationReport } from '../../src/verification/verify';
import {
  approveExact, beginProtection, canApprove, dismissReview, emptyReviewState,
  finishVerification, receiveReview, revokeApproval, type ReviewCandidate,
} from './reviewState';

const finding: Finding = { id: 'safe-test', type: 'Email', category: 'personal', severity: 'SENSITIVE', confidence: 99, maskedPreview: 'masked', source: 'ocr', description: 'safe test', selected: true, fingerprint: 'finding' };
const candidate = (fingerprint: string): ReviewCandidate => ({ fingerprint, bytes: Uint8Array.from([1, 2, 3]), findings: [finding] });
const passed: VerificationReport = { checks: [{ finding, passed: true }], unresolved: [], reviewCount: 0, ready: true };
const failed: VerificationReport = { checks: [{ finding, passed: false }], unresolved: [finding], reviewCount: 0, ready: false };

describe('M2 volatile review lifecycle', () => {
  it('creates review state for an attention-required candidate', () => {
    const state = receiveReview(emptyReviewState(), candidate('original'));
    expect(state.active?.fingerprint).toBe('original');
    expect(state.protected).toBeNull();
  });

  it('protection invalidates previous output, verification, and approval', () => {
    let state = receiveReview(emptyReviewState(), candidate('original'));
    state = finishVerification(state, { fingerprint: 'protected', bytes: Uint8Array.from([4]), findings: [finding] }, passed);
    state = approveExact(state, 'protected');
    state = beginProtection(state);
    expect(state.protected).toBeNull();
    expect(state.verification).toBeNull();
    expect(state.approvedFingerprint).toBeNull();
  });

  it('binds verification and approval to the protected output', () => {
    let state = receiveReview(emptyReviewState(), candidate('original'));
    state = finishVerification(state, { fingerprint: 'protected', bytes: Uint8Array.from([4]), findings: [finding] }, passed);
    expect(canApprove(state)).toBe(true);
    expect(approveExact(state, 'different').approvedFingerprint).toBeNull();
    state = approveExact(state, 'protected');
    expect(state.approvedFingerprint).toBe('protected');
  });

  it('blocks approval when fresh verification fails', () => {
    let state = receiveReview(emptyReviewState(), candidate('original'));
    state = finishVerification(state, { fingerprint: 'protected', bytes: Uint8Array.from([4]), findings: [finding] }, failed);
    expect(canApprove(state)).toBe(false);
    expect(approveExact(state, 'protected').approvedFingerprint).toBeNull();
  });

  it('revokes approval without changing the protected bytes', () => {
    let state = receiveReview(emptyReviewState(), candidate('original'));
    state = finishVerification(state, { fingerprint: 'protected', bytes: Uint8Array.from([4]), findings: [finding] }, passed);
    state = revokeApproval(approveExact(state, 'protected'));
    expect(state.approvedFingerprint).toBeNull();
    expect(state.protected?.fingerprint).toBe('protected');
  });

  it('preserves active review and keeps only the newest pending screenshot', () => {
    let state = receiveReview(emptyReviewState(), candidate('first'));
    state = receiveReview(state, candidate('second'));
    state = receiveReview(state, candidate('third'));
    expect(state.active?.fingerprint).toBe('first');
    expect(state.pending?.fingerprint).toBe('third');
    state = dismissReview(state);
    expect(state.active?.fingerprint).toBe('third');
    expect(state.protected).toBeNull();
    expect(state.approvedFingerprint).toBeNull();
  });

  it('promotes a pending screenshot with only its own findings and no stale authorization state', () => {
    const findingA = { ...finding, id: 'a', fingerprint: 'finding-a', box: { x: 10, y: 10, width: 20, height: 10 } };
    const findingB = { ...finding, id: 'b', fingerprint: 'finding-b', box: { x: 210, y: 40, width: 80, height: 20 } };
    const screenshotA: ReviewCandidate = { fingerprint: 'screenshot-a', bytes: Uint8Array.from([1, 1]), findings: [findingA] };
    const screenshotB: ReviewCandidate = { fingerprint: 'screenshot-b', bytes: Uint8Array.from([2, 2]), findings: [findingB] };
    let state = receiveReview(emptyReviewState(), screenshotA);
    state = receiveReview(state, screenshotB);
    state = finishVerification(state, { fingerprint: 'protected-a', bytes: Uint8Array.from([3]), findings: [findingA] }, passed);
    state = approveExact(state, 'protected-a');

    state = dismissReview(state);

    expect(state.active).toBe(screenshotB);
    expect(state.active?.findings).toEqual([findingB]);
    expect(state.active?.bytes).toEqual(Uint8Array.from([2, 2]));
    expect(state.pending).toBeNull();
    expect(state.protected).toBeNull();
    expect(state.verification).toBeNull();
    expect(state.approvedFingerprint).toBeNull();
    expect(state.status).toBe('review');
  });
  it('dismisses without invoking any clipboard operation', () => {
    const state = dismissReview(receiveReview(emptyReviewState(), candidate('original')));
    expect(state.active).toBeNull();
    expect(state.protected).toBeNull();
  });
});
