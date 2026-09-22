import { it, expect } from 'vitest';
import { createWorker } from 'tesseract.js';
import { resolve } from 'node:path';
import { detectText } from '../detection/detect';
import { extractLines } from '../detection/scan';
import { stat } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { detectQr } from '../detection/qr';
import { protectionRect, sampleBackground } from '../utils/image';
import QRCode from 'qrcode';
it('recognizes the synthetic screenshot with the bundled English model',async()=>{
  const worker=await createWorker('eng',1,{langPath:resolve('public/ocr'),cacheMethod:'none'});
  try{
    const {data}=await worker.recognize(resolve('public/fixtures/fake-debug-screen.png'),{}, {blocks:true,text:true});
    const lines=extractLines(data);
    expect(lines.flat().some(word=>word.box.width>0 && word.box.height>0)).toBe(true);
    expect(data.text.includes('API')).toBe(true);
    expect(lines.some(line=>line.map(word=>word.text).join(' ').includes('API'))).toBe(true);
    expect(lines.some(line=>line.map(word=>word.text).join(' ').includes('KEY'))).toBe(true);
    const findings=lines.flatMap(line=>detectText(line.map(word=>word.text).join(' '),line));
    expect(findings.some(f=>f.type==='Email')).toBe(true);
    expect(findings.some(f=>f.type==='Phone')).toBe(true);
    expect(findings.some(f=>f.type==='Internal URL')).toBe(true);
    expect(findings.some(f=>f.type==='API Key')).toBe(true);
    expect(findings.some(f=>f.type==='Password')).toBe(true);
    expect(findings.filter(f=>f.severity==='CRITICAL').every(f=>f.box && f.box.width>0 && f.box.height>0)).toBe(true);
    const api=findings.find(f=>f.type==='API Key')!,password=findings.find(f=>f.type==='Password')!;
    console.info({apiBox:api.box,passwordBox:password.box});
    expect(api.box!.x).toBeGreaterThan(160);
    expect(password.box!.x).toBeGreaterThan(200);
    expect(api.box!.width).toBeLessThan(620);
    expect(password.box!.width).toBeLessThan(480);
  }finally{await worker.terminate();}
});
it('does not classify the synthetic screenshot as a QR code',async()=>{
  const png=PNG.sync.read(await readFile(resolve('public/fixtures/fake-debug-screen.png')));
  const pixels=new Uint8ClampedArray(png.data);
  expect(jsQR(pixels,png.width,png.height)).not.toBeNull(); // Reproduces the library's empty-payload false positive.
  expect(await detectQr(pixels,png.width,png.height)).toBeNull();
});
it('still detects a real QR code',async()=>{
  const encoded=await QRCode.toBuffer('https://example.com/demo',{width:320,margin:4});
  const png=PNG.sync.read(encoded);
  const finding=await detectQr(new Uint8ClampedArray(png.data),png.width,png.height);
  expect(finding?.type).toBe('QR code');
  expect(finding?.box?.width).toBeGreaterThan(50);
});
it('keeps labels while covering only selected value regions',async()=>{
  const png=PNG.sync.read(await readFile(resolve('public/fixtures/fake-debug-screen.png')));
  const original=new Uint8ClampedArray(png.data);
  const worker=await createWorker('eng',1,{langPath:resolve('public/ocr'),cacheMethod:'none'});
  try{
    const first=(await worker.recognize(resolve('public/fixtures/fake-debug-screen.png'),{}, {blocks:true,text:true})).data;
    const findings=extractLines(first).flatMap(line=>detectText(line.map(word=>word.text).join(' '),line));
    expect(findings).toHaveLength(5);
    for(const finding of findings){
      const rect=protectionRect(finding.box!,png.width,png.height)!;
      const fill=sampleBackground(original,png.width,png.height,rect);
      expect(fill).not.toBeNull();
      const rgb=fill!.match(/\d+/g)!.map(Number);
      for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++){
        const offset=(y*png.width+x)*4;png.data[offset]=rgb[0];png.data[offset+1]=rgb[1];png.data[offset+2]=rgb[2];png.data[offset+3]=255;
      }
    }
    const second=(await worker.recognize(PNG.sync.write(png),{}, {blocks:true,text:true})).data;
    const text=second.text;
    for(const label of ['Customer:','Phone:','Internal Server:','API_KEY=','PASSWORD='])expect(text).toContain(label);
    const remaining=extractLines(second).flatMap(line=>detectText(line.map(word=>word.text).join(' '),line));
    expect(remaining.filter(f=>f.severity==='CRITICAL'||f.severity==='SENSITIVE')).toHaveLength(0);
  }finally{await worker.terminate();}
});
it('bundles the browser OCR loaders selected by Tesseract',async()=>{
  for(const name of ['lstm','simd-lstm','relaxedsimd-lstm']) {
    expect((await stat(resolve(`public/ocr/core/tesseract-core-${name}.wasm.js`))).size).toBeGreaterThan(1000);
    expect((await stat(resolve(`public/ocr/core/tesseract-core-${name}.wasm`))).size).toBeGreaterThan(1000);
  }
});
