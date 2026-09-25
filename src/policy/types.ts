export const POLICY_ACTIONS = ['BLOCK','PROTECT','WARN','ALLOW'] as const;
export type PolicyAction = typeof POLICY_ACTIONS[number];

export const POLICY_CATEGORIES = ['credentials','email','phone','internalIp','internalUrl','publicUrl','qr','metadata'] as const;
export type PolicyCategory = typeof POLICY_CATEGORIES[number];
export type NormalizedPolicyCategory = PolicyCategory|'unknown';
export type Policy = Record<PolicyCategory,PolicyAction>;
export type ProfileId = 'client'|'qa'|'ai'|'public'|'custom';
export type ProfileDefinition = { id: ProfileId; name: string; description: string; policy: Policy };
