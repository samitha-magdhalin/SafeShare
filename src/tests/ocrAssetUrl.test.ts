import { describe, expect, it } from 'vitest';
import { resolveOcrRoot } from '../detection/scan';

describe('OCR asset URL resolution', () => {
  it.each([
    ['packaged Tauri', 'http://tauri.localhost/', './', 'http://tauri.localhost/ocr'],
    ['Vite development', 'http://localhost:1420/', './', 'http://localhost:1420/ocr'],
    ['root deployment', 'https://example.com/', '/', 'https://example.com/ocr'],
    ['nested document', 'https://example.com/agent/index.html', './', 'https://example.com/agent/ocr'],
  ])('resolves %s assets relative to the document', (_name, documentUrl, baseUrl, expected) => {
    expect(resolveOcrRoot(documentUrl, baseUrl)).toBe(expected);
  });

  it('never creates the malformed packaged hostname', () => {
    expect(resolveOcrRoot('http://tauri.localhost/', './')).not.toContain('tauri.localhost.');
  });
});