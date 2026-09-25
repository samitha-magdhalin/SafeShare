// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Finding } from '../types';
import { DEFAULT_PROFILE_STORAGE_KEY, loadPreferredProfile } from '../policy/profiles';

const controls=vi.hoisted(()=>({scan:vi.fn(),protectedBlob:new Blob(['protected'],{type:'image/png'})}));
vi.mock('../utils/image',()=>({loadImage:vi.fn(async()=>({width:640,height:360,close:vi.fn()})),protect:vi.fn(async()=>controls.protectedBlob)}));
vi.mock('../detection/scan',()=>({scan:controls.scan,logDevelopmentScanError:vi.fn(),ScanError:class ScanError extends Error{}}));
import App from '../App';

const password:Finding={id:'password',type:'Password',category:'secret',severity:'CRITICAL',confidence:99,maskedPreview:'P•••d',source:'ocr',description:'credential',selected:true,box:{x:1,y:1,width:10,height:10}};
const internal:Finding={id:'internal',type:'Internal URL',category:'network',severity:'SENSITIVE',confidence:99,maskedPreview:'http://i•••l',source:'ocr',description:'internal',selected:true,box:{x:1,y:1,width:10,height:10}};
const mounts:{root:Root;container:HTMLDivElement}[]=[];
function button(container:HTMLElement,label:string){return[...container.querySelectorAll('button')].find(item=>item.textContent?.includes(label)) as HTMLButtonElement|undefined;}
async function click(container:HTMLElement,label:string){const target=button(container,label);if(!target)throw new Error(`Missing ${label}`);await act(async()=>target.click());}
async function mount(){const container=document.createElement('div');document.body.append(container);const root=createRoot(container);mounts.push({root,container});await act(async()=>root.render(<StrictMode><App/></StrictMode>));return container;}
async function upload(container:HTMLElement,file=new File(['image'],'upload.png',{type:'image/png'})){const input=container.querySelector('input[aria-label="Choose an image"]') as HTMLInputElement;Object.defineProperty(input,'files',{configurable:true,value:[file]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));}
async function paste(file=new File(['image'],'paste.png',{type:'image/png'})){const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{items:[{kind:'file',type:file.type,getAsFile:()=>file}]}});await act(async()=>window.dispatchEvent(event));}

describe('fast single screenshot workflow',()=>{
  beforeEach(()=>{history.replaceState({},'','/');localStorage.clear();controls.scan.mockReset();let id=0;vi.spyOn(URL,'createObjectURL').mockImplementation(()=>`blob:https://example.test/${++id}`);vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});Object.defineProperty(globalThis,'ClipboardItem',{configurable:true,value:class{constructor(public data:Record<string,Blob>){}}});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:vi.fn().mockResolvedValue(undefined)}});});
  afterEach(async()=>{for(const item of mounts.splice(0))await act(async()=>item.root.unmount());document.body.textContent='';vi.restoreAllMocks();});
  it('automatically scans an uploaded image exactly once in StrictMode and applies policy',async()=>{controls.scan.mockResolvedValueOnce({findings:[password]});const container=await mount();await upload(container);expect(controls.scan).toHaveBeenCalledOnce();expect(container.textContent).toContain('Policy: BLOCK');expect(container.textContent).toContain('Protect & Verify');expect(container.textContent).not.toContain('Scan image');});
  it('uses Client Sharing by default and safely validates stored profile IDs',()=>{expect(loadPreferredProfile({getItem:()=>null})).toBe('client');expect(loadPreferredProfile({getItem:()=> 'qa'})).toBe('qa');expect(loadPreferredProfile({getItem:()=> 'attacker-profile'})).toBe('client');});
  it('persists only the selected profile and restores it on remount and reset',async()=>{const first=await mount();await click(first,'Bug Report / QA');expect(localStorage.getItem(DEFAULT_PROFILE_STORAGE_KEY)).toBe('qa');expect([...Array(localStorage.length)].map((_,i)=>localStorage.key(i))).toEqual([DEFAULT_PROFILE_STORAGE_KEY]);await act(async()=>mounts.shift()!.root.unmount());document.body.textContent='';const second=await mount();expect(button(second,'Bug Report / QA')?.getAttribute('aria-pressed')).toBe('true');controls.scan.mockResolvedValueOnce({findings:[]});await paste();await click(second,'Check Another Screenshot');expect(button(second,'Bug Report / QA')?.getAttribute('aria-pressed')).toBe('true');const stored=JSON.stringify({...localStorage});expect(stored).not.toContain('image');expect(stored).not.toContain('OCR');expect(stored).not.toContain('Password');});
  it('shows a clean no-protection path without claiming verified safety',async()=>{controls.scan.mockResolvedValueOnce({findings:[]});const container=await mount();await paste();expect(container.textContent).toContain('No sensitive findings requiring protection');expect(container.textContent).toContain('No protection required');expect(container.textContent).not.toContain('Protect & Verify');expect(container.textContent).not.toContain('Verified Safe');});
  it('keeps WARN visible and allows manual protection selection',async()=>{controls.scan.mockResolvedValueOnce({findings:[internal]});const container=await mount();await click(container,'Bug Report / QA');await paste();expect(container.textContent).toContain('Policy: WARN');expect(container.textContent).toContain('1 item needs review');expect(button(container,'Protect & Verify')).toBeUndefined();const finding=container.querySelector('.finding')!;const protect=[...finding.querySelectorAll('button')].find(item=>item.textContent==='Protect') as HTMLButtonElement;await act(async()=>protect.click());expect(button(container,'Protect & Verify')).toBeDefined();});
});
