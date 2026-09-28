import type { Box, Finding, Severity, Word } from '../types';

export function isPrivateIp(ip:string):boolean {
  const n=ip.split('.').map(Number);
  return n.length===4&&n.every(x=>x>=0&&x<=255)&&(n[0]===10||n[0]===127||n[0]===0||(n[0]===192&&n[1]===168)||(n[0]===172&&n[1]>=16&&n[1]<=31)||(n[0]===169&&n[1]===254));
}
export function mask(type:string,value:string):string {
  if(type==='Email'){const [name,domain]=value.split('@');return `${name[0]}***@${domain}`;}
  if(type==='Phone')return `••••••${value.replace(/\D/g,'').slice(-4)}`;
  if(type==='Database Connection String')return `${value.split(':')[0]}://••••`;
  if(['API Key','API Token','Access Token','Bearer Token','Password','AWS Access Key','AWS Secret Access Key','Secret','Generic Credential'].includes(type))return `${value.slice(0,Math.min(4,value.length))}••••${value.slice(-2)}`;
  if(type==='Internal IP')return value.replace(/\.\d+$/,'.•••');
  if(type==='Internal URL'||type==='Public URL'){try{const url=new URL(value);return `${url.protocol}//${url.hostname}/…`;}catch{return 'URL detected';}}
  return 'Content hidden';
}
export function riskLevel(findings:Finding[]):'HIGH'|'ELEVATED'|'LOW'{
  if(findings.some(f=>f.severity==='CRITICAL'))return 'HIGH';
  if(findings.some(f=>f.severity==='SENSITIVE'||f.severity==='REVIEW'))return 'ELEVATED';
  return 'LOW';
}
function fingerprint(value:string):string{let h=2166136261;for(const c of value.toLowerCase()){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16);}
type Match={type:string;category:Finding['category'];severity:Severity;value:string;start:number;end:number;boxStart?:number;boxEnd?:number;description:string};
const add=(list:Match[],match:Omit<Match,'start'|'end'>,start:number,end:number)=>list.push({...match,start,end});
const secretKeys='AWS\\s*[_-]?\\s*SECRET\\s*[_-]?\\s*ACCESS\\s*[_-]?\\s*KEY|AWS\\s*[_-]?\\s*ACCESS\\s*[_-]?\\s*KEY\\s*[_-]?\\s*ID|DATABASE\\s*[_-]?\\s*URL|API\\s*[_-]?\\s*TOKEN|API\\s*[_-]?\\s*KEY|APIKEY|ACCESS\\s*[_-]?\\s*TOKEN|AUTH\\s*[_-]?\\s*TOKEN|SECRET\\s*[_-]?\\s*KEY|PRIVATE\\s*[_-]?\\s*KEY|PASSWORD|PASSWD|TOKEN|SECRET';
const secretRe=new RegExp(`\\b(${secretKeys})(\\s*[:=]\\s*|\\s+)["']?([^\\s"']{2,}(?:\\s+[A-Za-z0-9._~+/-]{2,})*)`,'gi');
const databaseRe=/\b(?:postgresql|postgres|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s<>"']+/gi;
const urlRe=/\bhttps?:\/\/[^\s<>"']+/gi;
const emailRe=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phoneRe=/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
const ipRe=/\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const bearerRe=/\b(?:Authorization\s*:\s*)?Bearer\s+([A-Za-z0-9._~+/-]{6,})/gi;
function credentialType(key:string):string{
  const normalized=key.toUpperCase().replace(/[^A-Z]/g,'');
  if(normalized==='AWSACCESSKEYID')return 'AWS Access Key';
  if(normalized==='AWSSECRETACCESSKEY')return 'AWS Secret Access Key';
  if(normalized==='DATABASEURL')return 'Database Connection String';
  if(normalized==='APITOKEN')return 'API Token';
  if(normalized==='ACCESSTOKEN'||normalized==='AUTHTOKEN'||normalized==='TOKEN')return 'Access Token';
  if(normalized==='APIKEY')return 'API Key';
  if(normalized==='PASSWORD'||normalized==='PASSWD')return 'Password';
  if(normalized.startsWith('SECRET')||normalized==='PRIVATEKEY')return 'Secret';
  return 'Generic Credential';
}
function validCredential(value:string,delimiter:string):boolean{
  if(value.length<6)return false;
  if(/^(?:example|placeholder|your[_-]?|<|\*|x{6,}|\.{3,}|changeme|redacted)$/i.test(value))return false;
  if(!/[:=]/.test(delimiter)&&!/[0-9_+./-]/.test(value)&&value.length<16)return false;
  return true;
}
type PositionedWord=Word&{start:number;end:number};
function spatiallyContinuous(leftStart:number,leftEnd:number,rightStart:number,rightEnd:number,words:PositionedWord[]):boolean{
  const left=[...words].reverse().find(word=>word.end>leftStart&&word.start<leftEnd);
  const right=words.find(word=>word.end>rightStart&&word.start<rightEnd);
  if(!left||!right||left===right)return false;
  const verticalOverlap=Math.min(left.box.y+left.box.height,right.box.y+right.box.height)-Math.max(left.box.y,right.box.y);
  if(verticalOverlap<Math.min(left.box.height,right.box.height)*.5)return false;
  const gap=right.box.x-(left.box.x+left.box.width);
  const averageCharacterWidth=Math.min(left.box.width/Math.max(1,left.text.length),right.box.width/Math.max(1,right.text.length));
  const maximumTokenGap=Math.max(2,Math.min(Math.min(left.box.height,right.box.height)*.35,averageCharacterWidth*.75));
  return gap<=maximumTokenGap;
}
function emailWordsContinuous(left:PositionedWord,right:PositionedWord):boolean{
  const verticalOverlap=Math.min(left.box.y+left.box.height,right.box.y+right.box.height)-Math.max(left.box.y,right.box.y);
  if(verticalOverlap<Math.min(left.box.height,right.box.height)*.5)return false;
  const gap=right.box.x-(left.box.x+left.box.width);
  const characterWidth=Math.max(left.box.width/Math.max(1,left.text.length),right.box.width/Math.max(1,right.text.length));
  const maximumEmailGap=Math.max(3,Math.min(Math.min(left.box.height,right.box.height)*.6,characterWidth));
  return gap<=maximumEmailGap;
}
function reconstructedEmails(words:PositionedWord[]):Match[]{
  const runs:PositionedWord[][]=[];
  for(const word of words){
    const run=runs[runs.length-1];
    if(run&&emailWordsContinuous(run[run.length-1],word))run.push(word);else runs.push([word]);
  }
  const matches:Match[]=[];
  for(const run of runs){
    let compact='';
    const positions:Array<{word:PositionedWord;compactStart:number;compactEnd:number}>=[];
    const seenStarts=new Set<number>();
    for(const word of run){
      const compactStart=compact.length;compact+=word.text;
      positions.push({word,compactStart,compactEnd:compact.length});
      const re=new RegExp(emailRe.source,'gi');
      let match:RegExpExecArray|null;
      while((match=re.exec(compact))){
        const compactStartIndex=match.index,compactEndIndex=match.index+match[0].length;
        const first=positions.find(position=>position.compactEnd>compactStartIndex);
        const last=[...positions].reverse().find(position=>position.compactStart<compactEndIndex);
        if(!first||!last)continue;
        const start=first.word.start+compactStartIndex-first.compactStart;
        if(seenStarts.has(start))continue;
        const end=last.word.start+compactEndIndex-last.compactStart;
        seenStarts.add(start);
        matches.push({type:'Email',category:'personal',severity:'SENSITIVE',value:match[0],start,end,description:'Email address visible in the image.'});
      }
    }
  }
  return matches;
}
function beginsIndependentField(index:number,words:PositionedWord[]):boolean{
  const lookahead=words.slice(index,index+3).map(word=>word.text).join('');
  return /^[A-Za-z][A-Za-z0-9_-]{1,40}\s*[:=]/.test(lookahead);
}
function credentialProtectionEnd(valueStart:number,detectedEnd:number,words:PositionedWord[]):number{
  if(!words.length)return detectedEnd;
  let lastIndex=-1;
  for(let index=0;index<words.length;index++)if(words[index].end>valueStart&&words[index].start<detectedEnd)lastIndex=index;
  if(lastIndex<0)return detectedEnd;
  let end=Math.max(detectedEnd,words[lastIndex].end);
  for(let index=lastIndex+1;index<words.length;index++){
    const previous=words[index-1],current=words[index];
    if(beginsIndependentField(index,words)||/^[|;,]+$/.test(current.text))break;
    const verticalOverlap=Math.min(previous.box.y+previous.box.height,current.box.y+current.box.height)-Math.max(previous.box.y,current.box.y);
    if(verticalOverlap<Math.min(previous.box.height,current.box.height)*.35)break;
    const gap=current.box.x-(previous.box.x+previous.box.width);
    const characterWidth=Math.max(previous.box.width/Math.max(1,previous.text.length),current.box.width/Math.max(1,current.text.length));
    const maximumRunGap=Math.max(4,Math.min(Math.min(previous.box.height,current.box.height)*.9,characterWidth*1.25));
    if(gap>maximumRunGap)break;
    end=current.end;
  }
  return end;
}
function credentialValue(raw:string,start:number,words:PositionedWord[]):string{
  const parts=[...raw.matchAll(/\S+/g)].map(match=>({text:match[0],start:start+match.index!,end:start+match.index!+match[0].length}));
  let count=1;
  while(count<parts.length){
    const previous=parts[count-1],current=parts[count];
    const currentWordIndex=words.findIndex(word=>word.end>current.start&&word.start<current.end);
    if(currentWordIndex>=0&&beginsIndependentField(currentWordIndex,words))break;
    const connectorSplit=/[_./-]$/.test(previous.text);
    const continues=words.length>0
      ? spatiallyContinuous(previous.start,previous.end,current.start,current.end,words)
      : connectorSplit;
    if(!continues)break;
    count++;
  }
  return parts.slice(0,count).map(part=>part.text).join(' ');
}
function union(boxes:Box[]):Box|undefined{if(!boxes.length)return;const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return{x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};}
export function boxForSpan(start:number,end:number,words:Array<Word&{start:number;end:number}>):Box|undefined{
  const boxes:Box[]=[];
  for(const word of words){
    if(word.end<=start||word.start>=end||!word.text.length)continue;
    if(word.symbols?.length&&word.symbols.map(s=>s.text).join('')===word.text){let offset=word.start;for(const symbol of word.symbols){const next=offset+symbol.text.length;if(next>start&&offset<end)boxes.push(symbol.box);offset=next;}continue;}
    const left=Math.max(0,start-word.start)/word.text.length,right=Math.min(word.text.length,end-word.start)/word.text.length;
    boxes.push({x:word.box.x+word.box.width*left,y:word.box.y,width:word.box.width*(right-left),height:word.box.height});
  }
  return union(boxes);
}
export function detectText(text:string,words:Word[]=[]):Finding[]{
  let cursor=0;const spans=words.map(word=>{const at=text.indexOf(word.text,cursor),start=at<0?cursor:at;cursor=start+word.text.length;return{...word,start,end:cursor};});
  const found:Match[]=[];
  for(const re of [secretRe,bearerRe,databaseRe,urlRe,emailRe,phoneRe,ipRe])re.lastIndex=0;
  let m:RegExpExecArray|null;
  while((m=secretRe.exec(text))){const key=m[1],delimiter=m[2],start=m.index+m[0].lastIndexOf(m[3]),value=credentialValue(m[3],start,spans);if(!validCredential(value,delimiter))continue;const type=credentialType(key),end=start+value.length,boxEnd=credentialProtectionEnd(start,end,spans);add(found,{type,category:'secret',severity:'CRITICAL',value,boxStart:start,boxEnd,description:type==='Database Connection String'?'Database connection string with potential credentials.':'Potential credential assignment visible.'},start,end);}
  while((m=bearerRe.exec(text))){const value=m[1],start=m.index+m[0].lastIndexOf(value);add(found,{type:'Bearer Token',category:'secret',severity:'CRITICAL',value,description:'Authorization bearer token visible.'},start,start+value.length);}
  while((m=databaseRe.exec(text))){const value=m[0].replace(/[),.;]+$/,''),assigned=found.some(f=>f.start<=m!.index&&f.end>=m!.index+value.length&&f.category==='secret');if(assigned)continue;const embedded=/^[a-z+]+:\/\/[^/@\s]+:[^/@\s]+@/i.test(value);add(found,{type:'Database Connection String',category:'secret',severity:embedded?'CRITICAL':'REVIEW',value,description:embedded?'Database connection string with embedded credentials.':'Database connection string needs review.'},m.index,m.index+value.length);}
  while((m=urlRe.exec(text))){const value=m[0].replace(/[),.;]+$/,'');try{const url=new URL(value),host=url.hostname,credential=Boolean(url.username||url.password),internal=host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||isPrivateIp(host);add(found,{type:credential?'Credential-bearing URL':internal?'Internal URL':'Public URL',category:credential?'secret':'network',severity:credential?'CRITICAL':internal?'SENSITIVE':'INFO',value,description:credential?'URL contains embedded credentials.':internal?'Internal destination visible.':'Public website URL visible.'},m.index,m.index+value.length);}catch{/* malformed URL is not a finding */}}
  if(spans.length)found.push(...reconstructedEmails(spans));else while((m=emailRe.exec(text)))add(found,{type:'Email',category:'personal',severity:'SENSITIVE',value:m[0],description:'Email address visible in the image.'},m.index,m.index+m[0].length);
  while((m=phoneRe.exec(text))){if(/\d/.test(text[m.index-1]||''))continue;add(found,{type:'Phone',category:'personal',severity:'SENSITIVE',value:m[0],description:'Indian mobile number visible in the image.'},m.index,m.index+m[0].length);}
  while((m=ipRe.exec(text))){if(m[0].split('.').some(part=>Number(part)>255))continue;const internal=isPrivateIp(m[0]);add(found,{type:internal?'Internal IP':'Public IP',category:'network',severity:internal?'SENSITIVE':'INFO',value:m[0],description:internal?'Private or local network address visible.':'Public IP address visible.'},m.index,m.index+m[0].length);}
  const priority=(f:Match)=>f.category==='secret'?3:f.type==='Internal URL'?2:1;
  const sorted=found.sort((a,b)=>a.start-b.start||priority(b)-priority(a)||b.end-a.end);
  const deduped=sorted.filter((f,i)=>!sorted.some((other,j)=>j!==i&&other.start<=f.start&&other.end>=f.end&&(priority(other)>priority(f)||(priority(other)===priority(f)&&j<i))));
  return deduped.map((f,index)=>{const boxStart=f.boxStart??f.start,boxEnd=f.boxEnd??f.end,matching=spans.filter(word=>word.end>boxStart&&word.start<boxEnd);return{id:`text-${index}`,type:f.type,category:f.category,severity:f.severity,confidence:Math.round(matching.length?matching.reduce((sum,word)=>sum+word.confidence,0)/matching.length:75),box:boxForSpan(boxStart,boxEnd,spans),maskedPreview:mask(f.type,f.value),source:'ocr',description:f.description,selected:f.severity==='CRITICAL'||f.severity==='SENSITIVE',fingerprint:`${f.type}:${fingerprint(f.value)}`};});
}
export function verifySelected(original:Finding[],rescanned:Finding[]):{finding:Finding;passed:boolean}[]{
  return original.filter(f=>f.selected).map(f=>({finding:f,passed:!rescanned.some(r=>{
    if(r.fingerprint&&f.fingerprint===r.fingerprint)return true;
    if(r.type!==f.type)return false;
    if(f.source==='qr')return true;
    if(!f.box||!r.box)return true;
    return r.box.x<f.box.x+f.box.width&&r.box.x+r.box.width>f.box.x&&r.box.y<f.box.y+f.box.height&&r.box.y+r.box.height>f.box.y;
  })}));
}
