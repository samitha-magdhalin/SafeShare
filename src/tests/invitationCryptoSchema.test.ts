import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration=(name:string)=>readFileSync(join(process.cwd(),'supabase','migrations',name),'utf8');
const sql=migration('202609260007_fix_invitation_crypto_schema.sql');

describe('Feature 10 invitation crypto schema regression',()=>{
 it('installs pgcrypto into the trusted Supabase extensions schema only when absent',()=>{
  expect(sql).toContain('create extension if not exists pgcrypto with schema extensions');
  expect(sql).toContain("where e.extname='pgcrypto'");
  expect(sql).toContain("installed_schema is distinct from 'extensions'");
  expect(sql).not.toMatch(/alter\s+extension|drop\s+extension/i);
 });
 it('explicitly qualifies every crypto and encoding function',()=>{
  expect(sql).toContain('pg_catalog.encode(extensions.gen_random_bytes(32)');
  expect(sql).toContain("extensions.digest(raw_token,'sha256')");
  expect(sql).toContain("extensions.digest(invite_token,'sha256')");
  expect(sql).not.toMatch(/(?<![.\w])gen_random_bytes\s*\(/);
  expect(sql).not.toMatch(/(?<![.\w])digest\s*\(/);
  expect(sql).not.toMatch(/(?<![.\w])encode\s*\(/);
 });
 it('uses secure randomness and contains no insecure token generator',()=>{
  expect(sql).toContain('extensions.gen_random_bytes(32)');
  expect(sql).not.toMatch(/\b(?:random|math\.random)\s*\(/i);
  expect(sql).not.toMatch(/raw_token\s*:=.*gen_random_uuid/i);
 });
 it('hashes the same lowercase hex token text during creation and acceptance',()=>{
  expect(sql).toContain("raw_token:=pg_catalog.encode(extensions.gen_random_bytes(32),'hex')");
  expect(sql).toContain("extensions.digest(raw_token,'sha256')");
  expect(sql).toContain("invite_token !~ '^[0-9a-f]{64}$'");
  expect(sql).toContain("wi.token_digest=extensions.digest(invite_token,'sha256')");
 });
 it('stores only the digest and returns plaintext only from the creation RPC',()=>{
  expect(sql).toContain('insert into public.workspace_invitations(workspace_id,email,role,token_digest,invited_by)');
  expect(sql).not.toMatch(/insert into public\.workspace_invitations\([^)]*(?:raw_token|invite_token)/i);
  expect(sql).toContain('return query select created.id,raw_token,created.expires_at');
 });
 it('keeps restricted security-definer search paths and grants',()=>{
  expect(sql.match(/security definer set search_path=public/g)).toHaveLength(2);
  expect(sql).toContain('grant execute on function public.invite_workspace_member(uuid,text,text) to authenticated');
  expect(sql).toContain('grant execute on function public.accept_workspace_invitation(text) to authenticated');
 });
 it('preserves the prior roster and ambiguity fixes',()=>{
  expect(migration('202609260005_fix_workspace_member_roster.sql')).toContain('au.email::text');
  const ambiguity=migration('202609260006_fix_invitation_rpc_ambiguity.sql');
  expect(ambiguity).toContain('wi.expires_at<=now()');
  expect(ambiguity).toContain('where au.id=auth.uid()');
  expect(sql).toContain('wi.expires_at<=now()');
  expect(sql).toContain('where au.id=auth.uid()');
 });
});
