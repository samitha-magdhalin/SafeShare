// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthForm } from '../auth/AuthForm';

let root:Root;let container:HTMLDivElement;
const setInput=(input:HTMLInputElement,value:string)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));};
async function mount(auth:object){container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>root.render(<AuthForm client={{auth} as never} mode="signup" onNavigate={()=>{}}/>));}
async function submit(){const inputs=container.querySelectorAll('input');await act(async()=>{setInput(inputs[0],'Demo User');setInput(inputs[1],'demo@example.com');setInput(inputs[2],'private-password');container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await Promise.resolve()});}
async function click(label:string){const button=[...container.querySelectorAll('button')].find(item=>item.textContent===label)!;await act(async()=>{button.click();await Promise.resolve()});}

describe('signup email confirmation',()=>{
 beforeEach(()=>{(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();sessionStorage.clear()});
 afterEach(async()=>{if(root)await act(async()=>root.unmount());container?.remove();vi.restoreAllMocks()});
 it('treats signup without a session as success and does not persist the password',async()=>{const signUp=vi.fn().mockResolvedValue({data:{session:null},error:null});await mount({signUp,resend:vi.fn()});await submit();expect(container.textContent).toContain('Account created. Check your email to confirm your account.');expect(container.textContent).not.toContain('Account creation could not finish.');expect(container.textContent).toContain('Resend confirmation email');expect((container.querySelector('input[type=password]') as HTMLInputElement).value).toBe('');expect(JSON.stringify({...localStorage,...sessionStorage})).not.toContain('private-password')});
 it('resends signup confirmation to the current application origin',async()=>{const resend=vi.fn().mockResolvedValue({error:null});await mount({signUp:vi.fn().mockResolvedValue({data:{session:null},error:null}),resend});await submit();await click('Resend confirmation email');expect(resend).toHaveBeenCalledWith({type:'signup',email:'demo@example.com',options:{emailRedirectTo:window.location.origin}});expect(container.textContent).toContain('Confirmation email sent. Check your inbox.')});
 it('shows a generic safe resend error without provider details',async()=>{const detail='SMTP provider secret diagnostic';const resend=vi.fn().mockResolvedValue({error:new Error(detail)});await mount({signUp:vi.fn().mockResolvedValue({data:{session:null},error:null}),resend});await submit();await click('Resend confirmation email');expect(container.textContent).toContain('Confirmation email could not be sent. Please try again.');expect(container.textContent).not.toContain(detail)});
});
