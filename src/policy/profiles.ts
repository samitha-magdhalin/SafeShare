import { POLICY_ACTIONS, POLICY_CATEGORIES, type Policy, type ProfileDefinition, type ProfileId } from './types';

export const DEFAULT_PROFILE_ID:ProfileId='client';
export const DEFAULT_PROFILE_STORAGE_KEY='safeshare.defaultProfile.v1';
export const CUSTOM_POLICY_STORAGE_KEY='safeshare.customPolicy.v1';
export const DEFAULT_CUSTOM_POLICY:Policy={credentials:'BLOCK',email:'PROTECT',phone:'PROTECT',internalIp:'WARN',internalUrl:'WARN',publicUrl:'ALLOW',qr:'WARN',metadata:'WARN'};

export const PROFILES:Record<Exclude<ProfileId,'custom'>,ProfileDefinition>={
  client:{id:'client',name:'Client Sharing',description:'For screenshots sent to customers or external teams',policy:{credentials:'BLOCK',email:'PROTECT',phone:'PROTECT',internalIp:'PROTECT',internalUrl:'PROTECT',publicUrl:'ALLOW',qr:'WARN',metadata:'WARN'}},
  qa:{id:'qa',name:'Bug Report / QA',description:'For Jira, bug reports, and testing evidence',policy:{credentials:'BLOCK',email:'PROTECT',phone:'PROTECT',internalIp:'WARN',internalUrl:'WARN',publicUrl:'ALLOW',qr:'WARN',metadata:'WARN'}},
  ai:{id:'ai',name:'AI Tool Upload',description:'For screenshots sent to external AI tools',policy:{credentials:'BLOCK',email:'PROTECT',phone:'PROTECT',internalIp:'PROTECT',internalUrl:'PROTECT',publicUrl:'WARN',qr:'PROTECT',metadata:'WARN'}},
  public:{id:'public',name:'Public Documentation',description:'For documentation, presentations, or public content',policy:{credentials:'BLOCK',email:'PROTECT',phone:'PROTECT',internalIp:'PROTECT',internalUrl:'PROTECT',publicUrl:'ALLOW',qr:'PROTECT',metadata:'WARN'}},
};

export const PROFILE_OPTIONS:ProfileDefinition[]=[...Object.values(PROFILES),{id:'custom',name:'Custom',description:'Choose your own protection policy',policy:DEFAULT_CUSTOM_POLICY}];
export function getProfileName(id:ProfileId):string{return id==='custom'?'Custom':PROFILES[id].name;}
export function getPolicy(id:ProfileId,custom:Policy):Policy{return id==='custom'?custom:PROFILES[id].policy;}
export function isPolicy(value:unknown):value is Policy{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const record=value as Record<string,unknown>;
  return Object.keys(record).length===POLICY_CATEGORIES.length&&POLICY_CATEGORIES.every(category=>POLICY_ACTIONS.includes(record[category] as never));
}
export function loadCustomPolicy(storage:Pick<Storage,'getItem'>|undefined=typeof localStorage==='undefined'?undefined:localStorage):Policy{
  if(!storage)return {...DEFAULT_CUSTOM_POLICY};
  try{const raw=storage.getItem(CUSTOM_POLICY_STORAGE_KEY);if(!raw)return {...DEFAULT_CUSTOM_POLICY};const parsed:unknown=JSON.parse(raw);return isPolicy(parsed)?parsed:{...DEFAULT_CUSTOM_POLICY};}catch{return {...DEFAULT_CUSTOM_POLICY};}
}
export function saveCustomPolicy(policy:Policy,storage:Pick<Storage,'setItem'>|undefined=typeof localStorage==='undefined'?undefined:localStorage):void{
  if(!storage||!isPolicy(policy))return;
  try{storage.setItem(CUSTOM_POLICY_STORAGE_KEY,JSON.stringify(policy));}catch{/* Policy persistence is optional. */}
}

export function loadPreferredProfile(storage:Pick<Storage,'getItem'>|undefined=typeof localStorage==='undefined'?undefined:localStorage):ProfileId{
  if(!storage)return DEFAULT_PROFILE_ID;
  try{const value=storage.getItem(DEFAULT_PROFILE_STORAGE_KEY);return PROFILE_OPTIONS.some(profile=>profile.id===value)?value as ProfileId:DEFAULT_PROFILE_ID;}catch{return DEFAULT_PROFILE_ID;}
}
export function savePreferredProfile(profileId:ProfileId,storage:Pick<Storage,'setItem'>|undefined=typeof localStorage==='undefined'?undefined:localStorage):void{
  if(!storage||!PROFILE_OPTIONS.some(profile=>profile.id===profileId))return;
  try{storage.setItem(DEFAULT_PROFILE_STORAGE_KEY,profileId);}catch{/* Profile preference is optional. */}
}
