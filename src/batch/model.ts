import type { Finding } from '../types';
import type { Policy, PolicyAction } from '../policy/types';
import { actionForFinding, applyPolicy } from '../policy/evaluatePolicy';
import type { VerificationReport } from '../verification/verify';

export type BatchStatus='waiting'|'scanning'|'needs-protection'|'needs-review'|'no-findings'|'awaiting-review'|'protecting'|'verifying'|'ready'|'failed';
export type BatchItem={
  id:string; file:File; previewUrl:string; width:number; height:number; revision:number;
  status:BatchStatus; findings:Finding[]; outputBlob:Blob|null; outputUrl:string;
  verification:VerificationReport|null; verifiedFindings:Finding[]; approvedOutput:Blob|null; error:string;
};

let fallbackId=0;
export function createBatchId():string{return globalThis.crypto?.randomUUID?.()??`batch-${Date.now()}-${++fallbackId}`;}
export function createBatchItem(file:File,previewUrl:string,width:number,height:number):BatchItem{return{id:createBatchId(),file,previewUrl,width,height,revision:0,status:'waiting',findings:[],outputBlob:null,outputUrl:'',verification:null,verifiedFindings:[],approvedOutput:null,error:''};}
export function policyCounts(item:BatchItem,policy:Policy):Record<PolicyAction,number>{return item.findings.reduce<Record<PolicyAction,number>>((counts,finding)=>{counts[actionForFinding(finding,policy)]++;return counts;},{BLOCK:0,PROTECT:0,WARN:0,ALLOW:0});}
export function statusAfterScan(findings:Finding[],policy:Policy):BatchStatus{const evaluated=applyPolicy(findings,policy);return evaluated.some(f=>f.selected)?'needs-protection':evaluated.some(f=>actionForFinding(f,policy)==='WARN')?'needs-review':'no-findings';}
export function reevaluateItem(item:BatchItem,policy:Policy):BatchItem{return{...item,revision:item.revision+1,status:item.status==='failed'?'failed':item.status==='waiting'?'waiting':statusAfterScan(item.findings,policy),findings:applyPolicy(item.findings,policy),outputBlob:null,outputUrl:'',verification:null,verifiedFindings:[],approvedOutput:null,error:''};}
export function batchSummary(items:BatchItem[],policy:Policy){let findings=0,warnings=0,ready=0,noAction=0,attention=0;for(const item of items){findings+=item.findings.length;warnings+=policyCounts(item,policy).WARN;if(item.status==='ready')ready++;else if(item.status==='no-findings')noAction++;else attention++;}return{total:items.length,ready,noAction,attention,findings,warnings};}
export function safeOutputNames(items:BatchItem[]):Map<string,string>{const used=new Map<string,number>(),result=new Map<string,string>();for(const item of items){const base=(item.file.name.replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]/gi,'-').replace(/^-+|-+$/g,'')||'image')+'-safeshare';const number=(used.get(base.toLowerCase())??0)+1;used.set(base.toLowerCase(),number);result.set(item.id,`${base}${number===1?'':`-${number}`}.png`);}return result;}

export function isReleaseEligible(item:BatchItem):boolean{return item.status==='ready'&&!!item.outputBlob&&item.approvedOutput===item.outputBlob&&item.verification?.ready===true;}
