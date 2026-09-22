import { describe,it,expect } from 'vitest';
import { boxForSpan,detectText,isPrivateIp,mask,riskLevel,verifySelected } from '../detection/detect';
import { protectionRect, sampleBackground } from '../utils/image';
describe('detection',()=>{
  it('detects and masks email',()=>{const f=detectText('demo.user@example.com')[0];expect(f.type).toBe('Email');expect(f.maskedPreview).toBe('d***@example.com');expect(f.severity).toBe('SENSITIVE')});
  it('detects Indian numbers and rejects short numbers',()=>{expect(detectText('+91 9876543210')[0].type).toBe('Phone');expect(detectText('12345')).toHaveLength(0);expect(mask('Phone','9876543210')).toBe('••••••3210')});
  it('classifies valid private addresses',()=>{expect(isPrivateIp('192.168.1.25')).toBe(true);expect(isPrivateIp('8.8.8.8')).toBe(false);expect(detectText('999.999.1.1')).toHaveLength(0);expect(detectText('192.168.1.25')[0].severity).toBe('SENSITIVE')});
  it('distinguishes internal and public URLs',()=>{expect(detectText('http://192.168.1.25/admin').some(f=>f.type==='Internal URL')).toBe(true);expect(detectText('https://example.com')[0].severity).toBe('INFO')});
  it('requires credential assignment and masks its value',()=>{expect(detectText('password')).toHaveLength(0);const f=detectText('API_KEY=sk_test_FAKE_123456')[0];expect(f.severity).toBe('CRITICAL');expect(f.maskedPreview).not.toContain('FAKE_123456');expect(detectText('PASSWORD=placeholder')).toHaveLength(0)});
  it('maps risk categories and verifies selected fingerprint',()=>{const f=detectText('demo@example.com')[0];expect(riskLevel([f])).toBe('ELEVATED');expect(verifySelected([f],[])[0].passed).toBe(true);expect(verifySelected([f],detectText('demo@example.com'))[0].passed).toBe(false)});
  it('uses symbol coordinates for a value inside one OCR token',()=>{
    const text='KEY=secret';
    const symbols=[...text].map((char,index)=>({text:char,box:{x:20+index*10,y:30,width:10,height:20}}));
    const box=boxForSpan(4,10,[{text,confidence:95,box:{x:20,y:30,width:100,height:20},symbols,start:0,end:10}]);
    expect(box).toEqual({x:60,y:30,width:60,height:20});
    expect(protectionRect(box!,200,100)).toEqual({x:58,y:28,width:64,height:24});
  });
  it('samples a uniform local background and rejects mixed surroundings',()=>{
    const data=new Uint8ClampedArray(40*40*4);
    for(let i=0;i<data.length;i+=4){data[i]=248;data[i+1]=250;data[i+2]=249;data[i+3]=255;}
    expect(sampleBackground(data,40,40,{x:10,y:15,width:20,height:8})).toBe('rgb(248, 250, 249)');
    for(let y=7;y<12;y++)for(let x=10;x<30;x++)data[(y*40+x)*4]=20;
    expect(sampleBackground(data,40,40,{x:10,y:15,width:20,height:8})).toBeNull();
  });
});
