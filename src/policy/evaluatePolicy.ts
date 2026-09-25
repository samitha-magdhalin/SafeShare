import type { Finding } from '../types';
import type { NormalizedPolicyCategory, Policy, PolicyAction } from './types';

const CREDENTIAL_TYPES=new Set(['api key','access token','api token','bearer token','password','aws access key','aws secret access key','secret','generic credential','credential-bearing url']);
export type PolicyFinding=Finding&{policyCategory:NormalizedPolicyCategory;policyAction:PolicyAction};
export type PolicySummary={protect:number;warn:number;allow:number};

export function categoryForFinding(finding:Finding):NormalizedPolicyCategory{
  const type=finding.type.trim().toLowerCase();
  if(type==='database connection string')return finding.severity==='CRITICAL'?'credentials':'unknown';
  if(CREDENTIAL_TYPES.has(type)||finding.category==='secret')return 'credentials';
  if(type==='email')return 'email';
  if(type==='phone')return 'phone';
  if(type==='internal ip')return 'internalIp';
  if(type==='internal url')return 'internalUrl';
  if(type==='public url'||type==='public ip')return 'publicUrl';
  if(finding.source==='qr'||finding.category==='qr'||type==='qr code')return 'qr';
  if(finding.source==='metadata'||finding.category==='metadata'||type.endsWith(' metadata'))return 'metadata';
  return 'unknown';
}
export function actionForFinding(finding:Finding,policy:Policy):PolicyAction{
  const category=categoryForFinding(finding);
  return category==='unknown'?'WARN':policy[category];
}
export function applyPolicy(findings:Finding[],policy:Policy):PolicyFinding[]{
  return findings.map(finding=>{const policyCategory=categoryForFinding(finding),policyAction=policyCategory==='unknown'?'WARN':policy[policyCategory];return{...finding,policyCategory,policyAction,selected:policyAction==='BLOCK'||policyAction==='PROTECT'};});
}
export function selectRequired(findings:Finding[],policy:Policy):PolicyFinding[]{return applyPolicy(findings,policy);}
export function summarizePolicy(findings:Finding[],policy:Policy):PolicySummary{
  return findings.reduce<PolicySummary>((summary,finding)=>{const action=actionForFinding(finding,policy);if(action==='BLOCK'||action==='PROTECT')summary.protect++;else if(action==='WARN')summary.warn++;else summary.allow++;return summary;},{protect:0,warn:0,allow:0});
}

