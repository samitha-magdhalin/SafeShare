// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AuthForm } from '../auth/AuthForm';
import { isSupabaseConfigured, readSupabaseConfig } from '../lib/supabase/config';
import { createWorkspace, loadWorkspace, validWorkspaceName } from '../workspace/service';

function filesBelow(path:string):string[]{return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?filesBelow(join(path,entry.name)):[join(path,entry.name)]);}

describe('SaaS foundation configuration and privacy boundary',()=>{
  it('handles missing or incomplete public configuration safely',()=>{expect(readSupabaseConfig({})).toBeNull();expect(readSupabaseConfig({VITE_SUPABASE_URL:'https://demo.supabase.co'})).toBeNull();expect(isSupabaseConfigured({})).toBe(false)});
  it('accepts only a complete URL and anon key',()=>{expect(readSupabaseConfig({VITE_SUPABASE_URL:'https://demo.supabase.co',VITE_SUPABASE_ANON_KEY:'public-anon'})).toEqual({url:'https://demo.supabase.co',anonKey:'public-anon'});expect(readSupabaseConfig({VITE_SUPABASE_URL:'javascript:bad',VITE_SUPABASE_ANON_KEY:'x'})).toBeNull()});
  it('keeps Supabase imports outside every privacy engine module',()=>{for(const folder of ['detection','verification','report','review','utils','batch','metadata','policy'])for(const file of filesBelow(join(process.cwd(),'src',folder))){const source=readFileSync(file,'utf8');expect(source,file).not.toMatch(/supabase|workspace\/service/i)}});
  it('does not reference a service role key in browser source',()=>{for(const file of filesBelow(join(process.cwd(),'src')).filter(file=>!file.includes(`${join('src','tests')}`))){expect(readFileSync(file,'utf8'),file).not.toMatch(/service.role/i)}});
  it('workspace services accept account identifiers and names only',()=>{const source=readFileSync(join(process.cwd(),'src','workspace','service.ts'),'utf8');for(const forbidden of ['Blob','Finding','OCR','maskedPreview','imageData','dataUrl'])expect(source).not.toContain(forbidden)});
});

describe('workspace service',()=>{
  it('validates workspace names',()=>{expect(validWorkspaceName('A')).toBe(false);expect(validWorkspaceName('Acme QA Team')).toBe(true);expect(validWorkspaceName('x'.repeat(81))).toBe(false)});
  it('creates a workspace atomically through the RPC and represents the creator as owner',async()=>{const rpc=vi.fn().mockResolvedValue({data:{id:'w1',name:'Acme QA Team',created_by:'u1'},error:null});const workspace=await createWorkspace({rpc} as never,'  Acme QA Team  ');expect(rpc).toHaveBeenCalledWith('create_workspace',{workspace_name:'Acme QA Team'});expect(workspace).toEqual({id:'w1',name:'Acme QA Team',createdBy:'u1',role:'owner'})});
  it('rejects invalid names before making a backend call',async()=>{const rpc=vi.fn();await expect(createWorkspace({rpc} as never,' ')).rejects.toThrow('between 2 and 80');expect(rpc).not.toHaveBeenCalled()});
  it.each([['user-member','member'],['user-owner','owner']] as const)('discovers only the signed-in %s membership',async(userId,role)=>{const maybeSingle=vi.fn(async()=>({data:{role,workspaces:{id:'w1',name:'Team',created_by:'creator'}},error:null})),limit=vi.fn(()=>({maybeSingle})),eq=vi.fn(()=>({limit})),select=vi.fn(()=>({eq})),from=vi.fn(()=>({select}));await expect(loadWorkspace({from} as never,userId)).resolves.toMatchObject({id:'w1',role});expect(eq).toHaveBeenCalledWith('user_id',userId)});
});

describe('authentication form',()=>{
  it('validates sign-in without sending an invalid password',async()=>{const signInWithPassword=vi.fn();const client={auth:{signInWithPassword}} as never;const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(<AuthForm client={client} mode="signin" onNavigate={()=>{}}/>));const inputs=container.querySelectorAll('input');await act(async()=>{inputs[0].value='bad';inputs[0].dispatchEvent(new Event('input',{bubbles:true}));inputs[1].value='short';inputs[1].dispatchEvent(new Event('input',{bubbles:true}));(container.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});expect(container.textContent).toContain('valid email');expect(signInWithPassword).not.toHaveBeenCalled();await act(async()=>root.unmount());container.remove()});
  it('shows a generic authentication error without exposing provider details',async()=>{const secret='provider diagnostic must stay hidden';const signInWithPassword=vi.fn().mockResolvedValue({error:new Error(secret)});const client={auth:{signInWithPassword}} as never;const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(<AuthForm client={client} mode="signin" onNavigate={()=>{}}/>));const inputs=container.querySelectorAll('input');await act(async()=>{const set=(input:HTMLInputElement,value:string)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))};set(inputs[0],'user@example.com');set(inputs[1],'password123');(container.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await Promise.resolve()});expect(container.textContent).toContain('Sign in could not finish');expect(container.textContent).not.toContain(secret);await act(async()=>root.unmount());container.remove()});
});
