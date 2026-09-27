import { POLICY_ACTIONS, POLICY_CATEGORIES, type Policy, type PolicyAction, type PolicyCategory, type ProfileId } from './types';
import { PROFILE_OPTIONS } from './profiles';
const CATEGORY_LABELS:Record<PolicyCategory,string>={credentials:'Credentials',email:'Email',phone:'Phone',internalIp:'Internal IP',internalUrl:'Internal URL',publicUrl:'Public URL',qr:'QR Code',metadata:'Metadata'};
type Props={profileId:ProfileId;customPolicy:Policy;disabled?:boolean;onProfileChange:(id:ProfileId)=>void;onCustomChange:(policy:Policy)=>void};
export function SharingProfileSelector({profileId,customPolicy,disabled=false,onProfileChange,onCustomChange}:Props){
  const selected=PROFILE_OPTIONS.find(profile=>profile.id===profileId);
  return <section className="profile-selector" aria-labelledby="sharing-profile-heading">
    <div className="profile-compact"><label htmlFor="sharing-profile"><span id="sharing-profile-heading">Sharing as:</span><select id="sharing-profile" value={profileId} disabled={disabled} onChange={event=>onProfileChange(event.target.value as ProfileId)}>{PROFILE_OPTIONS.map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><small>{selected?.description} Policy stays on this device.</small></div>
    {profileId==='custom'&&<div className="custom-policy" aria-label="Custom sharing policy">{POLICY_CATEGORIES.map(category=><label key={category}><span>{CATEGORY_LABELS[category]}</span><select disabled={disabled} value={customPolicy[category]} onChange={event=>onCustomChange({...customPolicy,[category]:event.target.value as PolicyAction})}>{POLICY_ACTIONS.map(action=><option key={action} value={action}>{action[0]+action.slice(1).toLowerCase()}</option>)}</select></label>)}</div>}
  </section>;
}
