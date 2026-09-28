import { useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { actionForFinding } from '../../src/policy/evaluatePolicy';
import { scan } from '../../src/detection/scan';
import { loadImage, protect } from '../../src/utils/image';
import { verifyImage } from '../../src/verification/verify';
import { ClipboardScanController } from './controller';
import { fingerprintImage } from './deduplicate';
import { approveAndWriteExact } from './approval';
import { tauriBridge } from './native';
import { M1_LOCAL_POLICY } from './policy';
import {
  beginProtection, dismissReview, emptyReviewState,
  finishVerification, receiveReview, revokeApproval, type ReviewState,
} from './reviewState';
import './style.css';

function imageBlob(bytes: Uint8Array): Blob { return new Blob([new Uint8Array(bytes).buffer], { type: 'image/png' }); }
function useImageUrl(bytes?: Uint8Array): string {
  const url = useMemo(() => bytes ? URL.createObjectURL(imageBlob(bytes)) : '', [bytes]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

export default function App() {
  const [review, setReview] = useState<ReviewState>(emptyReviewState);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const reviewRef = useRef(review);
  const controllerRef = useRef<ClipboardScanController | null>(null);
  reviewRef.current = review;

  useEffect(() => {
    const controller = new ClipboardScanController(tauriBridge, candidate => setReview(current => receiveReview(current, candidate)));
    controllerRef.current = controller;
    let disposed = false;
    let stopImages: (() => void) | undefined;
    let stopReview: (() => void) | undefined;
    void controller.start().then(stop => { if (disposed) stop(); else stopImages = stop; });
    void tauriBridge.listenForReview(() => setError('')).then(stop => { if (disposed) stop(); else stopReview = stop; });
    let stopClose: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(event => { event.preventDefault(); void getCurrentWindow().hide(); }).then(stop => { if (disposed) stop(); else stopClose = stop; });
    return () => { disposed = true; stopImages?.(); stopReview?.(); stopClose?.(); controllerRef.current = null; };
  }, []);

  const originalUrl = useImageUrl(review.active?.bytes);
  const protectedUrl = useImageUrl(review.protected?.bytes);
  const actionCounts = review.active?.findings.reduce<Record<string, number>>((counts, finding) => {
    const action = actionForFinding(finding, M1_LOCAL_POLICY);
    counts[action] = (counts[action] ?? 0) + 1;
    return counts;
  }, {}) ?? {};
  const attentionCount = (actionCounts.BLOCK ?? 0) + (actionCounts.PROTECT ?? 0) + (actionCounts.WARN ?? 0);

  async function protectAndVerify() {
    const active = reviewRef.current.active;
    if (!active) return;
    setError(''); setProgress('Creating protected image…'); setReview(current => beginProtection(current));
    try {
      const image = await loadImage(imageBlob(active.bytes));
      let protectedBlob: Blob;
      try { protectedBlob = await protect(image, active.findings); } finally { image.close(); }
      setProgress('Running a fresh verification scan…');
      const freshResult = await scan(protectedBlob, setProgress);
      const verification = verifyImage(active.findings, freshResult.findings, M1_LOCAL_POLICY);
      const bytes = new Uint8Array(await protectedBlob.arrayBuffer());
      const fingerprint = await fingerprintImage(bytes);
      if (reviewRef.current.active?.fingerprint !== active.fingerprint) { bytes.fill(0); return; }
      setReview(current => finishVerification(current, { fingerprint, bytes, findings: active.findings }, verification));
      setProgress('');
    } catch {
      setReview(current => ({ ...revokeApproval(current), protected: null, verification: null, status: 'review' }));
      setProgress(''); setError('Protection or verification could not finish. Please retry.');
    }
  }

  async function approveAndCopy() {
    const current = reviewRef.current;
    const result = await approveAndWriteExact(current, {
      suppress: fingerprint => controllerRef.current?.suppressOwnWrite(fingerprint),
      clearSuppression: fingerprint => controllerRef.current?.clearOwnWriteSuppression(fingerprint),
      write: bytes => tauriBridge.writeClipboardImage(bytes),
    });
    setReview(result.state);
    setError(result.copied ? '' : 'SafeShare could not copy the exact verified image. Protect and verify again if the output changed.');
  }

  async function dismiss() {
    const current = reviewRef.current;
    current.active?.bytes.fill(0);
    current.protected?.bytes.fill(0);
    const next = dismissReview(current);
    setReview(next); setError(''); setProgress('');
    await tauriBridge.setReviewAvailable(!!next.active).catch(() => undefined);
    if (!next.active) await tauriBridge.hideReviewWindow().catch(() => undefined);
  }

  if (!review.active) return <main className="empty"><h1>SafeShare</h1><p>No screenshot is waiting for review.</p></main>;

  return <main className="review-shell">
    <header><div><strong>SafeShare</strong><span>Local screenshot protection</span></div><button className="secondary" onClick={() => void dismiss()}>Dismiss Review</button></header>
    <section className="intro"><p className="eyebrow">REVIEW BEFORE SHARING</p><h1>Review before sharing</h1><div className="profile"><span>Profile</span><strong>Client Sharing</strong><small>Local M2 policy</small></div><p><strong>{attentionCount}</strong> finding{attentionCount === 1 ? '' : 's'} require attention.</p>{review.pending && <div className="pending">A newer screenshot is waiting. Finish or dismiss this review first.</div>}</section>
    <section className={protectedUrl ? 'images comparison' : 'images'}>
      <figure><figcaption>Original</figcaption><img src={originalUrl} alt="Original screenshot" /></figure>
      {protectedUrl && <figure><figcaption>Protected</figcaption><img src={protectedUrl} alt="Exact protected screenshot from fresh verification" /></figure>}
    </section>
    <section className="summary" aria-label="Policy summary">
      {(['BLOCK', 'PROTECT', 'WARN', 'ALLOW'] as const).map(action => <div key={action}><strong>{actionCounts[action] ?? 0}</strong><span>{action}</span></div>)}
    </section>
    {error && <div className="error" role="alert">{error}</div>}
    {review.status === 'protecting' ? <section className="action"><h2>Protecting and verifying…</h2><p>{progress}</p></section> :
      review.status === 'verification-failed' ? <section className="action"><h2>Verification needs attention</h2><p>{review.verification?.unresolved.length ?? 0} required finding{review.verification?.unresolved.length === 1 ? '' : 's'} remain. Approve & Copy is unavailable.</p><button onClick={() => void protectAndVerify()}>Protect & Verify again</button></section> :
      review.status === 'verified' ? <section className="action verified"><h2>Verified</h2><p>Awaiting your approval</p>{!!review.verification?.reviewCount && <small>{review.verification.reviewCount} warning{review.verification.reviewCount === 1 ? '' : 's'} remain for human review.</small>}<button onClick={() => void approveAndCopy()}>Approve & Copy</button></section> :
      review.status === 'ready' ? <section className="action ready"><h2>Ready to Share</h2><p>Protected image copied to clipboard.</p><button className="secondary" onClick={() => void dismiss()}>{review.pending ? 'Review next screenshot' : 'Done'}</button></section> :
      <section className="action"><h2>Protect required findings</h2><p>Protection covers BLOCK and PROTECT findings. WARN items remain for your review.</p><button onClick={() => void protectAndVerify()}>Protect & Verify</button></section>}
  </main>;
}
