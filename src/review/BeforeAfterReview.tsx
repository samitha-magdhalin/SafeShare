import type { Finding } from '../types';

type Props={
  originalUrl:string; protectedUrl:string; profileName:string; protectedFindings:Finding[];
  verificationReady:boolean; warningCount:number; approved:boolean; onApprove:()=>void;
  approveLabel?:string;
};

function groupedTypes(findings:Finding[]){const counts=new Map<string,number>();for(const finding of findings.filter(item=>item.selected))counts.set(finding.type,(counts.get(finding.type)??0)+1);return[...counts].map(([type,count])=>({type,count}));}

export function BeforeAfterReview({originalUrl,protectedUrl,profileName,protectedFindings,verificationReady,warningCount,approved,onApprove,approveLabel='Approve for Sharing'}:Props){
  const groups=groupedTypes(protectedFindings);
  return <section className="before-after-review" aria-label="Before and after review"><div className="comparison-grid"><figure><figcaption>ORIGINAL</figcaption><img src={originalUrl} alt="Original image before protection"/></figure><figure><figcaption>PROTECTED</figcaption><img src={protectedUrl} alt="Exact protected image that passed verification"/></figure></div><div className="review-details"><div><small>SHARING PROFILE</small><strong>{profileName}</strong></div><div><small>VERIFICATION</small><strong>{verificationReady?(warningCount?'Passed — review recommended':'Passed'):'Not passed'}</strong><span>{verificationReady?'Required protected findings are no longer detected.':'Approval is unavailable until verification passes.'}</span>{warningCount>0&&<span>{warningCount} warning{warningCount===1?' remains':'s remain'}.</span>}</div><div><small>PROTECTED CHANGES</small><strong>{groups.reduce((total,item)=>total+item.count,0)} value{groups.reduce((total,item)=>total+item.count,0)===1?'':'s'} protected</strong>{groups.length?<ul>{groups.map(item=><li key={item.type}>{item.type}{item.count>1?` × ${item.count}`:''}</li>)}</ul>:<span>No selected values were changed.</span>}</div></div><div className="review-approval"><p>{approved?'Approved for sharing. Copy and export use this reviewed protected image.':'Review the protected image before sharing. Automated scans cannot guarantee every exposure is found.'}</p><button className="primary" disabled={!verificationReady||approved} onClick={onApprove}>{approved?'Approved ✓':approveLabel}</button></div></section>;
}
