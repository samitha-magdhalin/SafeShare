import { fingerprintImage } from './deduplicate';
import { approveExact, canApprove, revokeApproval, type ReviewState } from './reviewState';

export type ApprovalWriter = {
  suppress(fingerprint: string): void;
  clearSuppression(fingerprint: string): void;
  write(bytes: Uint8Array): Promise<void>;
};

export async function approveAndWriteExact(state: ReviewState, writer: ApprovalWriter): Promise<{ state: ReviewState; copied: boolean }> {
  if (!canApprove(state) || !state.protected) return { state, copied: false };
  const fingerprint = await fingerprintImage(state.protected.bytes);
  if (fingerprint !== state.protected.fingerprint) return { state: revokeApproval(state), copied: false };
  writer.suppress(fingerprint);
  try {
    await writer.write(state.protected.bytes);
    return { state: approveExact(state, fingerprint), copied: true };
  } catch {
    writer.clearSuppression(fingerprint);
    return { state: revokeApproval(state), copied: false };
  }
}
