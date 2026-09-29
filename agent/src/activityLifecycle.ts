import type { AgentActivityInput, AgentControlPlane } from './controlPlane/types';

export type ActivityAuthorization = {
  workspaceId: string;
  policyVersion: number;
  protectedFingerprint: string;
};

type EventKind = AgentActivityInput['eventType'];

export class AgentActivityLifecycle {
  private workspaceId: string | null = null;
  private policyVersion: number | null = null;
  private readonly recorded = new Set<string>();
  private readonly inFlight = new Set<string>();

  bind(workspaceId: string, policyVersion: number): void {
    this.workspaceId = workspaceId;
    this.policyVersion = policyVersion;
  }

  clear(): void {
    this.workspaceId = null;
    this.policyVersion = null;
    this.inFlight.clear();
  }

  async recordVerified(
    authorization: ActivityAuthorization,
    verificationReady: boolean,
    controlPlane: Pick<AgentControlPlane, 'recordActivity'>,
  ): Promise<boolean> {
    if (!verificationReady) return false;
    return this.record('SCREENSHOT_VERIFIED', authorization, controlPlane);
  }

  async recordApproved(
    authorization: ActivityAuthorization,
    clipboardWriteSucceeded: boolean,
    controlPlane: Pick<AgentControlPlane, 'recordActivity'>,
  ): Promise<boolean> {
    if (!clipboardWriteSucceeded) return false;
    return this.record('SCREENSHOT_APPROVED', authorization, controlPlane);
  }

  private async record(
    eventType: EventKind,
    authorization: ActivityAuthorization,
    controlPlane: Pick<AgentControlPlane, 'recordActivity'>,
  ): Promise<boolean> {
    if (
      this.workspaceId !== authorization.workspaceId ||
      this.policyVersion !== authorization.policyVersion
    ) return false;

    const key = [
      eventType,
      authorization.workspaceId,
      authorization.policyVersion,
      authorization.protectedFingerprint,
    ].join(':');
    if (this.recorded.has(key) || this.inFlight.has(key)) return true;

    this.inFlight.add(key);
    try {
      await controlPlane.recordActivity({
        workspaceId: authorization.workspaceId,
        eventType,
        policyVersion: authorization.policyVersion,
      });
      this.recorded.add(key);
      return true;
    } finally {
      this.inFlight.delete(key);
    }
  }
}
