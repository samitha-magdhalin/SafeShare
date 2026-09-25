import type { Finding } from '../types';
import { verifySelected } from '../detection/detect';
import { actionForFinding } from '../policy/evaluatePolicy';
import { PROFILES } from '../policy/profiles';
import type { Policy } from '../policy/types';

export type VerificationReport={checks:Array<{finding:Finding;passed:boolean}>;unresolved:Finding[];reviewCount:number;ready:boolean};
// Retained for compatibility with existing callers. Sharing Profiles use policy selection instead.
export function selectProtectable(findings:Finding[]):Finding[]{return findings.map(f=>({...f,selected:f.severity!=='INFO'}));}
export function verifyImage(selectedOriginal:Finding[],rescanned:Finding[],policy:Policy=PROFILES.client.policy):VerificationReport{
  const checks=verifySelected(selectedOriginal.filter(f=>f.source!=='metadata'),rescanned);
  for(const finding of selectedOriginal.filter(f=>f.selected&&f.source==='metadata'))checks.push({finding,passed:!rescanned.some(r=>r.source==='metadata'&&r.type===finding.type)});
  const unresolved=rescanned.filter(f=>{const action=actionForFinding(f,policy);return action==='BLOCK'||action==='PROTECT';});
  const reviewCount=rescanned.filter(f=>actionForFinding(f,policy)==='WARN').length;
  return {checks,unresolved,reviewCount,ready:checks.every(check=>check.passed)&&unresolved.length===0};
}
