import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const sourceRoot = new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, value => value.slice(1));

function userFacingSources(directory = sourceRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : userFacingSources(path);
    return ['.ts', '.tsx', '.css'].includes(extname(path)) ? [path] : [];
  });
}

describe('UI polish safeguards', () => {
  it('keeps user-facing source free of known mojibake markers', () => {
    const markers = [0xe2, 0xc3, 0xc2, 0xfffd].map(code => String.fromCodePoint(code));
    const failures = userFacingSources().flatMap(path => {
      const source = readFileSync(path, 'utf8');
      return markers.some(marker => source.includes(marker)) ? [path] : [];
    });
    expect(failures).toEqual([]);
  });

  it('retains complete authenticated navigation and accessible state styling', () => {
    const shell = readFileSync(join(sourceRoot, 'app', 'SaaSApp.tsx'), 'utf8');
    const css = readFileSync(join(sourceRoot, 'style.css'), 'utf8');
    for (const page of ['scanner', 'batch', 'activity', 'team', 'settings']) expect(shell).toContain("'" + page + "'");
    expect(shell).toContain("page===item?'active':''");
    expect(shell).toContain('aria-label="Workspace"');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('@media(prefers-reduced-motion:reduce)');
  });

  it('uses consistent scanner and workspace language', () => {
    const app = readFileSync(join(sourceRoot, 'App.tsx'), 'utf8');
    const team = readFileSync(join(sourceRoot, 'workspace', 'TeamPolicy.tsx'), 'utf8');
    expect(app).toContain('Protect a screenshot');
    expect(app).toContain('Processing stays in your browser.');
    expect(app).toContain('Protect & Verify');
    expect(app).toContain('Ready to Share');
    expect(team).toContain('Choose how SafeShare handles each type of information before screenshots are shared.');
    expect(team).toContain('Managed by your organization');
  });
});
