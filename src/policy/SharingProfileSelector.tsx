import { POLICY_ACTIONS, POLICY_CATEGORIES, type Policy, type PolicyAction, type PolicyCategory, type ProfileId } from './types';
import { PROFILE_OPTIONS } from './profiles';

const CATEGORY_LABELS:Record<PolicyCategory,string>={credentials:'Credentials',email:'Email',phone:'Phone',internalIp:'Internal IP',internalUrl:'Internal URL',publicUrl:'Public URL',qr:'QR Code',metadata:'Metadata'};
type Props={profileId:ProfileId;customPolicy:Policy;disabled?:boolean;onProfileChange:(id:ProfileId)=>void;onCustomChange:(policy:Policy)=>void};
export function SharingProfileSelector({profileId,customPolicy,disabled=false,onProfileChange,onCustomChange}:Props){
  return <section className="profile-selector" aria-labelledby="sharing-profile-heading">
    <div className="profile-title"><div><div className="eyebrow">SHARING PROFILE</div><h3 id="sharing-profile-heading">Where are you sharing this?</h3></div><small>Policy stays on this device.</small></div>
    <div className="profile-options">{PROFILE_OPTIONS.map(profile=><button type="button" key={profile.id} className={`profile-option ${profileId===profile.id?'active':''}`} aria-pressed={profileId===profile.id} disabled={disabled} onClick={()=>onProfileChange(profile.id)}><strong>{profile.name}</strong><span>{profile.description}</span></button>)}</div>
    {profileId==='custom'&&<div className="custom-policy" aria-label="Custom sharing policy">{POLICY_CATEGORIES.map(category=><label key={category}><span>{CATEGORY_LABELS[category]}</span><select disabled={disabled} value={customPolicy[category]} onChange={event=>onCustomChange({...customPolicy,[category]:event.target.value as PolicyAction})}>{POLICY_ACTIONS.map(action=><option key={action} value={action}>{action[0]+action.slice(1).toLowerCase()}</option>)}</select></label>)}</div>}
  </section>;
}
