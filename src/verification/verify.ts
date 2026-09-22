import type { Finding } from '../types';
import { verifySelected } from '../detection/detect';

export type VerificationReport={checks:Array<{finding:Finding;passed:boolean}>;unresolved:Finding[];reviewCount:number;ready:boolean};
export function selectProtectable(findings:Finding[]):Finding[]{return findings.map(f=>({...f,selected:f.severity!=='INFO'}));}
export function verifyImage(selectedOriginal:Finding[],rescanned:Finding[]):VerificationReport{
  const checks=verifySelected(selectedOriginal.filter(f=>f.source!=='metadata'),rescanned);
  for(const finding of selectedOriginal.filter(f=>f.selected&&f.source==='metadata'))checks.push({finding,passed:!rescanned.some(r=>r.source==='metadata'&&r.type===finding.type)});
  const unresolved=rescanned.filter(f=>f.severity==='CRITICAL'||f.severity==='SENSITIVE');
  return {checks,unresolved,reviewCount:rescanned.filter(f=>f.severity==='REVIEW'||f.severity==='INFO').length,ready:checks.every(check=>check.passed)&&unresolved.length===0};
}
