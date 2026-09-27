// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useObjectUrlCleanup } from '../utils/useObjectUrlCleanup';

function PreviewUrls({ original, output }: { original: string; output: string }) {
  useObjectUrlCleanup(original);
  useObjectUrlCleanup(output);
  return <img src={output || original} alt="preview" />;
}

describe('object URL lifecycle', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps each URL alive until its own consumer is replaced or unmounted', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const container = document.createElement('div');
    const root = createRoot(container);
    const original = 'blob:https://example.test/original';
    const protectedImage = 'blob:https://example.test/protected';
    const replacement = 'blob:https://example.test/replacement';
    const render = async (source: string, output: string) => {
      await act(async () => root.render(<PreviewUrls original={source} output={output} />));
    };

    await render(original, '');
    await render(original, protectedImage);
    expect(revoke).not.toHaveBeenCalled();
    await render(original, replacement);
    expect(revoke).toHaveBeenCalledExactlyOnceWith(protectedImage);
    await render(original, '');
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenLastCalledWith(replacement);
    expect(container.querySelector('img')?.src).toBe(original);
    await act(async () => root.unmount());
    expect(revoke).toHaveBeenCalledTimes(3);
    expect(revoke).toHaveBeenLastCalledWith(original);
  });
});
