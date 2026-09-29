import { describe, expect, it, vi } from 'vitest';
import { AgentActivityLifecycle, type ActivityAuthorization } from './activityLifecycle';

const authorization = (overrides: Partial<ActivityAuthorization> = {}): ActivityAuthorization => ({
  workspaceId: 'workspace-a',
  policyVersion: 5,
  protectedFingerprint: 'protected-a',
  ...overrides,
});
const controlPlane = (recordActivity: (input: never) => Promise<void> = vi.fn(async (): Promise<void> => undefined)) => ({ recordActivity });

describe('Agent privacy-safe activity lifecycle', () => {
  it('records verification only after successful fresh verification', async () => {
    const lifecycle = new AgentActivityLifecycle(), control = controlPlane();
    lifecycle.bind('workspace-a', 5);
    expect(await lifecycle.recordVerified(authorization(), false, control)).toBe(false);
    expect(control.recordActivity).not.toHaveBeenCalled();
    expect(await lifecycle.recordVerified(authorization(), true, control)).toBe(true);
    expect(control.recordActivity).toHaveBeenCalledWith({
      workspaceId: 'workspace-a', eventType: 'SCREENSHOT_VERIFIED', policyVersion: 5,
    });
  });

  it('records approval only after successful explicit clipboard write', async () => {
    const lifecycle = new AgentActivityLifecycle(), control = controlPlane();
    lifecycle.bind('workspace-a', 5);
    expect(await lifecycle.recordApproved(authorization(), false, control)).toBe(false);
    expect(control.recordActivity).not.toHaveBeenCalled();
    expect(await lifecycle.recordApproved(authorization(), true, control)).toBe(true);
    expect(control.recordActivity).toHaveBeenCalledWith({
      workspaceId: 'workspace-a', eventType: 'SCREENSHOT_APPROVED', policyVersion: 5,
    });
  });

  it('deduplicates successful and concurrent events by output, workspace, and policy', async () => {
    let release: () => void = () => undefined;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const recordActivity = vi.fn(() => pending);
    const lifecycle = new AgentActivityLifecycle(), control = controlPlane(recordActivity as never);
    lifecycle.bind('workspace-a', 5);
    const first = lifecycle.recordVerified(authorization(), true, control);
    const duplicate = lifecycle.recordVerified(authorization(), true, control);
    expect(recordActivity).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, duplicate]);
    await lifecycle.recordVerified(authorization(), true, control);
    expect(recordActivity).toHaveBeenCalledTimes(1);
  });

  it('binds writes to the current workspace and policy and blocks stale or signed-out scopes', async () => {
    const lifecycle = new AgentActivityLifecycle(), control = controlPlane();
    lifecycle.bind('workspace-a', 5);
    expect(await lifecycle.recordApproved(authorization({ workspaceId: 'workspace-b' }), true, control)).toBe(false);
    lifecycle.bind('workspace-a', 6);
    expect(await lifecycle.recordApproved(authorization({ policyVersion: 5 }), true, control)).toBe(false);
    lifecycle.clear();
    expect(await lifecycle.recordApproved(authorization({ policyVersion: 6 }), true, control)).toBe(false);
    expect(control.recordActivity).not.toHaveBeenCalled();
  });

  it('does not mark a failed write as recorded and leaves retry possible', async () => {
    const recordActivity = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const lifecycle = new AgentActivityLifecycle(), control = controlPlane(recordActivity as never);
    lifecycle.bind('workspace-a', 5);
    await expect(lifecycle.recordVerified(authorization(), true, control)).rejects.toThrow('offline');
    await expect(lifecycle.recordVerified(authorization(), true, control)).resolves.toBe(true);
    expect(recordActivity).toHaveBeenCalledTimes(2);
  });

  it('allows distinct protected outputs without creating persistent tracking identity', async () => {
    const lifecycle = new AgentActivityLifecycle(), control = controlPlane();
    lifecycle.bind('workspace-a', 5);
    await lifecycle.recordVerified(authorization(), true, control);
    await lifecycle.recordVerified(authorization({ protectedFingerprint: 'protected-b' }), true, control);
    expect(control.recordActivity).toHaveBeenCalledTimes(2);
  });
});
