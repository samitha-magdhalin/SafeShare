// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils/image', () => ({
  loadImage: vi.fn(async () => ({ width: 640, height: 360, close: vi.fn() })),
  protect: vi.fn(async () => new Blob(['protected'], { type: 'image/png' })),
}));
vi.mock('../detection/scan', () => ({
  scan: vi.fn().mockResolvedValueOnce({ findings: [{id:'password',type:'Password',category:'secret',severity:'CRITICAL',confidence:99,maskedPreview:'P...',source:'ocr',description:'credential',selected:true,box:{x:1,y:1,width:10,height:10}}], textFindings: [], metadataCount: 0 }).mockResolvedValue({ findings: [], textFindings: [], metadataCount: 0 }),
  logDevelopmentScanError: vi.fn(),
  ScanError: class ScanError extends Error {},
}));
vi.mock('../verification/verify', () => ({
  selectProtectable: (findings: unknown[]) => findings,
  verifyImage: () => ({ checks: [], unresolved: [], reviewCount: 0, ready: true }),
}));

import App from '../App';

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(item => item.textContent?.includes(label));
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

describe('complete image URL workflow in StrictMode', () => {
  it('keeps original and protected URLs valid through scan, verification, preview, and export', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const active = new Set<string>();
    const revoked: string[] = [];
    let next = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:https://example.test/${++next}`;
      active.add(url);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(url => {
      expect(active.has(url)).toBe(true);
      active.delete(url);
      revoked.push(url);
    });
    const imageSources: string[] = [];
    const imageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(function (this: HTMLImageElement, url: string) {
      if (url.startsWith('blob:')) {
        expect(active.has(url)).toBe(true);
        imageSources.push(url);
      }
      imageSrc.set!.call(this, url);
    });
    const setAttribute = Element.prototype.setAttribute;
    vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (this: Element, name: string, value: string) {
      if (this instanceof HTMLImageElement && name === 'src' && value.startsWith('blob:')) {
        expect(active.has(value)).toBe(true);
        imageSources.push(value);
      }
      setAttribute.call(this, name, value);
    });
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(active.has(this.href)).toBe(true);
      expect(this.download).toMatch(/\.png$/);
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const click = async (label: string) => { await act(async () => button(container, label).click()); };
    try {
      await act(async () => root.render(<StrictMode><App /></StrictMode>));
      const input = container.querySelector('input[type=file]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { configurable: true, value: [new File(['image'], 'sample.png', { type: 'image/png' })] });
      await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
      const original = container.querySelector('img')?.src;
      expect(original).toBe('blob:https://example.test/1');
      expect(active.has(original!)).toBe(true);
      await click('Protect & Verify');
      const protectedUrl = container.querySelector('img')?.src;
      expect(protectedUrl).toBe('blob:https://example.test/2');
      expect(active.has(protectedUrl!)).toBe(true);
      expect(active.has(original!)).toBe(true);
      expect(container.textContent).toContain('Awaiting review');
      await click('Approve & Copy');
      expect(container.textContent).toContain('Ready to Share');
      await click('Export protected image');
      expect(download).toHaveBeenCalledOnce();
      expect(active.has(protectedUrl!)).toBe(true);
      expect(imageSources).toContain(original);
      expect(imageSources).toContain(protectedUrl);
      expect(revoked).toEqual([]);
    } finally {
      await act(async () => root.unmount());
      expect(active.size).toBe(0);
      container.remove();
      vi.restoreAllMocks();
    }
  });
});
