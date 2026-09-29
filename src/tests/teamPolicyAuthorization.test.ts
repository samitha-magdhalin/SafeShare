import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql=readFileSync(join(process.cwd(),'supabase','migrations','202609290008_harden_team_policy_authorization.sql'),'utf8');

describe('hardened Team Policy authorization',()=>{
  it('derives authority from the authenticated membership role',()=>{
    expect(sql).toContain('wm.user_id=auth.uid()');
    expect(sql).toContain("wm.role in ('owner','admin')");
    expect(sql).toContain('wm.workspace_id=target_workspace');
    expect(sql).not.toMatch(/client_role|requested_role|new_role/);
  });
  it('rejects unauthenticated and member policy mutation inside the write RPC',()=>{
    expect(sql).toMatch(/if auth\.uid\(\) is null or not exists\([\s\S]+POLICY_NOT_AUTHORIZED/);
    expect(sql.match(/wm\.role in \('owner','admin'\)/g)).toHaveLength(2);
  });
  it('keeps cross-workspace writes and stale versions constrained',()=>{
    expect(sql).toContain('wp.workspace_id=target_workspace');
    expect(sql).toContain('wp.version=expected_version');
    expect(sql).toContain('Policy version conflict');
  });
  it('keeps direct table mutations unavailable to browser roles',()=>{
    expect(sql).toContain('revoke insert,update,delete on public.workspace_policies from anon,authenticated');
    expect(sql).toContain('revoke all on function public.update_workspace_policy');
    expect(sql).toContain('grant execute on function public.update_workspace_policy(uuid,jsonb,bigint) to authenticated');
  });
  it('does not remove member read access or alter policy data',()=>{
    expect(sql).not.toMatch(/drop policy|delete from public\.workspace_policies|alter table public\.workspace_policies disable row level security/i);
    expect(sql).toContain('public.is_valid_workspace_policy(new_policy)');
  });
});