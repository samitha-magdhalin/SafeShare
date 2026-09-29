import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

describe('Vercel SPA routing',()=>{
  const config=JSON.parse(readFileSync(join(process.cwd(),'vercel.json'),'utf8')) as {rewrites:{source:string;destination:string}[]};
  it('falls application routes back to the Vite entry point',()=>{
    expect(config.rewrites).toEqual([{source:'/(.*)',destination:'/index.html'}]);
    for(const route of ['/','/login','/signup','/invite/'+'a'.repeat(64)])expect(route).toMatch(new RegExp('^'+config.rewrites[0].source+'$'));
  });
  it('keeps required static resources in the deployed filesystem',()=>{
    for(const asset of ['public/ocr/worker.min.js','public/ocr/eng.traineddata.gz','public/ocr/core/tesseract-core-simd-lstm.wasm'])expect(existsSync(join(process.cwd(),asset))).toBe(true);
  });
});