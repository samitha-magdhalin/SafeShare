import { describe, expect, it, vi } from 'vitest';
import type { Finding } from '../../src/types';
import { PROFILES } from '../../src/policy/profiles';
import { approveAndWriteExact } from './approval';
import { fingerprintImage } from './deduplicate';
import { emptyReviewState, finishVerification, receiveReview } from './reviewState';
import type { TeamPolicySnapshot } from './controlPlane/types';

const finding: Finding = { id: 'test', type: 'Email', category: 'personal', severity: 'SENSITIVE', confidence: 99, maskedPreview: 'masked', source: 'ocr', description: 'test', selected: true };
const policy:TeamPolicySnapshot={workspaceId:'workspace-a',workspaceName:'Workspace A',version:4,policy:PROFILES.client.policy,fetchedAt:'2026-09-28T00:00:00.000Z',source:'server'};
async function verifiedState(ready: boolean) {const bytes=Uint8Array.from([5,6,7]);let state=receiveReview(emptyReviewState(),{fingerprint:'original',bytes:Uint8Array.from([1]),findings:[finding],policy});state=finishVerification(state,{fingerprint:await fingerprintImage(bytes),bytes,findings:[finding],workspaceId:policy.workspaceId,policyVersion:policy.version},{checks:[{finding,passed:ready}],unresolved:ready?[]:[finding],reviewCount:0,ready});return state;}
describe('explicit exact-output clipboard approval',()=>{
  it('does not write before successful verification',async()=>{const write=vi.fn(async()=>undefined),result=await approveAndWriteExact(await verifiedState(false),{write,suppress:vi.fn(),clearSuppression:vi.fn()});expect(result.copied).toBe(false);expect(write).not.toHaveBeenCalled()});
  it('writes only exact policy-bound verified bytes after explicit invocation',async()=>{const state=await verifiedState(true),write=vi.fn(async()=>undefined),suppress=vi.fn(),result=await approveAndWriteExact(state,{write,suppress,clearSuppression:vi.fn()});expect(write).toHaveBeenCalledWith(state.protected?.bytes);expect(suppress).toHaveBeenCalledWith(state.protected?.fingerprint);expect(result.state.approvedFingerprint).toBe(state.protected?.fingerprint);expect(result.copied).toBe(true)});
  it('rejects changed protected bytes and does not write',async()=>{const state=await verifiedState(true);state.protected!.bytes[0]=99;const write=vi.fn(async()=>undefined),result=await approveAndWriteExact(state,{write,suppress:vi.fn(),clearSuppression:vi.fn()});expect(write).not.toHaveBeenCalled();expect(result.copied).toBe(false)});
});