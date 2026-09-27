import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration=(name:string)=>readFileSync(join(process.cwd(),'supabase','migrations',name),'utf8');
const sql=migration('202609260006_fix_invitation_rpc_ambiguity.sql');

describe('Feature 10 invitation RPC SQL ambiguity regression',()=>{
 it('qualifies the creation RPC predicates that collided with the expires_at output variable',()=>{
  expect(sql).toContain('update public.workspace_invitations as wi');
  expect(sql).toContain('wi.workspace_id=target_workspace');
  expect(sql).toContain('wi.email=normalized_email');
  expect(sql).toContain("wi.status='pending'");
  expect(sql).toContain('wi.expires_at<=now()');
  expect(sql).toContain('return query select created.id,raw_token,created.expires_at');
 });
 it('qualifies every returned invitation column in the list RPC',()=>{
  expect(sql).toContain('select wi.id,wi.email,wi.role,wi.status,wi.created_at,wi.expires_at');
  expect(sql).toContain('order by wi.created_at desc');
 });
 it('qualifies revoke lookup and mutation identifiers',()=>{
  expect(sql).toContain('select wi.* into invitation');
  expect(sql).toContain('where wi.id=target_invitation');
 });
 it('qualifies auth user and invitation identifiers in acceptance',()=>{
  expect(sql).toContain('where au.id=auth.uid()');
  expect(sql).toContain("where wi.token_digest=digest(invite_token,'sha256')");
  expect(sql).toContain('where wi.id=invitation.id');
  expect(sql).toContain('select w.id,w.name,w.created_by,membership_role');
 });
 it('contains no unqualified WHERE reference for collision-prone invitation fields',()=>{
  expect(sql).not.toMatch(/\bwhere\s+(?:id|workspace_id|email|role|status|created_at|expires_at|accepted_at|accepted_by|invited_by)\b/i);
 });
 it('preserves invitation authorization, token, expiry, and acceptance controls',()=>{
  for(const expected of ["interval '7 days'","gen_random_bytes(32)","digest(raw_token,'sha256')","caller_role not in ('owner','admin')","caller_role='admin' and invite_role<>'member'","email_confirmed_at","account_email<>invitation.email","on conflict(workspace_id,user_id) do nothing","security definer set search_path=public"])expect(migration('202609260004_workspace_invitations.sql')+sql).toContain(expected);
  for(const signature of ['invite_workspace_member(uuid,text,text)','list_workspace_invitations(uuid)','revoke_workspace_invitation(uuid)','accept_workspace_invitation(text)'])expect(sql).toContain('grant execute on function public.'+signature+' to authenticated');
 });
 it('preserves the migration 005 roster varchar-to-text fix',()=>{
  const roster=migration('202609260005_fix_workspace_member_roster.sql');
  expect(roster).toContain('au.email::text');
  expect(sql).not.toContain('list_workspace_members');
 });
});
