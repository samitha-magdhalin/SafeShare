// @vitest-environment jsdom
import {act,type ReactNode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {AuthForm} from '../auth/AuthForm';
import {PrivatePilotSignup,NoWorkspaceAccess} from '../app/SaaSApp';
import {InvitationAccess} from '../invitations/InvitationRoute';

const mounted:{root:Root;container:HTMLDivElement}[]=[];
async function render(element:ReactNode){const container=document.createElement('div');document.body.append(container);const root=createRoot(container);mounted.push({root,container});await act(async()=>root.render(element));return container}
function button(container:HTMLElement,label:string){return[...container.querySelectorAll('button')].find(item=>item.textContent===label) as HTMLButtonElement|undefined}

describe('controlled private-pilot access',()=>{
  afterEach(async()=>{for(const item of mounted.splice(0))await act(async()=>item.root.unmount());document.body.textContent=''});
  it('keeps ordinary login sign-in only',async()=>{const container=await render(<AuthForm client={{auth:{signInWithPassword:vi.fn()}} as never} mode="signin" onNavigate={vi.fn()}/>);expect(container.textContent).toContain('Welcome back');expect(container.textContent).not.toContain('New to SafeShare? Create account');expect(container.textContent).not.toContain('Create account')});
  it('replaces direct signup with invitation and private-pilot guidance',async()=>{const navigate=vi.fn(),container=await render(<PrivatePilotSignup onNavigate={navigate}/>);expect(container.textContent).toContain('SafeShare is currently available through private company pilots.');expect(container.textContent).toContain('ask your SafeShare administrator for an invitation');expect(container.textContent).not.toContain('Create account');expect(container.querySelector('form')).toBeNull();expect(container.querySelector('a')?.getAttribute('href')).toMatch(/^mailto:\?subject=SafeShare/);await act(async()=>button(container,'Company Sign In')!.click());expect(navigate).toHaveBeenCalledWith('/login')});
  it('preserves account creation within a valid invitation route',async()=>{const container=await render(<InvitationAccess client={{auth:{}} as never} token={'a'.repeat(64)}/>);expect(container.textContent).toContain('New to SafeShare? Create account');await act(async()=>button(container,'New to SafeShare? Create account')!.click());expect(container.textContent).toContain('Create account');expect(container.querySelector('input[autocomplete="new-password"]')).not.toBeNull()});
  it('shows a fail-closed zero-workspace state without workspace creation',async()=>{const signOut=vi.fn(),container=await render(<NoWorkspaceAccess client={{auth:{signOut}} as never}/>);expect(container.textContent).toContain('No company workspace is available.');expect(container.textContent).toContain('Company users need an invitation from their SafeShare administrator.');expect(container.textContent).not.toContain('Create Workspace');expect(container.textContent).not.toContain('Create workspace');expect(container.querySelector('form')).toBeNull();await act(async()=>button(container,'Sign out')!.click());expect(signOut).toHaveBeenCalledOnce()});
  it('keeps existing workspace users on the unchanged Console branch',()=>{const source=readFileSync(join(process.cwd(),'src','app','SaaSApp.tsx'),'utf8');expect(source).toContain("if(path==='/signup')return <PrivatePilotSignup");expect(source).toContain('if(!workspace)return <NoWorkspaceAccess');expect(source).toContain('return <Shell client={client}')});
  it('revokes workspace creation from every public client role',()=>{const sql=readFileSync(join(process.cwd(),'supabase','migrations','202609290009_restrict_workspace_creation.sql'),'utf8').toLowerCase();expect(sql).toContain('revoke all on function public.create_workspace(text) from public');expect(sql).toContain('revoke execute on function public.create_workspace(text) from anon, authenticated');expect(sql).not.toContain('drop function');expect(sql).not.toContain('service_role')});
});