import { fingerprintImage, fingerprintVisualImage } from './deduplicate';
import { approveExact, canApprove, revokeApproval, type ReviewState } from './reviewState';

export type ApprovalWriter = {
  suppress(fingerprint: string): void;
  clearSuppression(fingerprint: string): void;
  write(bytes: Uint8Array): Promise<void>;
};

export async function approveAndWriteExact(state: ReviewState, writer: ApprovalWriter, visualFingerprint:(bytes:Uint8Array)=>Promise<string>=fingerprintVisualImage): Promise<{ state: ReviewState; copied: boolean }> {
  if (!canApprove(state) || !state.protected) return { state, copied: false };
  const fingerprint = await fingerprintImage(state.protected.bytes);
  if (fingerprint !== state.protected.fingerprint) return { state: revokeApproval(state), copied: false };
  let clipboardFingerprint:string;
  try{clipboardFingerprint=await visualFingerprint(state.protected.bytes)}catch{return {state:revokeApproval(state),copied:false}}
  writer.suppress(clipboardFingerprint);
  try {
    await writer.write(state.protected.bytes);
    return { state: approveExact(state, fingerprint), copied: true };
  } catch {
    writer.clearSuppression(clipboardFingerprint);
    return { state: revokeApproval(state), copied: false };
  }
}
