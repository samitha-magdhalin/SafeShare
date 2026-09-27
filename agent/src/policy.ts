import type {Finding} from '../../src/types';import {applyPolicy} from '../../src/policy/evaluatePolicy';import {PROFILES} from '../../src/policy/profiles';
// M1 is deliberately local and does not claim to use a workspace Team Policy.
export const M1_LOCAL_POLICY=PROFILES.client.policy;
export function requiresAttention(findings:Finding[]):boolean{return applyPolicy(findings,M1_LOCAL_POLICY).some(({policyAction})=>policyAction!=='ALLOW');}
