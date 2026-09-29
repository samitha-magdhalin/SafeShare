import type { Finding, Word } from '../types';
import { detectText } from './detect';
import { inspectMetadata } from '../metadata/inspect';
import { canvasFromImage, loadImage } from '../utils/image';
import { detectQr } from './qr';
import { prepareOcrCanvas } from './ocrImage';

export type ScanResult = { findings: Finding[]; textFindings: Finding[]; metadataCount: number };
export type ScanErrorCode = 'IMAGE_DECODE' | 'OCR_ASSETS' | 'OCR_INIT' | 'OCR_RECOGNITION' | 'OCR_RESULT' | 'SCAN_COMPONENT';
export class ScanError extends Error {
  constructor(public readonly code: ScanErrorCode, cause: unknown) { super(code, { cause }); this.name = 'ScanError'; }
}
export function logDevelopmentScanError(stage: string, error: unknown): void {
  // This logger receives errors only. Never pass OCR text, images, findings, or detected values.
  if (import.meta.env.DEV) console.error(`[SafeShare] ${stage}`, error);
}
export function resolveOcrRoot(documentUrl: string, baseUrl: string): string {
  return new URL(baseUrl + 'ocr/', documentUrl).href.replace(/\/$/, '');
}
async function requireOcrAssets(root: string): Promise<void> {
  const files = ['worker.min.js','eng.traineddata.gz',...['lstm','simd-lstm','relaxedsimd-lstm'].flatMap(name=>[`core/tesseract-core-${name}.wasm.js`,`core/tesseract-core-${name}.wasm`])];
  for (const file of files) {
    const response = await fetch(`${root}/${file}`, { method: 'HEAD', cache: 'no-store' });
    // Vite may serve index.html with HTTP 200 for a missing public asset.
    if (!response.ok || (response.headers.get('content-type') || '').includes('text/html')) throw new Error(`Missing OCR asset: ${file}`);
  }
}
type OcrData = Awaited<ReturnType<Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>['recognize']>>['data'];
export function extractLines(data: OcrData, scale=1): Word[][] {
  if (!Array.isArray(data.blocks)) throw new Error('OCR did not return text blocks');
  const lines: Word[][] = [];
  for (const block of data.blocks) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) {
    const words: Word[] = [];
    for (const word of line.words || []) {
      const box = word.bbox;
      if (!box || ![box.x0,box.y0,box.x1,box.y1].every(Number.isFinite)) continue;
      words.push({text:word.text || '',confidence:word.confidence || 0,box:{x:box.x0/scale,y:box.y0/scale,width:(box.x1-box.x0)/scale,height:(box.y1-box.y0)/scale},symbols:(word.symbols||[]).filter(symbol=>symbol.bbox).map(symbol=>({text:symbol.text,box:{x:symbol.bbox.x0/scale,y:symbol.bbox.y0/scale,width:(symbol.bbox.x1-symbol.bbox.x0)/scale,height:(symbol.bbox.y1-symbol.bbox.y0)/scale}}))});
    }
    lines.push(words);
  }
  // Syntax highlighting can cause Tesseract to split one visual row into several line objects.
  const rows:Word[][]=[];
  for(const line of lines.sort((a,b)=>(a[0]?.box.y??0)-(b[0]?.box.y??0))){
    if(!line.length)continue;
    const center=line.reduce((sum,word)=>sum+word.box.y+word.box.height/2,0)/line.length;
    const height=Math.max(...line.map(word=>word.box.height));
    const row=rows.find(existing=>{const first=existing[0],rowCenter=first.box.y+first.box.height/2;return Math.abs(center-rowCenter)<=Math.max(3,Math.min(height,first.box.height)*.45);});
    if(row)row.push(...line);else rows.push([...line]);
  }
  return rows.map(row=>row.sort((a,b)=>a.box.x-b.box.x));
}
export async function scan(blob: Blob, onProgress: (message:string)=>void): Promise<ScanResult> {
  let image: ImageBitmap;
  try { image=await loadImage(blob); }
  catch(error){logDevelopmentScanError('image decode',error);throw new ScanError('IMAGE_DECODE',error);}
  let canvas: HTMLCanvasElement;
  try { canvas=canvasFromImage(image); }
  catch(error){image.close();logDevelopmentScanError('image canvas',error);throw new ScanError('IMAGE_DECODE',error);}
  try {
    onProgress('Reading visible text…');
    const root=resolveOcrRoot(location.href,import.meta.env.BASE_URL);
    try { await requireOcrAssets(root); }
    catch(error){logDevelopmentScanError('OCR assets',error);throw new ScanError('OCR_ASSETS',error);}
    let worker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
    try { const {createWorker}=await import('tesseract.js');worker=await createWorker('eng',1,{workerPath:`${root}/worker.min.js`,corePath:`${root}/core`,langPath:root,cacheMethod:'none',workerBlobURL:false}); }
    catch(error){logDevelopmentScanError('OCR initialization',error);throw new ScanError('OCR_INIT',error);}
    let lines: Word[][];
    let prepared:ReturnType<typeof prepareOcrCanvas>|undefined;
    try {
      prepared=prepareOcrCanvas(canvas);
      const {data}=await worker.recognize(prepared.canvas,{}, {blocks:true,text:true});
      try { lines=extractLines(data,prepared.scale); }
      catch(error){logDevelopmentScanError('OCR result structure',error);throw new ScanError('OCR_RESULT',error);}
    } catch(error) {
      if(error instanceof ScanError) throw error;
      logDevelopmentScanError('OCR recognition',error);throw new ScanError('OCR_RECOGNITION',error);
    } finally { if(prepared){prepared.canvas.width=0;prepared.canvas.height=0;}await worker.terminate().catch(error=>logDevelopmentScanError('OCR cleanup',error)); }
    onProgress('Checking sensitive information…');
    let textFindings:Finding[];
    try { textFindings=lines.flatMap(group=>{group.sort((a,b)=>a.box.x-b.box.x);return detectText(group.map(word=>word.text).join(' '),group)}).map((finding,index)=>({...finding,id:`text-${index}`})); }
    catch(error){logDevelopmentScanError('text detection',error);throw new ScanError('SCAN_COMPONENT',error);}
    const findings=[...textFindings];
    onProgress('Checking QR codes…');
    try {
      const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height);
      const qr=await detectQr(pixels.data,pixels.width,pixels.height);
      if(qr)findings.push(qr);
    } catch(error){logDevelopmentScanError('optional QR detection',error);}
    onProgress('Inspecting metadata…');
    let metadataCount=0;
    try {const metadata=await inspectMetadata(blob);metadataCount=metadata.length;for(const [index,item] of metadata.entries())findings.push({id:`metadata-${index}`,type:`${item.type} metadata`,category:'metadata',severity:'SENSITIVE',confidence:100,maskedPreview:item.description,source:'metadata',description:'This information may be embedded in the original file.',selected:true,fingerprint:`metadata:${item.type}`});}
    catch(error){logDevelopmentScanError('optional metadata inspection',error);}
    return {findings,textFindings,metadataCount};
  } finally {image.close();canvas.width=0;canvas.height=0;}
}
