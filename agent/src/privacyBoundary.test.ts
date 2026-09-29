import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const forbiddenActivityKeys = [
  'image', 'imageBytes', 'blob', 'file', 'base64', 'ocr', 'ocrText', 'words',
  'boxes', 'findings', 'finding', 'description', 'credential', 'email', 'phone',
  'ip', 'url', 'qr', 'metadata', 'protectedImage', 'report',
];

describe('M3 and M4 privacy boundaries', () => {
  it('keeps credentials in memory-only Supabase auth configuration', () => {
    const adapter = readFileSync(new URL('./controlPlane/adapter.ts', import.meta.url), 'utf8');
    expect(adapter).toContain('persistSession:false');
    expect(adapter).toContain("signOut({scope:'local'})");
    expect(adapter).not.toMatch(/localStorage|sessionStorage|indexedDB/i);
  });

  it('keeps control-plane modules free of privacy-engine imports', () => {
    const files = ['adapter.ts', 'types.ts', 'policyResolver.ts', 'policyCache.ts'];
    for (const file of files) {
      const source = readFileSync(new URL('./controlPlane/' + file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/detection\/scan|utils\/image|verification\/verify/);
    }
  });

  it('limits the public Agent activity DTO to workspace, event, and policy version', () => {
    const types = readFileSync(new URL('./controlPlane/types.ts', import.meta.url), 'utf8');
    const dto = types.match(/export type AgentActivityInput=\{([^}]*)\}/)?.[1] ?? '';
    expect(dto).toBe('workspaceId:string;eventType:AgentActivityEventType;policyVersion:number');
    for (const key of forbiddenActivityKeys) {
      expect(dto.toLowerCase()).not.toContain(key.toLowerCase());
    }
  });

  it('sends zero finding and category counts through the required existing RPC shape', () => {
    const adapter = readFileSync(new URL('./controlPlane/adapter.ts', import.meta.url), 'utf8');
    for (const key of [
      'total_findings', 'credential_count', 'email_count', 'phone_count',
      'internal_ip_count', 'internal_url_count', 'public_url_count', 'qr_count',
      'metadata_count', 'protected_count', 'warning_count',
    ]) expect(adapter).toContain(key + ':0');
    expect(adapter).not.toMatch(/Finding|ocrText|imageBytes|protectedImage|base64/);
  });

  it('persists only the allowlisted policy cache shape', () => {
    const cache = readFileSync(new URL('./controlPlane/policyCache.ts', import.meta.url), 'utf8');
    expect(cache).toContain('JSON.stringify(value)');
    expect(cache).not.toMatch(/localStorage|sessionStorage|indexedDB/i);
  });
});
