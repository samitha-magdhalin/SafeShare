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
type Match={type:string;category:Finding['category'];severity:Severity;value:string;start:number;end:number;description:string};
const add=(list:Match[],match:Omit<Match,'start'|'end'>,start:number,end:number)=>list.push({...match,start,end});
const secretKeys='AWS\\s*[_-]?\\s*SECRET\\s*[_-]?\\s*ACCESS\\s*[_-]?\\s*KEY|AWS\\s*[_-]?\\s*ACCESS\\s*[_-]?\\s*KEY\\s*[_-]?\\s*ID|DATABASE\\s*[_-]?\\s*URL|API\\s*[_-]?\\s*TOKEN|API\\s*[_-]?\\s*KEY|APIKEY|ACCESS\\s*[_-]?\\s*TOKEN|AUTH\\s*[_-]?\\s*TOKEN|SECRET\\s*[_-]?\\s*KEY|PRIVATE\\s*[_-]?\\s*KEY|PASSWORD|PASSWD|TOKEN|SECRET';
const secretRe=new RegExp(`\\b(${secretKeys})(\\s*[:=]\\s*|\\s+)["']?([^\\s"']{2,}(?:\\s+[A-Za-z0-9._~+/-]{2,})?)`,'gi');
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
  const found:Match[]=[];
  for(const re of [secretRe,bearerRe,databaseRe,urlRe,emailRe,phoneRe,ipRe])re.lastIndex=0;
  let m:RegExpExecArray|null;
  while((m=secretRe.exec(text))){const key=m[1],delimiter=m[2],parts=m[3].split(/\s+/),value=parts[1]&&(/[_./-]$/.test(parts[0])||parts[0].length<6)?`${parts[0]} ${parts[1]}`:parts[0];if(!validCredential(value,delimiter))continue;const type=credentialType(key),start=m.index+m[0].lastIndexOf(m[3]);add(found,{type,category:'secret',severity:'CRITICAL',value,description:type==='Database Connection String'?'Database connection string with potential credentials.':'Potential credential assignment visible.'},start,start+value.length);}
  while((m=bearerRe.exec(text))){const value=m[1],start=m.index+m[0].lastIndexOf(value);add(found,{type:'Bearer Token',category:'secret',severity:'CRITICAL',value,description:'Authorization bearer token visible.'},start,start+value.length);}
  while((m=databaseRe.exec(text))){const value=m[0].replace(/[),.;]+$/,''),assigned=found.some(f=>f.start<=m!.index&&f.end>=m!.index+value.length&&f.category==='secret');if(assigned)continue;const embedded=/^[a-z+]+:\/\/[^/@\s]+:[^/@\s]+@/i.test(value);add(found,{type:'Database Connection String',category:'secret',severity:embedded?'CRITICAL':'REVIEW',value,description:embedded?'Database connection string with embedded credentials.':'Database connection string needs review.'},m.index,m.index+value.length);}
  while((m=urlRe.exec(text))){const value=m[0].replace(/[),.;]+$/,'');try{const url=new URL(value),host=url.hostname,credential=Boolean(url.username||url.password),internal=host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||isPrivateIp(host);add(found,{type:credential?'Credential-bearing URL':internal?'Internal URL':'Public URL',category:credential?'secret':'network',severity:credential?'CRITICAL':internal?'SENSITIVE':'INFO',value,description:credential?'URL contains embedded credentials.':internal?'Internal destination visible.':'Public website URL visible.'},m.index,m.index+value.length);}catch{/* malformed URL is not a finding */}}
  while((m=emailRe.exec(text)))add(found,{type:'Email',category:'personal',severity:'SENSITIVE',value:m[0],description:'Email address visible in the image.'},m.index,m.index+m[0].length);
  while((m=phoneRe.exec(text))){if(/\d/.test(text[m.index-1]||''))continue;add(found,{type:'Phone',category:'personal',severity:'SENSITIVE',value:m[0],description:'Indian mobile number visible in the image.'},m.index,m.index+m[0].length);}
  while((m=ipRe.exec(text))){if(m[0].split('.').some(part=>Number(part)>255))continue;const internal=isPrivateIp(m[0]);add(found,{type:internal?'Internal IP':'Public IP',category:'network',severity:internal?'SENSITIVE':'INFO',value:m[0],description:internal?'Private or local network address visible.':'Public IP address visible.'},m.index,m.index+m[0].length);}
  const priority=(f:Match)=>f.category==='secret'?3:f.type==='Internal URL'?2:1;
  const sorted=found.sort((a,b)=>a.start-b.start||priority(b)-priority(a)||b.end-a.end);
  const deduped=sorted.filter((f,i)=>!sorted.some((other,j)=>j!==i&&other.start<=f.start&&other.end>=f.end&&(priority(other)>priority(f)||(priority(other)===priority(f)&&j<i))));
  let cursor=0;const spans=words.map(word=>{const at=text.indexOf(word.text,cursor),start=at<0?cursor:at;cursor=start+word.text.length;return{...word,start,end:cursor};});
  return deduped.map((f,index)=>{const matching=spans.filter(word=>word.end>f.start&&word.start<f.end);return{id:`text-${index}`,type:f.type,category:f.category,severity:f.severity,confidence:Math.round(matching.length?matching.reduce((sum,word)=>sum+word.confidence,0)/matching.length:75),box:boxForSpan(f.start,f.end,spans),maskedPreview:mask(f.type,f.value),source:'ocr',description:f.description,selected:f.severity==='CRITICAL'||f.severity==='SENSITIVE',fingerprint:`${f.type}:${fingerprint(f.value)}`};});
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
