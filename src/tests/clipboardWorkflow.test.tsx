// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Finding } from '../types';

const controls = vi.hoisted(() => ({
  scan: vi.fn(),
  verify: vi.fn(),
  protectedBlob: new Blob(['safe-image'], { type: 'image/png' }),
}));

vi.mock('../utils/image', () => ({
  loadImage: vi.fn(async () => ({ width: 640, height: 360, close: vi.fn() })),
  protect: vi.fn(async () => controls.protectedBlob),
}));
vi.mock('../detection/scan', () => ({
  scan: controls.scan,
  logDevelopmentScanError: vi.fn(),
  ScanError: class ScanError extends Error {},
}));
vi.mock('../verification/verify', () => ({
  selectProtectable: (findings: Finding[]) => findings.map(finding => ({ ...finding, selected: finding.severity !== 'INFO' })),
  verifyImage: controls.verify,
}));

import App from '../App';

const sensitive: Finding = { id: 'text-0', type: 'Password', category: 'secret', severity: 'CRITICAL', confidence: 99, maskedPreview: 'P•••d', source: 'ocr', description: 'credential', selected: true };

class TestClipboardItem {
  constructor(public readonly data: Record<string, Blob>) {}
}

type Mounted = { container: HTMLDivElement; root: Root };
const mounts: Mounted[] = [];

function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(item => item.textContent?.includes(label));
}
async function mount(): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounts.push({ container, root });
  await act(async () => root.render(<StrictMode><App /></StrictMode>));
  return { container, root };
}
async function paste(file?: File, target: EventTarget = window) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { items: file ? [{ kind: 'file', type: file.type, getAsFile: () => file }] : [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] } });
  await act(async () => target.dispatchEvent(event));
  return event;
}
async function click(container: HTMLElement, label: string) {
  const found = button(container, label);
  if (!found) throw new Error(`Missing button: ${label}`);
  await act(async () => found.click());
}
async function readyWorkflow(container: HTMLElement) {
  await paste(new File(['original'], 'clipboard.png', { type: 'image/png' }));
    await click(container, 'Protect & Verify');
  if (!button(container, 'Approve & Copy')?.disabled) await click(container, 'Approve & Copy');
}

