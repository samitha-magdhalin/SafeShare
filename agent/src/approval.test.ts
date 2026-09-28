import { describe, expect, it, vi } from 'vitest';
import type { Finding } from '../../src/types';
import { approveAndWriteExact } from './approval';
import { fingerprintImage } from './deduplicate';
import { emptyReviewState, finishVerification, receiveReview } from './reviewState';

const finding: Finding = { id: 'test', type: 'Email', category: 'personal', severity: 'SENSITIVE', confidence: 99, maskedPreview: 'masked', source: 'ocr', description: 'test', selected: true };

async function verifiedState(ready: boolean) {
  const bytes = Uint8Array.from([5, 6, 7]);
  let state = receiveReview(emptyReviewState(), { fingerprint: 'original', bytes: Uint8Array.from([1]), findings: [finding] });
  state = finishVerification(state, { fingerprint: await fingerprintImage(bytes), bytes, findings: [finding] }, { checks: [{ finding, passed: ready }], unresolved: ready ? [] : [finding], reviewCount: 0, ready });
  return state;
}

describe('explicit exact-output clipboard approval', () => {
  it('does not write before successful verification', async () => {
    const write = vi.fn(async () => undefined);
    const result = await approveAndWriteExact(await verifiedState(false), { write, suppress: vi.fn(), clearSuppression: vi.fn() });
    expect(result.copied).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('writes only the exact verified bytes after explicit invocation', async () => {
    const state = await verifiedState(true);
    const write = vi.fn(async () => undefined);
    const suppress = vi.fn();
    const result = await approveAndWriteExact(state, { write, suppress, clearSuppression: vi.fn() });
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(state.protected?.bytes);
    expect(suppress).toHaveBeenCalledWith(state.protected?.fingerprint);
    expect(result.state.approvedFingerprint).toBe(state.protected?.fingerprint);
    expect(result.copied).toBe(true);
  });

  it('rejects changed protected bytes and does not write', async () => {
    const state = await verifiedState(true);
    state.protected!.bytes[0] = 99;
    const write = vi.fn(async () => undefined);
    const result = await approveAndWriteExact(state, { write, suppress: vi.fn(), clearSuppression: vi.fn() });
    expect(write).not.toHaveBeenCalled();
    expect(result.copied).toBe(false);
  });
});
