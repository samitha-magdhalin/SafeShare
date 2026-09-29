import { describe, expect, it, vi } from 'vitest';
import { PROFILES } from '../../src/policy/profiles';
import { ClipboardScanController } from './controller';
import { fingerprintImage } from './deduplicate';
import type { NativeBridge } from './native';
import type { TeamPolicySnapshot } from './controlPlane/types';

const policy:TeamPolicySnapshot={workspaceId:'workspace-a',workspaceName:'Workspace A',version:1,policy:PROFILES.client.policy,fetchedAt:'2026-09-28T00:00:00.000Z',source:'server'};
function bridge(overrides:Partial<NativeBridge>={}):NativeBridge{return{listenForImages:async()=>()=>undefined,listenForReview:async()=>()=>undefined,readClipboardImage:async()=>null,writeClipboardImage:async()=>undefined,notify:async()=>undefined,setReviewAvailable:async()=>undefined,hideReviewWindow:async()=>undefined,readPolicyCache:async()=>null,writePolicyCache:async()=>undefined,setCompanyStatus:async()=>undefined,...overrides}}
describe('clipboard event filtering',()=>{
  it('ignores a non-image event without notifying or creating a review',async()=>{const notify=vi.fn(async()=>undefined),onAttention=vi.fn(),logger=vi.fn();await new ClipboardScanController(bridge({notify}),async()=>policy,onAttention,logger).enqueue();expect(notify).not.toHaveBeenCalled();expect(onAttention).not.toHaveBeenCalled();expect(logger).not.toHaveBeenCalled()});
  it('fails closed before reading clipboard image when Team Policy is unavailable',async()=>{const read=vi.fn(async()=>[1,2,3]),logger=vi.fn();await new ClipboardScanController(bridge({readClipboardImage:read}),async()=>null,vi.fn(),logger).enqueue();expect(read).not.toHaveBeenCalled()});
  it('consumes the Agent own-write fingerprint without rescanning or notifying',async()=>{const values=[1,2,3,4],notify=vi.fn(async()=>undefined),onAttention=vi.fn(),logger=vi.fn(),controller=new ClipboardScanController(bridge({readClipboardImage:async()=>values,notify}),async()=>policy,onAttention,logger);controller.suppressOwnWrite(await fingerprintImage(Uint8Array.from(values)));await controller.enqueue();await controller.enqueue();expect(notify).not.toHaveBeenCalled();expect(onAttention).not.toHaveBeenCalled();expect(logger).not.toHaveBeenCalled()});
});