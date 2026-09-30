import {describe,expect,it} from 'vitest';
import {ImageEventDeduplicator,fingerprintImage,fingerprintVisualPixels} from './deduplicate';

describe('clipboard image deduplication',()=>{
  it('keeps exact-output hashes byte-based',async()=>{
    expect(await fingerprintImage(Uint8Array.from([1,2,3]))).not.toBe(await fingerprintImage(Uint8Array.from([1,2,4])));
  });
  it('gives equivalent encoded images the same identity after decoding to the same pixels',async()=>{
    const decodedA=Uint8Array.from([10,20,30,255,40,50,60,255]),decodedB=Uint8Array.from(decodedA);
    expect(await fingerprintVisualPixels(2,1,decodedA)).toBe(await fingerprintVisualPixels(2,1,decodedB));
  });
  it('includes dimensions and changed pixels in visual identity',async()=>{
    const pixels=Uint8Array.from([10,20,30,255,40,50,60,255]),changed=Uint8Array.from([10,20,30,255,40,50,61,255]);
    expect(await fingerprintVisualPixels(2,1,pixels)).not.toBe(await fingerprintVisualPixels(2,1,changed));
    expect(await fingerprintVisualPixels(2,1,pixels)).not.toBe(await fingerprintVisualPixels(1,2,pixels));
  });
  it('accepts changed identities and rejects an unchanged visual image',async()=>{
    const dedupe=new ImageEventDeduplicator(),first=await fingerprintVisualPixels(1,1,Uint8Array.from([1,2,3,255])),changed=await fingerprintVisualPixels(1,1,Uint8Array.from([1,2,4,255]));
    expect(dedupe.accept(first)).toBe(true);expect(dedupe.accept(first)).toBe(false);expect(dedupe.accept(changed)).toBe(true);
  });
  it('marks earlier rapid events stale',()=>{
    const dedupe=new ImageEventDeduplicator(),first=dedupe.beginEvent(),second=dedupe.beginEvent();
    expect(dedupe.isLatest(first)).toBe(false);expect(dedupe.isLatest(second)).toBe(true);
  });
});
