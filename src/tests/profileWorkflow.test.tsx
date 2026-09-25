// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Finding } from '../types';

const controls=vi.hoisted(()=>({scan:vi.fn(),protectedBlob:new Blob(['protected'],{type:'image/png'})}));
vi.mock('../utils/image',()=>({loadImage:vi.fn(async()=>({width:800,height:500,close:vi.fn()})),protect:vi.fn(async()=>controls.protectedBlob)}));
vi.mock('../detection/scan',()=>({scan:controls.scan,logDevelopmentScanError:vi.fn(),ScanError:class ScanError extends Error{}}));
import App from '../App';

const password:Finding={id:'password',type:'Password',category:'secret',severity:'CRITICAL',confidence:99,maskedPreview:'P•••d',source:'ocr',description:'Password visible.',selected:true,fingerprint:'Password:test'};
const internalUrl:Finding={id:'internal',type:'Internal URL',category:'network',severity:'SENSITIVE',confidence:99,maskedPreview:'http://i•••l',source:'ocr',description:'Internal URL visible.',selected:true,fingerprint:'Internal URL:test'};
const mounted:{root:Root;container:HTMLDivElement}[]=[];
function button(container:HTMLElement,label:string){return[...container.querySelectorAll('button')].find(item=>item.textContent?.includes(label));}
async function click(container:HTMLElement,label:string){const target=button(container,label);if(!target)throw new Error(`Missing button ${label}`);await act(async()=>target.click());}
async function mount(){const container=document.createElement('div');document.body.append(container);const root=createRoot(container);mounted.push({root,container});await act(async()=>root.render(<StrictMode><App/></StrictMode>));return container;}
async function paste(file=new File(['image'],'profile.png',{type:'image/png'})){const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{items:[{kind:'file',type:file.type,getAsFile:()=>file}]}});await act(async()=>window.dispatchEvent(event));}

describe('sharing profile workflow',()=>{
  beforeEach(()=>{
    (globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
    controls.scan.mockReset();localStorage.clear();let id=0;vi.spyOn(URL,'createObjectURL').mockImplementation(()=>`blob:https://example.test/${++id}`);vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
    Object.defineProperty(globalThis,'ClipboardItem',{configurable:true,value:class{constructor(public data:Record<string,Blob>) {}}});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:vi.fn().mockResolvedValue(undefined)}});
  });
  afterEach(async()=>{for(const item of mounted.splice(0))await act(async()=>item.root.unmount());document.body.textContent='';vi.restoreAllMocks();});

  it('defaults to Client Sharing and recalculates a scanned finding without rerunning OCR',async()=>{
    controls.scan.mockResolvedValueOnce({findings:[internalUrl],textFindings:[internalUrl],metadataCount:0});
    const container=await mount();
    expect(button(container,'Client Sharing')?.getAttribute('aria-pressed')).toBe('true');
    await paste();await click(container,'Scan image');
    expect(container.textContent).toContain('Policy: PROTECT');
    expect(controls.scan).toHaveBeenCalledOnce();
    await click(container,'Bug Report / QA');
    expect(container.textContent).toContain('Sharing profile: Bug Report / QA');
    expect(container.textContent).toContain('Policy: WARN');
    expect(controls.scan).toHaveBeenCalledOnce();
    const finding=container.querySelector('.finding')!;
    const protect=[...finding.querySelectorAll('button')].find(item=>item.textContent==='Protect');
    const keep=[...finding.querySelectorAll('button')].find(item=>item.textContent==='Keep');
    expect(protect?.getAttribute('aria-pressed')).toBe('false');expect(keep?.getAttribute('aria-pressed')).toBe('true');
  });

  it('allows QA WARN findings with a visible review recommendation',async()=>{
    controls.scan.mockResolvedValueOnce({findings:[internalUrl],textFindings:[internalUrl],metadataCount:0}).mockResolvedValueOnce({findings:[internalUrl],textFindings:[internalUrl],metadataCount:0});
    const container=await mount();
    await click(container,'Bug Report / QA');await paste();await click(container,'Scan image');await click(container,'Protect & verify');
    expect(container.textContent).toContain('Ready to Share \u2014 review recommended');
    expect(container.textContent).toContain('1 policy warning remains');
    expect(button(container,'Copy Safe Image')?.disabled).toBe(false);expect(button(container,'Export protected image')?.disabled).toBe(false);
  });

  it('invalidates successful verification and Copy/Export after switching profiles',async()=>{
    controls.scan.mockResolvedValueOnce({findings:[password],textFindings:[password],metadataCount:0}).mockResolvedValueOnce({findings:[],textFindings:[],metadataCount:0}).mockResolvedValueOnce({findings:[],textFindings:[],metadataCount:0});
    const container=await mount();
    await click(container,'Bug Report / QA');await paste();await click(container,'Scan image');await click(container,'Protect & verify');
    expect(container.textContent).toContain('Ready to Share');
    expect(button(container,'Copy Safe Image')?.disabled).toBe(false);expect(button(container,'Export protected image')?.disabled).toBe(false);
    await click(container,'Public Documentation');
    expect(container.textContent).toContain('Privacy Scan Results');
    expect(container.textContent).not.toContain('Ready to Share');
    expect(button(container,'Copy Safe Image')).toBeUndefined();expect(button(container,'Export protected image')).toBeUndefined();
    expect(controls.scan).toHaveBeenCalledTimes(2);
    await click(container,'Protect & verify');
    expect(container.textContent).toContain('Ready to Share');expect(controls.scan).toHaveBeenCalledTimes(3);
  });
});
