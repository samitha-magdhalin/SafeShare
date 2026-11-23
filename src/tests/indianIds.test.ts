import { describe,it,expect } from 'vitest';
import { detectText,mask } from '../detection/detect';
import { verhoeffCheckDigit } from '../detection/verhoeff';
import { categoryForFinding } from '../policy/evaluatePolicy';

function aadhaar(prefix='23456789012'){return `${prefix}${verhoeffCheckDigit(prefix)}`;}
function withBoxes(text:string){
  return detectText(text,[{text,confidence:95,box:{x:10,y:20,width:text.length*9,height:18}}]);
}

describe('Indian identifiers',()=>{
  it('detects valid Aadhaar numbers in supported formats',()=>{
    const digits=aadhaar();
    for(const value of [digits,`${digits.slice(0,4)} ${digits.slice(4,8)} ${digits.slice(8)}`,`${digits.slice(0,4)}-${digits.slice(4,8)}-${digits.slice(8)}`]){
      expect(detectText(value).some(finding=>finding.type==='Aadhaar'&&finding.severity==='CRITICAL')).toBe(true);
    }
    expect(detectText(digits.replace(/\d$/,digits.endsWith('0')?'1':'0'))).not.toContainEqual(expect.objectContaining({type:'Aadhaar'}));
  });
  it('rejects Aadhaar numbers with invalid first digits and does not also report Phone',()=>{
    for(const prefix of ['03456789012','13456789012'])expect(detectText(aadhaar(prefix))).not.toContainEqual(expect.objectContaining({type:'Aadhaar'}));
    expect(detectText(aadhaar()).filter(finding=>finding.type==='Phone')).toHaveLength(0);
    expect(detectText('+91 98765 43210').map(finding=>finding.type)).toEqual(['Phone']);
  });
  it('detects PAN and rejects invalid structures',()=>{
    expect(detectText('ABCAE1234F').some(finding=>finding.type==='PAN'&&finding.severity==='CRITICAL')).toBe(true);
    for(const value of ['ABCI E1234F','ABCDX1234F','ABCAE123F'])expect(detectText(value)).not.toContainEqual(expect.objectContaining({type:'PAN'}));
  });
  it('detects UPI IDs without turning them into Email findings',()=>{
    expect(detectText('pay.handle@oksbi').map(finding=>finding.type)).toEqual(['UPI ID']);
    expect(detectText('pay.handle@icici.com').map(finding=>finding.type)).toEqual(['UPI ID']);
    expect(detectText('user@example.com').map(finding=>finding.type)).toEqual(['Email']);
  });
  it('masks identifiers and applies their temporary policy bucket',()=>{
    expect(mask('Aadhaar',aadhaar())).toBe(`••••••••${aadhaar().slice(-4)}`);
    expect(mask('PAN','ABCAE1234F')).not.toContain('ABCAE1234F');
    expect(mask('UPI ID','pay.handle@oksbi')).toBe('••••@oksbi');
    for(const finding of detectText(`${aadhaar()} ABCDE1234F pay.handle@oksbi`))expect(categoryForFinding(finding)).toBe('email');
  });
  it('adds a box to findings when OCR words are provided',()=>{
    const finding=withBoxes(aadhaar()).find(candidate=>candidate.type==='Aadhaar');
    expect(finding?.box).toBeDefined();
  });
});

describe('standalone secret patterns',()=>{
  const cases=[
    ['AKIA1234567890ABCDEF','AWS Access Key'],
    [`ghp_${'A'.repeat(36)}`,'API Token'],
    [`github_pat_${'A'.repeat(50)}`,'API Token'],
    [`sk-${'A'.repeat(20)}`,'API Key'],
    [`xoxb-${'A'.repeat(10)}`,'API Token'],
    ['eyJabcdefgh.abcdefgh.abcdefgh','Access Token'],
    ['-----BEGIN RSA PRIVATE KEY-----','Secret']
  ];
  it.each(cases)('detects %s as a critical standalone secret', (value,type)=>{
    const finding=detectText(value).find(candidate=>candidate.type===type);
    expect(finding?.severity).toBe('CRITICAL');
  });
  it.each([
    ['AKIA1234567890ABCDE','AWS Access Key'],
    ['ghp_short','API Token'],
    ['sk-short','API Key'],
    ['xoxb-short','API Token'],
    ['eyJshort.abcdefgh.abcdefgh','Access Token'],
    ['-----BEGIN PUBLIC KEY-----','Secret']
  ])('does not detect malformed %s as %s', (value,type)=>{
    expect(detectText(value)).not.toContainEqual(expect.objectContaining({type}));
  });
  it('does not duplicate a keyword-matched token value',()=>{
    const findings=detectText(`API_KEY=sk-${'A'.repeat(20)}`).filter(finding=>finding.type==='API Key');
    expect(findings).toHaveLength(1);
  });
});
