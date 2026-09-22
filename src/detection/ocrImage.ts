export function ocrScale(width:number,height:number):number {
  if(width>=1800)return 1;
  return Math.max(1,Math.min(2,3000/width,2800/height,Math.sqrt(6_000_000/(width*height))));
}
export function isDarkScreenshot(pixels:Uint8ClampedArray,width:number,height:number):boolean {
  let dark=0,total=0;
  const stride=Math.max(1,Math.floor(Math.sqrt(width*height/2500)));
  for(let y=0;y<height;y+=stride)for(let x=0;x<width;x+=stride){const i=(y*width+x)*4;const l=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];if(l<110)dark++;total++;}
  return total>0&&dark/total>.58;
}
export function normalizeDarkPixels(pixels:Uint8ClampedArray):void {
  for(let i=0;i<pixels.length;i+=4){
    const luminance=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
    const value=Math.max(0,Math.min(255,Math.round((255-luminance-15)*1.12)));
    pixels[i]=value;pixels[i+1]=value;pixels[i+2]=value;
  }
}
export function prepareOcrCanvas(source:HTMLCanvasElement):{canvas:HTMLCanvasElement;scale:number;dark:boolean}{
  const scale=ocrScale(source.width,source.height),canvas=document.createElement('canvas');
  canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);
  const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,canvas.width,canvas.height);
  const image=ctx.getImageData(0,0,canvas.width,canvas.height);
  const dark=isDarkScreenshot(image.data,canvas.width,canvas.height);
  if(dark){normalizeDarkPixels(image.data);ctx.putImageData(image,0,0);}
  return {canvas,scale,dark};
}
