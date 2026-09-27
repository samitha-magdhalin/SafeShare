// @vitest-environment jsdom
import { act } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';

const controls=vi.hoisted(()=>({accept:vi.fn()}));
vi.mock('../invitations/service',()=>({acceptInvitation:controls.accept}));
import { InvitationAcceptance,InvitationAccess } from '../invitations/InvitationRoute';

let roots:Root[]=[];
async function render(node:React.ReactNode){const container=document.createElement('div');document.body.append(container);const root=createRoot(container);roots.push(root);await act(async()=>{root.render(node);await Promise.resolve();await Promise.resolve()});return container}
describe('invitation route',()=>{
 beforeEach(()=>{(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;controls.accept.mockReset()});
 afterEach(async()=>{for(const root of roots.splice(0))await act(async()=>root.unmount());document.body.textContent=''});
 it('hands the accepted existing workspace directly to the application',async()=>{const workspace={id:'w',name:'Existing Company',createdBy:'owner',role:'member' as const},accepted=vi.fn();controls.accept.mockResolvedValue(workspace);const container=await render(<InvitationAcceptance client={{auth:{signOut:vi.fn()}} as never} token={'a'.repeat(64)} onAccepted={accepted}/>);expect(controls.accept).toHaveBeenCalledWith(expect.anything(),'a'.repeat(64));expect(accepted).toHaveBeenCalledWith(workspace);expect(container.textContent).not.toContain('Create workspace')});
 it('shows the safe wrong-account state and permits account switching',async()=>{controls.accept.mockRejectedValue(new Error('This invitation was issued to a different account.'));const signOut=vi.fn();const container=await render(<InvitationAcceptance client={{auth:{signOut}} as never} token={'b'.repeat(64)} onAccepted={()=>{}}/>);expect(container.textContent).toContain('This invitation was issued to a different account.');const button=container.querySelector('button')!;await act(async()=>button.click());expect(signOut).toHaveBeenCalledOnce()});
 it('reveals no workspace identity before authentication',async()=>{const container=await render(<InvitationAccess client={{auth:{}} as never} token={'c'.repeat(64)}/>);expect(container.textContent).toContain("You've been invited to join a SafeShare workspace.");expect(container.textContent).not.toContain('Existing Company')});
});
