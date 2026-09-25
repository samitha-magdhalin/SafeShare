import { describe, expect, it } from 'vitest';
import type { Finding } from '../types';
import { actionForFinding, applyPolicy, categoryForFinding } from '../policy/evaluatePolicy';
import { CUSTOM_POLICY_STORAGE_KEY, DEFAULT_CUSTOM_POLICY, DEFAULT_PROFILE_ID, PROFILES, loadCustomPolicy, saveCustomPolicy } from '../policy/profiles';
import type { Policy } from '../policy/types';
import { verifyImage } from '../verification/verify';

function finding(type:string,severity:Finding['severity']='SENSITIVE',overrides:Partial<Finding>={}):Finding{return{id:type,type,category:'personal',severity,confidence:100,maskedPreview:'hidden',source:'ocr',description:'test',selected:false,...overrides};}
const cases:[string,Finding,keyof typeof PROFILES,ReturnType<typeof actionForFinding>][]=[
  ['Client API Key',finding('API Key','CRITICAL',{category:'secret'}),'client','BLOCK'],
  ['Client Email',finding('Email'),'client','PROTECT'],
  ['Client Internal URL',finding('Internal URL','SENSITIVE',{category:'network'}),'client','PROTECT'],
  ['Client Public URL',finding('Public URL','INFO',{category:'network'}),'client','ALLOW'],
  ['QA credential',finding('Password','CRITICAL',{category:'secret'}),'qa','BLOCK'],
  ['QA Internal URL',finding('Internal URL','SENSITIVE',{category:'network'}),'qa','WARN'],
  ['AI Internal IP',finding('Internal IP','SENSITIVE',{category:'network'}),'ai','PROTECT'],
  ['AI Public URL',finding('Public URL','INFO',{category:'network'}),'ai','WARN'],
  ['Public Internal URL',finding('Internal URL','SENSITIVE',{category:'network'}),'public','PROTECT'],
  ['Public QR',finding('QR code','REVIEW',{category:'qr',source:'qr'}),'public','PROTECT'],
];
describe('sharing profile policies',()=>{
  it('uses Client Sharing by default',()=>expect(DEFAULT_PROFILE_ID).toBe('client'));
  it.each(cases)('%s resolves to %s',(_label,item,profile,expected)=>expect(actionForFinding(item,PROFILES[profile].policy)).toBe(expected));
  it('maps credential-bearing database connections to credentials',()=>expect(categoryForFinding(finding('Database Connection String','CRITICAL',{category:'secret'}))).toBe('credentials'));
  it('defaults unknown detector types to WARN',()=>expect(actionForFinding(finding('Future Detector Type'),PROFILES.client.policy)).toBe('WARN'));
  it('Protect All selection includes BLOCK and PROTECT but excludes WARN and ALLOW',()=>{
    const evaluated=applyPolicy([finding('API Key','CRITICAL',{category:'secret'}),finding('Email'),finding('QR code','REVIEW',{category:'qr',source:'qr'}),finding('Public URL','INFO',{category:'network'})],PROFILES.client.policy);
    expect(evaluated.map(item=>[item.policyAction,item.selected])).toEqual([['BLOCK',true],['PROTECT',true],['WARN',false],['ALLOW',false]]);
  });
  it('remaining BLOCK and PROTECT findings prevent Ready to Share',()=>{
    expect(verifyImage([], [finding('API Key','CRITICAL',{category:'secret'})],PROFILES.client.policy).ready).toBe(false);
    expect(verifyImage([], [finding('Internal URL','SENSITIVE',{category:'network'})],PROFILES.client.policy).ready).toBe(false);
  });
  it('remaining WARN findings do not prevent QA Ready to Share',()=>{
    const report=verifyImage([], [finding('Internal URL','SENSITIVE',{category:'network'})],PROFILES.qa.policy);
    expect(report.ready).toBe(true);expect(report.reviewCount).toBe(1);expect(report.unresolved).toHaveLength(0);
  });
  it('remaining ALLOW findings do not prevent Ready to Share',()=>{
    const report=verifyImage([], [finding('Public URL','INFO',{category:'network'})],PROFILES.client.policy);
    expect(report.ready).toBe(true);expect(report.reviewCount).toBe(0);expect(report.unresolved).toHaveLength(0);
  });
  it('custom actions change finding selection and eligibility',()=>{
    const policy:Policy={...DEFAULT_CUSTOM_POLICY,internalUrl:'BLOCK'};
    expect(applyPolicy([finding('Internal URL','SENSITIVE',{category:'network'})],policy)[0].selected).toBe(true);
    expect(verifyImage([], [finding('Internal URL','SENSITIVE',{category:'network'})],policy).ready).toBe(false);
  });
  it('persists only validated custom policy configuration',()=>{
    let savedKey='',savedValue='';const storage={getItem:()=>null,setItem:(key:string,value:string)=>{savedKey=key;savedValue=value}};
    saveCustomPolicy(DEFAULT_CUSTOM_POLICY,storage);
    expect(savedKey).toBe(CUSTOM_POLICY_STORAGE_KEY);expect(JSON.parse(savedValue)).toEqual(DEFAULT_CUSTOM_POLICY);expect(savedValue).not.toContain('maskedPreview');
  });
  it('loads valid custom policy and safely rejects corrupted or incomplete data',()=>{
    expect(loadCustomPolicy({getItem:()=>JSON.stringify({...DEFAULT_CUSTOM_POLICY,email:'WARN'})}).email).toBe('WARN');
    expect(loadCustomPolicy({getItem:()=>'{broken'})).toEqual(DEFAULT_CUSTOM_POLICY);
    expect(loadCustomPolicy({getItem:()=>JSON.stringify({credentials:'ALLOW'})})).toEqual(DEFAULT_CUSTOM_POLICY);
  });
});
