import { describe,expect,it,vi } from 'vitest';
import type { Finding } from '../../src/types';
import { PROFILES } from '../../src/policy/profiles';
import { scan } from '../../src/detection/scan';
import { ClipboardScanController } from './controller';
import type { NativeBridge } from './native';
import type { TeamPolicySnapshot } from './controlPlane/types';
vi.mock('../../src/detection/scan',()=>({scan:vi.fn()}));
const email:Finding={id:'email',type:'Email',category:'personal',severity:'SENSITIVE',confidence:95,maskedPreview:'hidden',source:'ocr',description:'safe',selected:true};
function bridge():NativeBridge{return{listenForImages:async()=>()=>undefined,listenForReview:async()=>()=>undefined,readClipboardImage:async()=>[1,2,3],writeClipboardImage:async()=>undefined,notify:vi.fn(async()=>undefined),setReviewAvailable:async()=>undefined,hideReviewWindow:async()=>undefined,readPolicyCache:async()=>null,writePolicyCache:async()=>undefined,setCompanyStatus:async()=>undefined}}
describe('Team Policy screenshot workflow',()=>{it('uses company Team Policy instead of bundled Client Sharing and sends no finding data to policy provider',async()=>{vi.mocked(scan).mockResolvedValue({findings:[email],textFindings:[email],metadataCount:0});const teamPolicy:TeamPolicySnapshot={workspaceId:'workspace-a',workspaceName:'Workspace A',version:5,policy:{...PROFILES.client.policy,email:'WARN'},fetchedAt:'2026-09-28T00:00:00.000Z',source:'server'},provider=vi.fn(async()=>teamPolicy),attention=vi.fn(),native=bridge();await new ClipboardScanController(native,provider,attention,vi.fn()).enqueue();expect(provider).toHaveBeenCalledWith();const candidate=attention.mock.calls[0][0];expect(candidate.policy.version).toBe(5);expect(candidate.findings[0].policyAction).toBe('WARN');expect(candidate.findings[0].selected).toBe(false)})});