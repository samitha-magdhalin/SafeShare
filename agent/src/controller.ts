import { scan } from '../../src/detection/scan';
import { applyPolicy } from '../../src/policy/evaluatePolicy';
import { ImageEventDeduplicator, fingerprintImage } from './deduplicate';
import { type AgentLogger, developmentLogger } from './privacyLog';
import { M1_LOCAL_POLICY, requiresAttention } from './policy';
import type { NativeBridge } from './native';
import type { ReviewCandidate } from './reviewState';

export class ClipboardScanController {
  private readonly deduplicator = new ImageEventDeduplicator();
  private readonly suppressedWrites = new Set<string>();
  private scanning = false;
  private pending = false;

  constructor(
    private readonly bridge: NativeBridge,
    private readonly onAttention: (candidate: ReviewCandidate) => void = () => undefined,
    private readonly logger: AgentLogger = developmentLogger,
  ) {}

  async start(): Promise<() => void> {
    return this.bridge.listenForImages(() => { void this.enqueue(); });
  }

  suppressOwnWrite(fingerprint: string): void { this.suppressedWrites.add(fingerprint); }
  clearOwnWriteSuppression(fingerprint: string): void { this.suppressedWrites.delete(fingerprint); }

  async enqueue(): Promise<void> {
    if (this.scanning) { this.pending = true; return; }
    this.scanning = true;
    try {
      do {
        this.pending = false;
        await this.processCurrentClipboard();
      } while (this.pending);
    } finally { this.scanning = false; }
  }

  private async processCurrentClipboard(): Promise<void> {
    const generation = this.deduplicator.beginEvent();
    let values: number[] | null;
    try { values = await this.bridge.readClipboardImage(); }
    catch { this.logger({ event: 'scan failed', errorCategory: 'clipboard-read' }); return; }
    if (!values?.length) return;

    const bytes = Uint8Array.from(values);
    const fingerprint = await fingerprintImage(bytes);
    if (this.suppressedWrites.delete(fingerprint)) { this.deduplicator.accept(fingerprint); bytes.fill(0); return; }
    if (!this.deduplicator.isLatest(generation) || !this.deduplicator.accept(fingerprint)) { bytes.fill(0); return; }

    this.logger({ event: 'clipboard image detected' });
    this.logger({ event: 'scan started' });
    const startedAt = performance.now();
    try {
      const result = await scan(new Blob([bytes], { type: 'image/png' }), () => undefined);
      const attentionRequired = requiresAttention(result.findings);
      this.logger({ event: 'scan completed', findingCount: result.findings.length, attentionRequired, durationMs: Math.round(performance.now() - startedAt) });
      if (attentionRequired) {
        const candidate = { fingerprint, bytes: bytes.slice(), findings: applyPolicy(result.findings, M1_LOCAL_POLICY) };
        this.onAttention(candidate);
        await this.bridge.setReviewAvailable(true);
        await this.bridge.notify();
        this.logger({ event: 'notification displayed' });
      }
    } catch (error) {
      const errorCategory = error instanceof Error && error.name === 'ScanError' ? error.message : 'scan-component';
      this.logger({ event: 'scan failed', errorCategory });
    } finally { bytes.fill(0); }
  }
}
