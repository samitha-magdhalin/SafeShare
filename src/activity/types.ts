export const ACTIVITY_EVENT_TYPES=['SCREENSHOT_VERIFIED','SCREENSHOT_APPROVED','BATCH_ITEM_APPROVED','TEAM_POLICY_UPDATED'] as const;
export type ActivityEventType=typeof ACTIVITY_EVENT_TYPES[number];
export type ActivityWorkflow='SINGLE'|'BATCH'|'POLICY';
export type ActivityStatus='VERIFIED'|'APPROVED'|'UPDATED';
export type SafeCategoryCounts={credential:number;email:number;phone:number;internal_ip:number;internal_url:number;public_url:number;qr:number;metadata:number};
export type SafeActivityInput={eventType:ActivityEventType;workflow:ActivityWorkflow;sharingContext:'Team Policy';policyVersion:number;totalFindings:number;categoryCounts:SafeCategoryCounts;protectedCount:number;warningCount:number;verificationStatus:ActivityStatus;reviewStatus:'NOT_REQUIRED'|'PENDING'|'APPROVED'};
export type ActivityRecord=SafeActivityInput&{id:string;workspaceId:string;createdAt:string};
export const emptyCategoryCounts=():SafeCategoryCounts=>({credential:0,email:0,phone:0,internal_ip:0,internal_url:0,public_url:0,qr:0,metadata:0});
