import type { Box, Finding } from '../types';

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

export async function protect(image: ImageBitmap, findings: Finding[]): Promise<Blob> {
  const canvas=canvasFromImage(image),ctx=canvas.getContext('2d')!;
  const original=ctx.getImageData(0,0,image.width,image.height);
  for(const finding of findings.filter(item=>item.selected&&item.box)) {
    const rect=protectionRect(finding.box as Box,image.width,image.height);
    if(!rect)continue;
    ctx.fillStyle=sampleBackground(original.data,image.width,image.height,rect)??'#202b37';
    ctx.fillRect(rect.x,rect.y,rect.width,rect.height);
  }
  return toBlob(canvas);
}
