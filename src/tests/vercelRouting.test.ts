import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

describe('Vercel SPA routing',()=>{
  const config=JSON.parse(readFileSync(join(process.cwd(),'vercel.json'),'utf8')) as {rewrites:{source:string;destination:string}[];headers:{source:string;headers:{key:string;value:string}[]}[]};
  it('falls application routes back to the Vite entry point',()=>{
    expect(config.rewrites).toEqual([{source:'/(.*)',destination:'/index.html'}]);
    for(const route of ['/','/login','/signup','/invite/'+'a'.repeat(64)])expect(route).toMatch(new RegExp('^'+config.rewrites[0].source+'$'));
  });
  it('keeps required static resources in the deployed filesystem',()=>{
    for(const asset of ['public/ocr/worker.min.js','public/ocr/eng.traineddata.gz','public/ocr/core/tesseract-core-simd-lstm.wasm'])expect(existsSync(join(process.cwd(),asset))).toBe(true);
  });
  it('sets security headers on all routes with an explicit connect-src',()=>{
    const routeHeaders=config.headers.find(entry=>entry.source==='/(.*)')?.headers??[];
    const headers=Object.fromEntries(routeHeaders.map(header=>[header.key,header.value]));
    expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    expect(headers['Content-Security-Policy']).toBe("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://ftzckoiarbzsszlrjthx.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
    const connectSrc=headers['Content-Security-Policy'].match(/(?:^|;\s*)connect-src\s+([^;]+)/)?.[1];
    expect(connectSrc).toBe("'self' https://ftzckoiarbzsszlrjthx.supabase.co");
    expect(connectSrc).not.toContain('*');
    expect(connectSrc).not.toContain('https://supabase.co');
  });
});