describe('clipboard image workflow', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    controls.scan.mockReset().mockResolvedValue({ findings: [sensitive], textFindings: [sensitive], metadataCount: 0 });
    controls.verify.mockReset().mockReturnValue({ checks: [{ finding: sensitive, passed: true }], unresolved: [], reviewCount: 0, ready: true });
    let id = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:https://example.test/${++id}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    Object.defineProperty(globalThis, 'ClipboardItem', { configurable: true, value: TestClipboardItem });
  });
  afterEach(async () => {
    for (const mounted of mounts.splice(0)) await act(async () => mounted.root.unmount());
    document.body.textContent = '';
    vi.restoreAllMocks();
  });

  it('loads a pasted image and scans it through the normal pipeline', async () => {
    const { container } = await mount();
    const image = new File(['clipboard-image'], '', { type: 'image/png' });
    const event = await paste(image);
    expect(event.defaultPrevented).toBe(true);
    expect(container.querySelector('img')?.src).toBe('blob:https://example.test/1');
    expect(container.textContent).toContain('pasted-screenshot.png');
        expect(controls.scan).toHaveBeenCalledOnce();
    expect(controls.scan.mock.calls[0][0]).toBeInstanceOf(File);
    expect((controls.scan.mock.calls[0][0] as File).name).toBe('pasted-screenshot.png');
  });

  it('downloads a current single privacy report and revokes the previous report URL on replacement',async()=>{controls.scan.mockResolvedValueOnce({findings:[sensitive],textFindings:[sensitive],metadataCount:0});const downloads:string[]=[];vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){downloads.push(this.download);});const {container}=await mount();await paste(new File(['image'],'report.png',{type:'image/png'}));await click(container,'Download Privacy Report');await click(container,'Download Privacy Report');expect(downloads).toEqual(['safeshare-privacy-report.pdf','safeshare-privacy-report.pdf']);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:https://example.test/2');expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:https://example.test/3');});
  it('ignores ordinary text and paste events in text fields without replacing the image', async () => {
    const { container } = await mount();
    await paste(new File(['first'], 'first.png', { type: 'image/png' }));
    const original = container.querySelector('img')?.src;
    const textEvent = await paste();
    expect(textEvent.defaultPrevented).toBe(false);
    const input = document.createElement('input');
    container.append(input);
    await paste(new File(['second'], 'second.png', { type: 'image/png' }), input);
    expect(container.querySelector('img')?.src).toBe(original);
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it('pasting a new image clears findings, verification, protected output, and copy success', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } });
    const { container } = await mount();
    await readyWorkflow(container);
    expect(container.textContent).toContain('Copied to clipboard');
    await paste(new File(['replacement'], 'replacement.png', { type: 'image/png' }));
    expect(container.textContent).toContain('Privacy Scan Results');
    expect(container.textContent).not.toContain('Ready to Share');
    expect(container.textContent).not.toContain('Copied');
    expect(button(container, 'Copy Safe Image')).toBeUndefined();
    expect(container.querySelector('img')?.src).toBe('blob:https://example.test/3');
  });

  it('does not apply stale scan results after a new image is pasted', async () => {
    let finishScan!: (value: { findings: Finding[]; textFindings: Finding[]; metadataCount: number }) => void;
    controls.scan.mockImplementationOnce(() => new Promise(resolve => { finishScan = resolve; })).mockResolvedValueOnce({findings:[],textFindings:[],metadataCount:0});
    const { container } = await mount();
    await paste(new File(['first'], 'first.png', { type: 'image/png' }));
        await paste(new File(['second'], 'second.png', { type: 'image/png' }));
    await act(async () => finishScan({ findings: [sensitive], textFindings: [sensitive], metadataCount: 0 }));
    expect(container.textContent).toContain('No sensitive findings requiring protection');
    expect(container.textContent).not.toContain('Password');
  });
  it('only exposes copy after successful verification and copies the protected PNG', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { container } = await mount();
    await paste(new File(['unsafe-original'], 'original.png', { type: 'image/png' }));
    expect(button(container, 'Copy Safe Image')).toBeUndefined();
        expect(button(container, 'Copy Safe Image')).toBeUndefined();
    await click(container, 'Protect & Verify');
    const copy = button(container, 'Copy Safe Image');
    const exportButton = button(container, 'Export protected image');
    expect(copy).toBeDefined();
    expect(exportButton).toBeDefined();
    expect(container.textContent).toContain('Awaiting review');
    expect(copy?.disabled).toBe(true);
    expect(exportButton?.disabled).toBe(true);
    await click(container, 'Approve & Copy');
    expect(container.textContent).toContain('Ready to Share');
    expect(copy?.disabled).toBe(false);
    expect(write).toHaveBeenCalledOnce();
    const item = write.mock.calls[0][0][0] as TestClipboardItem;
    expect(item.data['image/png']).toBe(controls.protectedBlob);
    expect(container.textContent).toContain('Copied');
    await click(container, 'Export protected image');
    expect(anchorClick).toHaveBeenCalledOnce();
  });

  it('blocks copying when verification has unresolved sensitive findings', async () => {
    controls.verify.mockReturnValue({ checks: [{ finding: sensitive, passed: false }], unresolved: [sensitive], reviewCount: 0, ready: false });
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } });
    const { container } = await mount();
    await readyWorkflow(container);
    expect(button(container, 'Copy Safe Image')?.disabled).toBe(true);
    expect(button(container, 'Export protected image')?.disabled).toBe(true);
    await act(async () => button(container, 'Copy Safe Image')?.click());
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps Copy Safe Image visible but disabled when image clipboard writing is unsupported', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    Object.defineProperty(globalThis, 'ClipboardItem', { configurable: true, value: undefined });
    const { container } = await mount();
    await readyWorkflow(container);
    const copy = button(container, 'Copy Safe Image');
    expect(copy).toBeDefined();
    expect(copy?.disabled).toBe(true);
    expect(button(container, 'Export protected image')).toBeDefined();
    expect(container.querySelector('[role=status]')?.textContent).toContain('not supported');
  });

  it('reports clipboard API rejection without claiming success', async () => {
    const write = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } });
    const { container } = await mount();
    await readyWorkflow(container);
    await click(container, 'Copy Safe Image');
    expect(container.querySelector('[role=alert]')?.textContent).toContain('could not copy');
    expect(container.textContent).not.toContain('Copied');
  });
});
