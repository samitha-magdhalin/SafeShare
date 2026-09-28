import { describe,it,expect } from 'vitest';
import { boxForSpan,detectText,isPrivateIp,mask,riskLevel,verifySelected } from '../detection/detect';
import { protectionRect, sampleBackground } from '../utils/image';
import { verifyImage } from '../verification/verify';
describe('detection',()=>{
  it('detects and masks email',()=>{const f=detectText('demo.user@example.com')[0];expect(f.type).toBe('Email');expect(f.maskedPreview).toBe('d***@example.com');expect(f.severity).toBe('SENSITIVE')});
  function emailGeometry(fragments:string[],gaps:number[]){
    let x=10;
    const words=fragments.map((text,index)=>{
      const box={x,y:20,width:text.length*9,height:18};
      x+=box.width+(gaps[index]??0);
      return{text,confidence:94,box,symbols:[...text].map((char,symbol)=>({text:char,box:{x:box.x+symbol*9,y:20,width:9,height:18}}))};
    });
    const findings=detectText(fragments.join(' '),words);
    return{email:findings.find(finding=>finding.type==='Email')!,words,findings};
  }
  it.each([
    ['contiguous',['CUSTOMER_EMAIL=ananya.demo@example.com','STATUS'],[18]],
    ['split before at sign',['CUSTOMER_EMAIL=ananya.demo','@example.com','STATUS'],[1,18]],
    ['split after at sign',['CUSTOMER_EMAIL=ananya.demo@','example.com','STATUS'],[1,18]],
    ['split around domain dot',['CUSTOMER_EMAIL=ananya.demo@example','.','com','STATUS'],[1,1,18]],
    ['multiple arbitrary fragments',['CUSTOMER_EMAIL=ananya','.demo','@','example','.','com','STATUS'],[1,1,1,1,1,18]],
    ['overlapping fragments',['CUSTOMER_EMAIL=ananya.demo','@example','.com','STATUS'],[-12,-4,18]]
  ])('reconstructs a %s OCR email and maps its complete geometry',(_name,fragments,gaps)=>{
    const {email,words,findings}=emailGeometry(fragments as string[],gaps as number[]);
    const lastEmailWord=words[words.length-2],neighbor=words[words.length-1];
    expect(findings.filter(finding=>finding.type==='Email')).toHaveLength(1);
    expect(email.box?.x).toBe(145);
    expect(email.box!.x+email.box!.width).toBe(lastEmailWord.box.x+lastEmailWord.box.width);
    const rect=protectionRect(email.box!,neighbor.box.x+neighbor.box.width,80)!;
    expect(rect.x).toBeGreaterThan(130);
    expect(rect.x+rect.width).toBeLessThan(neighbor.box.x);
  });
  it('does not merge an unrelated neighboring word into reconstructed email geometry',()=>{
    const {email,words}=emailGeometry(['CUSTOMER_EMAIL=ananya.demo','@example','.com','STATUS'],[1,1,1]);
    expect(email.box!.x+email.box!.width).toBe(words[2].box.x+words[2].box.width);
    expect(email.box!.x+email.box!.width).toBeLessThan(words[3].box.x);
  });
  it('keeps fresh verification strict for a fragmented email remainder',()=>{
    const {findings}=emailGeometry(['CUSTOMER_EMAIL=ananya.demo','@example','.com'],[1,1]);
    expect(verifyImage(findings,detectText('CUSTOMER_EMAIL=demo@example.com')).ready).toBe(false);
    expect(verifyImage(findings,detectText('CUSTOMER_EMAIL=')).ready).toBe(true);
  });
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
  function credentialGeometry(fragments:string[],gaps:number[]){
    let x=10;
    const words=fragments.map((text,index)=>{
      const box={x,y:30,width:text.length*10,height:20};
      x+=box.width+(gaps[index]??0);
      return{text,confidence:95,box,symbols:index===0?[...text].map((char,symbol)=>({text:char,box:{x:box.x+symbol*10,y:30,width:10,height:20}})):undefined};
    });
    const findings=detectText(fragments.join(' '),words);
    return{credential:findings.find(finding=>finding.type==='API Key')!,words,findings};
  }
  it.each([
    ['one OCR word',['API_KEY=sk_test_safeshare_8H2K9M4P7Q','STATUS'],[20]],
    ['two spatially continuous OCR fragments',['API_KEY=sk_testsafe','share_8H2K9M4P7Q','STATUS'],[1,20]],
    ['three arbitrary spatially continuous OCR fragments',['API_KEY=skte','stsaf','eshare_8H2K9M4P7Q','STATUS'],[1,1,20]],
    ['overlapping OCR fragment boxes',['API_KEY=skte','stsaf','eshare_8H2K9M4P7Q','STATUS'],[-30,1,20]],
    ['three connector-separated OCR fragments',['API_KEY=sk_','test_','safeshare_8H2K9M4P7Q','STATUS'],[2,2,20]],
    ['one long underscore-separated OCR word',['API_KEY=sk_test_safe_share_long_token_8H2K9M4P7Q','STATUS'],[20]],
    ['connector before a spatially separate neighbor',['API_KEY=sk_test_','STATUS'],[20]]
  ])('covers the complete credential for %s and excludes neighboring text',(_name,fragments,gaps)=>{
    const {credential,words,findings}=credentialGeometry(fragments as string[],gaps as number[]);
    const lastCredentialWord=words[words.length-2];
    const neighbor=words[words.length-1];

    expect(findings.filter(finding=>finding.category==='secret')).toHaveLength(1);
    expect(credential.box?.x).toBe(90);
    expect(credential.box!.x+credential.box!.width).toBe(lastCredentialWord.box.x+lastCredentialWord.box.width);
    const rect=protectionRect(credential.box!,neighbor.box.x+neighbor.box.width,100)!;
    expect(rect.x).toBeGreaterThan(80);
    expect(rect.x+rect.width).toBeLessThan(neighbor.box.x);
  });
  it('uses a credential-only conservative fallback for an ambiguous nearby OCR word',()=>{
    const {credential,words}=credentialGeometry(['API_KEY=sk_test_value','CONTEXT'],[8]);
    const context=words[1];
    expect(credential.box!.x+credential.box!.width).toBe(context.box.x+context.box.width);
  });
  it('stops conservative credential geometry at another key/value field even with a tiny gap',()=>{
    const {credential,words}=credentialGeometry(['API_KEY=sk_test_value','NEXT_FIELD=value'],[2]);
    expect(credential.box!.x+credential.box!.width).toBe(words[0].box.x+words[0].box.width);
  });
  it('covers an end-of-line credential across inconsistent OCR box widths',()=>{
    const words=[
      {text:'API_KEY=skte',confidence:91,box:{x:10,y:30,width:150,height:22}},
      {text:'stsaf',confidence:88,box:{x:154,y:31,width:35,height:18}},
      {text:'eshare_8H2K9M4P7Q',confidence:93,box:{x:191,y:29,width:260,height:25}}
    ];
    const credential=detectText(words.map(word=>word.text).join(' '),words).find(finding=>finding.type==='API Key')!;
    expect(credential.box!.x).toBeGreaterThan(10);
    expect(credential.box!.x+credential.box!.width).toBe(451);
  });
  it('keeps strict fresh verification for partial and complete credential removal',()=>{
    const {findings}=credentialGeometry(['API_KEY=skte','stsaf','eshare_8H2K9M4P7Q','STATUS'],[1,1,20]);
    expect(verifyImage(findings,detectText('API_KEY=safeshare_8H2K9M4P7Q')).ready).toBe(false);
    expect(verifyImage(findings,detectText('API_KEY=')).ready).toBe(true);
  });
  it('samples a uniform local background and rejects mixed surroundings',()=>{
    const data=new Uint8ClampedArray(40*40*4);
    for(let i=0;i<data.length;i+=4){data[i]=248;data[i+1]=250;data[i+2]=249;data[i+3]=255;}
    expect(sampleBackground(data,40,40,{x:10,y:15,width:20,height:8})).toBe('rgb(248, 250, 249)');
    for(let y=7;y<12;y++)for(let x=10;x<30;x++)data[(y*40+x)*4]=20;
    expect(sampleBackground(data,40,40,{x:10,y:15,width:20,height:8})).toBeNull();
  });
});
