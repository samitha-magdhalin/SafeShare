import { describe, expect, it, vi } from 'vitest';
import { ClipboardScanController } from './controller';
import { fingerprintImage } from './deduplicate';
import type { NativeBridge } from './native';

function bridge(overrides: Partial<NativeBridge> = {}): NativeBridge {
  return {
    listenForImages: async () => () => undefined,
    listenForReview: async () => () => undefined,
    readClipboardImage: async () => null,
    writeClipboardImage: async () => undefined,
    notify: async () => undefined,
    setReviewAvailable: async () => undefined,
    hideReviewWindow: async () => undefined,
    ...overrides,
  };
}

describe('clipboard event filtering', () => {
  it('ignores a non-image event without notifying or creating a review', async () => {
    const notify = vi.fn(async () => undefined);
    const onAttention = vi.fn();
    const logger = vi.fn();
    await new ClipboardScanController(bridge({ notify }), onAttention, logger).enqueue();
    expect(notify).not.toHaveBeenCalled();
    expect(onAttention).not.toHaveBeenCalled();
    expect(logger).not.toHaveBeenCalled();
  });

  it('consumes the Agent own-write fingerprint without rescanning or notifying', async () => {
    const values = [1, 2, 3, 4];
    const notify = vi.fn(async () => undefined);
    const onAttention = vi.fn();
    const logger = vi.fn();
    const controller = new ClipboardScanController(bridge({ readClipboardImage: async () => values, notify }), onAttention, logger);
    controller.suppressOwnWrite(await fingerprintImage(Uint8Array.from(values)));
    await controller.enqueue();
    await controller.enqueue();
    expect(notify).not.toHaveBeenCalled();
    expect(onAttention).not.toHaveBeenCalled();
    expect(logger).not.toHaveBeenCalled();
  });
});
