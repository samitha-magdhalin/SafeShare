import { describe, expect, it, vi } from 'vitest';
import type { Finding } from '../types';
import { PROFILES } from '../policy/profiles';
import { batchSummary, createBatchItem, policyCounts, reevaluateItem, safeOutputNames, statusAfterScan } from '../batch/model';

const internal:Finding={id:'internal',type:'Internal URL',category:'network',severity:'SENSITIVE',confidence:90,maskedPreview:'http://i•••l',source:'ocr',description:'Internal URL',selected:false,fingerprint:'url:internal'};
const publicUrl:Finding={...internal,id:'public',type:'Public URL',maskedPreview:'https://e???m'};
const unknown:Finding={...internal,id:'future',type:'Future detector'};
function item(name='screen.png'){return createBatchItem(new File(['x'],name,{type:'image/png'}),`blob:${name}`,100,100);}

describe('batch state model',()=>{
  it('creates stable unique IDs and keeps same-name files separate',()=>{vi.spyOn(crypto,'randomUUID').mockReturnValueOnce('00000000-0000-4000-8000-000000000001').mockReturnValueOnce('00000000-0000-4000-8000-000000000002');const a=item(),b=item();expect(a.id).not.toBe(b.id);expect(a.file.name).toBe(b.file.name);});
  it('uses the active profile and defaults unknown findings to WARN',()=>{const current={...item(),findings:[internal,unknown]};expect(policyCounts(current,PROFILES.qa.policy)).toEqual({BLOCK:0,PROTECT:0,WARN:2,ALLOW:0});expect(policyCounts(current,PROFILES.public.policy)).toEqual({BLOCK:0,PROTECT:1,WARN:1,ALLOW:0});});
  it('reevaluates existing OCR findings and invalidates verified output',()=>{const current={...item(),status:'ready' as const,findings:[internal],outputBlob:new Blob(),outputUrl:'blob:safe',verification:{checks:[],unresolved:[],reviewCount:1,ready:true}};const next=reevaluateItem(current,PROFILES.public.policy);expect(next.findings[0].selected).toBe(true);expect(next.status).toBe('needs-protection');expect(next.outputBlob).toBeNull();expect(next.verification).toBeNull();expect(next.revision).toBe(1);});
  it('derives summary from independent item states',()=>{const ready={...item('a.png'),status:'ready' as const,findings:[internal]},failed={...item('b.png'),status:'failed' as const,findings:[unknown]};expect(batchSummary([ready,failed],PROFILES.qa.policy)).toEqual({total:2,ready:1,noAction:0,attention:1,findings:2,warnings:2});});
  it('classifies empty and ALLOW-only scans as no action while required findings need protection',()=>{expect(statusAfterScan([],PROFILES.client.policy)).toBe('no-findings');expect(statusAfterScan([publicUrl],PROFILES.client.policy)).toBe('no-findings');expect(statusAfterScan([internal],PROFILES.client.policy)).toBe('needs-protection');});
  it('keeps a scanned zero-finding item non-actionable after policy reevaluation',()=>{const scanned={...item(),status:'no-findings' as const,findings:[]};expect(reevaluateItem(scanned,PROFILES.public.policy).status).toBe('no-findings');});
  it('creates unique sanitized output names for duplicates',()=>{const a=item('same file.png'),b=item('same file.png');const names=safeOutputNames([a,b]);expect(names.get(a.id)).toBe('same-file-safeshare.png');expect(names.get(b.id)).toBe('same-file-safeshare-2.png');});
});
