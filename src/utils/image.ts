import type { Box, Finding } from '../types';

export type ProtectionCoverage={required:number;applied:number;complete:boolean;requiredFindingIds:string[];appliedFindingIds:string[]};
export type ProtectionResult={blob:Blob;coverage:ProtectionCoverage};
export class ProtectionCoverageError extends Error{constructor(public readonly coverage:ProtectionCoverage){super('REQUIRED_PROTECTION_GEOMETRY');this.name='ProtectionCoverageError'}}

export async function loadImage(blob: Blob): Promise<ImageBitmap> { return createImageBitmap(blob); }
export function canvasFromImage(image: ImageBitmap): HTMLCanvasElement {
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  canvas.getContext('2d')!.drawImage(image,0,0);return canvas;
}
export function toBlob(canvas: HTMLCanvasElement): Promise<Blob> { return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not encode image.')),'image/png')); }

export function protectionRect(box: Box, imageWidth: number, imageHeight: number): Box | undefined {
  if(![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.width<=0||box.height<=0)return;
  // OCR boxes and Canvas pixels both use original image coordinates. Padding covers glyph antialiasing.
  const pad=Math.max(1,Math.min(3,Math.ceil(box.height*.07)));
  const x=Math.max(0,Math.floor(box.x-pad)),y=Math.max(0,Math.floor(box.y-pad));
  const right=Math.min(imageWidth,Math.ceil(box.x+box.width+pad)),bottom=Math.min(imageHeight,Math.ceil(box.y+box.height+pad));
  if(right<=x||bottom<=y)return;
  return {x,y,width:right-x,height:bottom-y};
}

export function sampleBackground(data: Uint8ClampedArray, imageWidth: number, imageHeight: number, box: Box): string | null {
  const samples:[number[],number[],number[]]=[[],[],[]];
  const left=Math.max(0,Math.floor(box.x)),right=Math.min(imageWidth,Math.ceil(box.x+box.width));
  const top=Math.floor(box.y),bottom=Math.ceil(box.y+box.height);
  for(const [start,end] of [[top-8,top-3],[bottom+3,bottom+8]])for(let y=Math.max(0,start);y<Math.min(imageHeight,end);y+=2)for(let x=left;x<right;x+=3){
    const offset=(y*imageWidth+x)*4;
    if(data[offset+3]<240)continue;
    for(let channel=0;channel<3;channel++)samples[channel].push(data[offset+channel]);
  }
  if(samples[0].length<12)return null;
  const median=samples.map(channel=>{channel.sort((a,b)=>a-b);return channel[Math.floor(channel.length/2)]});
  const consistent=samples.every((channel,index)=>channel.filter(value=>Math.abs(value-median[index])<=24).length/channel.length>=.9);
  return consistent?`rgb(${median[0]}, ${median[1]}, ${median[2]})`:null;
}

type ProtectionApplication={finding:Finding;rect?:Box};
export function planProtection(findings:Finding[],imageWidth:number,imageHeight:number):{applications:ProtectionApplication[];coverage:ProtectionCoverage}{
  const required=findings.filter(finding=>finding.selected),applications:ProtectionApplication[]=[];
  for(const finding of required){
    if(finding.source==='metadata'){applications.push({finding});continue;}
    const box=finding.box;
    const valid=!!box&&[box.x,box.y,box.width,box.height].every(Number.isFinite)&&box.x>=0&&box.y>=0&&box.width>0&&box.height>0&&box.x+box.width<=imageWidth&&box.y+box.height<=imageHeight;
    const rect=valid?protectionRect(box!,imageWidth,imageHeight):undefined;
    if(!rect)throw new ProtectionCoverageError({required:required.length,applied:applications.length,complete:false,requiredFindingIds:required.map(item=>item.id),appliedFindingIds:applications.map(item=>item.finding.id)});
    applications.push({finding,rect});
  }
  return{applications,coverage:{required:required.length,applied:applications.length,complete:applications.length===required.length,requiredFindingIds:required.map(item=>item.id),appliedFindingIds:applications.map(item=>item.finding.id)}};
}
export async function protect(image: ImageBitmap, findings: Finding[]): Promise<ProtectionResult> {
  const{applications,coverage}=planProtection(findings,image.width,image.height),canvas=canvasFromImage(image),ctx=canvas.getContext('2d')!,original=ctx.getImageData(0,0,image.width,image.height);
  for(const application of applications){
    if(!application.rect)continue;
    ctx.fillStyle=sampleBackground(original.data,image.width,image.height,application.rect)??'#202b37';
    ctx.fillRect(application.rect.x,application.rect.y,application.rect.width,application.rect.height);
  }
  return{blob:await toBlob(canvas),coverage};
}
