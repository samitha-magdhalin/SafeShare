export async function fingerprintImage(bytes:Uint8Array):Promise<string>{const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer);return[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');}
export async function fingerprintVisualPixels(width:number,height:number,rgba:Uint8Array|Uint8ClampedArray):Promise<string>{
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||rgba.byteLength!==width*height*4)throw new Error('INVALID_IMAGE_PIXELS');
  const canonical=new Uint8Array(8+rgba.byteLength),dimensions=new DataView(canonical.buffer,0,8);
  dimensions.setUint32(0,width,true);dimensions.setUint32(4,height,true);canonical.set(rgba,8);
  try{return await fingerprintImage(canonical)}finally{canonical.fill(0)}
}
export async function fingerprintVisualImage(bytes:Uint8Array):Promise<string>{
  const image=await createImageBitmap(new Blob([new Uint8Array(bytes).buffer],{type:'image/png'}));
  try{
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('IMAGE_DECODE_FAILED');
    context.drawImage(image,0,0);const pixels=context.getImageData(0,0,image.width,image.height).data;
    try{return await fingerprintVisualPixels(image.width,image.height,pixels)}finally{pixels.fill(0);canvas.width=0;canvas.height=0}
  }finally{image.close()}
}
export class ImageEventDeduplicator{private lastFingerprint:string|undefined;private generation=0;beginEvent():number{return++this.generation;}isLatest(generation:number):boolean{return generation===this.generation;}accept(fingerprint:string):boolean{if(fingerprint===this.lastFingerprint)return false;this.lastFingerprint=fingerprint;return true;}}
