// @vitest-environment jsdom
import { act } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';

const controls=vi.hoisted(()=>({accept:vi.fn()}));
vi.mock('../invitations/service',()=>({acceptInvitation:controls.accept}));
import { InvitationAcceptance,InvitationAccess } from '../invitations/InvitationRoute';
import { InvitationError } from '../invitations/types';

let roots:Root[]=[];
async function render(node:React.ReactNode){const container=document.createElement('div');document.body.append(container);const root=createRoot(container);roots.push(root);await act(async()=>{root.render(node);await Promise.resolve()});return container}
function button(container:HTMLElement,label:string){return[...container.querySelectorAll('button')].find(item=>item.textContent===label) as HTMLButtonElement}
async function click(container:HTMLElement,label:string){await act(async()=>{button(container,label).click();await Promise.resolve();await Promise.resolve()})}
describe('invitation route',()=>{
 beforeEach(()=>{(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;controls.accept.mockReset()});
 afterEach(async()=>{for(const root of roots.splice(0))await act(async()=>root.unmount());document.body.textContent=''});
 it('requires explicit acceptance and refreshes application workspace discovery on success',async()=>{const workspace={id:'w',name:'Existing Company',createdBy:'owner',role:'member' as const},accepted=vi.fn(),continued=vi.fn();controls.accept.mockResolvedValue(workspace);const container=await render(<InvitationAcceptance client={{auth:{signOut:vi.fn()}} as never} token={'a'.repeat(64)} onAccepted={accepted} onContinue={continued}/>);expect(controls.accept).not.toHaveBeenCalled();await click(container,'Accept invitation');expect(controls.accept).toHaveBeenCalledWith(expect.anything(),'a'.repeat(64));expect(accepted).toHaveBeenCalledWith(workspace);expect(container.textContent).toContain("You're now a member of Existing Company.");expect(container.textContent).toContain('Open SafeShare Agent');await click(container,'Continue to SafeShare');expect(continued).toHaveBeenCalledOnce()});
 it('shows the safe wrong-account state and permits account switching',async()=>{controls.accept.mockRejectedValue(new InvitationError('wrong-account','This invitation was issued to a different account.'));const signOut=vi.fn();const container=await render(<InvitationAcceptance client={{auth:{signOut}} as never} token={'b'.repeat(64)} onAccepted={()=>{}} onContinue={()=>{}}/>);await click(container,'Accept invitation');expect(container.textContent).toContain('This invitation was issued to a different account.');await click(container,'Sign in with another account');expect(signOut).toHaveBeenCalledOnce()});
 it.each([
  ['expired','This invitation has expired.'],
  ['revoked','This invitation has been revoked.']
 ] as const)('shows a safe %s invitation state',async(code,message)=>{controls.accept.mockRejectedValue(new InvitationError(code,message));const container=await render(<InvitationAcceptance client={{auth:{signOut:vi.fn()}} as never} token={'d'.repeat(64)} onAccepted={()=>{}} onContinue={()=>{}}/>);await click(container,'Accept invitation');expect(container.textContent).toContain(message);expect(container.textContent).not.toContain('Sign in with another account')});
 it('directs an existing member onward when the invitation was already used',async()=>{controls.accept.mockRejectedValue(new InvitationError('accepted','This invitation has already been accepted.'));const continued=vi.fn();const container=await render(<InvitationAcceptance client={{auth:{signOut:vi.fn()}} as never} token={'e'.repeat(64)} onAccepted={()=>{}} onContinue={continued}/>);await click(container,'Accept invitation');expect(container.textContent).toContain('already been accepted');await click(container,'Continue to SafeShare');expect(continued).toHaveBeenCalledOnce()});
 it('reveals no workspace identity before authentication',async()=>{const container=await render(<InvitationAccess client={{auth:{}} as never} token={'c'.repeat(64)}/>);expect(container.textContent).toContain("You've been invited to join a SafeShare workspace.");expect(container.textContent).not.toContain('Existing Company')});
});