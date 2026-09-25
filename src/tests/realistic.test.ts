import {it,expect} from 'vitest';
import {createWorker} from 'tesseract.js';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PNG} from 'pngjs';
import {extractLines} from '../detection/scan';
import {detectText} from '../detection/detect';
import {isDarkScreenshot,normalizeDarkPixels,ocrScale} from '../detection/ocrImage';
import {protectionRect,sampleBackground} from '../utils/image';
import {verifyImage} from '../verification/verify';

function preparedImage(source:PNG){
  const scale=ocrScale(source.width,source.height),width=Math.round(source.width*scale),height=Math.round(source.height*scale);
  const prepared=new PNG({width,height});
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sourceX=Math.min(source.width-1,Math.floor(x/scale)),sourceY=Math.min(source.height-1,Math.floor(y/scale));
    const from=(sourceY*source.width+sourceX)*4,to=(y*width+x)*4;
    for(let channel=0;channel<4;channel++)prepared.data[to+channel]=source.data[from+channel];
  }
  const pixels=new Uint8ClampedArray(prepared.data);
  expect(isDarkScreenshot(pixels,width,height)).toBe(true);
  normalizeDarkPixels(pixels);prepared.data.set(pixels);
  return {bytes:PNG.sync.write(prepared),scale};
}
async function recognizeFixture(name:string){
  const source=PNG.sync.read(await readFile(resolve(`public/fixtures/${name}`)));
  const {bytes,scale}=preparedImage(source);
  const worker=await createWorker('eng',1,{langPath:resolve('public/ocr'),cacheMethod:'none'});
  try{
    const {data}=await worker.recognize(bytes,{}, {blocks:true,text:true});
    const lines=extractLines(data,scale);
    return lines.flatMap(line=>detectText(line.map(word=>word.text).join(' '),line));
  }finally{await worker.terminate();}
}
it('recovers the fake dark editor credentials and keeps its public URL informational',async()=>{
  const findings=await recognizeFixture('fake-vscode-dark.png');
  for(const type of ['Email','Phone','API Key','Access Token','Database Connection String','Internal URL','Password'])expect(findings.some(f=>f.type===type)).toBe(true);
  expect(findings.some(f=>f.type==='Public URL'&&f.severity==='INFO'&&!f.selected)).toBe(true);
  expect(findings.filter(f=>f.severity==='CRITICAL').every(f=>f.box&&f.box.width>0)).toBe(true);
  expect(findings.filter(f=>f.box).every(f=>f.box!.x>=0&&f.box!.y>=0&&f.box!.x+f.box!.width<=1600&&f.box!.y+f.box!.height<=900)).toBe(true);
},15000);
it('recovers the fake dark terminal credentials and contact details',async()=>{
  const findings=await recognizeFixture('fake-terminal-dark.png');
  for(const type of ['AWS Access Key','API Token','Bearer Token','Internal URL','Internal IP','Password','Email'])expect(findings.some(f=>f.type===type)).toBe(true);
},15000);
it('rescans a protected dark screenshot and leaves only informational content',async()=>{
  const original=await recognizeFixture('fake-vscode-dark.png');
  const png=PNG.sync.read(await readFile(resolve('public/fixtures/fake-vscode-dark.png')));
  const sourcePixels=new Uint8ClampedArray(png.data);
  for(const finding of original.filter(f=>f.selected&&f.box)){
    const rect=protectionRect(finding.box!,png.width,png.height)!;
    const fill=sampleBackground(sourcePixels,png.width,png.height,rect);
    const rgb=fill?fill.match(/\d+/g)!.map(Number):[32,43,55];
    for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++){
      const i=(y*png.width+x)*4;png.data[i]=rgb[0];png.data[i+1]=rgb[1];png.data[i+2]=rgb[2];png.data[i+3]=255;
    }
  }
  const {bytes,scale}=preparedImage(png);
  const worker=await createWorker('eng',1,{langPath:resolve('public/ocr'),cacheMethod:'none'});
  try{
    const {data}=await worker.recognize(bytes,{}, {blocks:true,text:true});
    const rescanned=extractLines(data,scale).flatMap(line=>detectText(line.map(word=>word.text).join(' '),line));
    const report=verifyImage(original,rescanned);
    expect(report.unresolved).toHaveLength(0);
    expect(report.ready).toBe(true);
    expect(report.reviewCount).toBe(0);
  }finally{await worker.terminate();}
},15000);
