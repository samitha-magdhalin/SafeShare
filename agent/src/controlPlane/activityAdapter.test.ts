import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAgentControlPlane } from './adapter';
import { ControlPlaneUnavailableError } from './types';

function adapter(rpc: ReturnType<typeof vi.fn>) {
  return new SupabaseAgentControlPlane({ rpc } as unknown as SupabaseClient);
}

describe('Agent activity control-plane boundary', () => {
  it('maps the minimal verified DTO to the existing RPC with zero screenshot-derived counts', async () => {
    const rpc = vi.fn(async () => ({ data: 'activity-id', error: null }));
    await adapter(rpc).recordActivity({
      workspaceId: 'workspace-a',
      eventType: 'SCREENSHOT_VERIFIED',
      policyVersion: 5,
    });
    expect(rpc).toHaveBeenCalledWith('record_workspace_activity', {
      target_workspace: 'workspace-a',
      event_type: 'SCREENSHOT_VERIFIED',
      workflow_type: 'SINGLE',
      sharing_context: 'Team Policy',
      policy_version: 5,
      total_findings: 0,
      credential_count: 0,
      email_count: 0,
      phone_count: 0,
      internal_ip_count: 0,
      internal_url_count: 0,
      public_url_count: 0,
      qr_count: 0,
      metadata_count: 0,
      protected_count: 0,
      warning_count: 0,
      verification_status: 'VERIFIED',
      review_status: 'PENDING',
    });
  });

  it('maps approval only to the canonical approved state', async () => {
    const rpc = vi.fn(async () => ({ data: 'activity-id', error: null }));
    await adapter(rpc).recordActivity({
      workspaceId: 'workspace-a',
      eventType: 'SCREENSHOT_APPROVED',
      policyVersion: 6,
    });
    expect((rpc.mock.calls[0] as unknown[])[1]).toMatchObject({
      event_type: 'SCREENSHOT_APPROVED',
      policy_version: 6,
      verification_status: 'APPROVED',
      review_status: 'APPROVED',
    });
  });

  it('rejects arbitrary metadata at runtime before calling Supabase', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    await expect(adapter(rpc).recordActivity({
      workspaceId: 'workspace-a',
      eventType: 'SCREENSHOT_VERIFIED',
      policyVersion: 5,
      findings: [{ value: 'forbidden' }],
    } as never)).rejects.toBeInstanceOf(ControlPlaneUnavailableError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns a generic safe error when the RPC fails', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'database detail' } }));
    await expect(adapter(rpc).recordActivity({
      workspaceId: 'workspace-a',
      eventType: 'SCREENSHOT_APPROVED',
      policyVersion: 5,
    })).rejects.toBeInstanceOf(ControlPlaneUnavailableError);
  });
});
