import type { Finding } from '../types';

export async function detectQr(pixels: Uint8ClampedArray, width: number, height: number): Promise<Finding | null> {
  const jsQR=(await import('jsqr')).default;
  const result=jsQR(pixels,width,height);
  if(!result?.data?.trim()) return null;
  const corners=[result.location.topLeftCorner,result.location.topRightCorner,result.location.bottomLeftCorner,result.location.bottomRightCorner];
  if(corners.some(point=>!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.y<0||point.x>width||point.y>height)) return null;
  const x=Math.min(...corners.map(point=>point.x)),y=Math.min(...corners.map(point=>point.y));
  const box={x,y,width:Math.max(...corners.map(point=>point.x))-x,height:Math.max(...corners.map(point=>point.y))-y};
  if(box.width<8||box.height<8) return null;
  return {id:'qr-0',type:'QR code',category:'qr',severity:'REVIEW',confidence:100,box,maskedPreview:'QR content hidden',source:'qr',description:'QR code detected. Review its contents before sharing.',selected:true,fingerprint:'qr'};
}
