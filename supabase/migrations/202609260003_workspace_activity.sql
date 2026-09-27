-- Feature 9: append-only, metadata-only workspace activity.
create table public.workspace_activity (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 actor_user_id uuid not null references auth.users(id),
 event_type text not null check(event_type in ('SCREENSHOT_VERIFIED','SCREENSHOT_APPROVED','BATCH_ITEM_APPROVED','TEAM_POLICY_UPDATED')),
 workflow_type text not null check(workflow_type in ('SINGLE','BATCH','POLICY')),
 sharing_context text not null check(sharing_context='Team Policy'), policy_version bigint not null check(policy_version>0),
 total_findings integer not null check(total_findings between 0 and 10000),
 credential_count integer not null check(credential_count between 0 and 10000), email_count integer not null check(email_count between 0 and 10000), phone_count integer not null check(phone_count between 0 and 10000),
 internal_ip_count integer not null check(internal_ip_count between 0 and 10000), internal_url_count integer not null check(internal_url_count between 0 and 10000), public_url_count integer not null check(public_url_count between 0 and 10000),
 qr_count integer not null check(qr_count between 0 and 10000), metadata_count integer not null check(metadata_count between 0 and 10000),
 protected_count integer not null check(protected_count between 0 and 10000), warning_count integer not null check(warning_count between 0 and 10000),
 verification_status text not null check(verification_status in ('VERIFIED','APPROVED','UPDATED')),
 review_status text not null check(review_status in ('NOT_REQUIRED','PENDING','APPROVED')),
 created_at timestamptz not null default now(),
 check(credential_count+email_count+phone_count+internal_ip_count+internal_url_count+public_url_count+qr_count+metadata_count<=total_findings),
 check(protected_count<=total_findings and warning_count<=total_findings),
 check((event_type='TEAM_POLICY_UPDATED' and workflow_type='POLICY' and total_findings=0 and verification_status='UPDATED' and review_status='NOT_REQUIRED') or (event_type<>'TEAM_POLICY_UPDATED' and workflow_type in ('SINGLE','BATCH') and verification_status in ('VERIFIED','APPROVED')))
);
create index workspace_activity_workspace_created_idx on public.workspace_activity(workspace_id,created_at desc);
alter table public.workspace_activity enable row level security;
create policy "members read workspace activity" on public.workspace_activity for select to authenticated using(public.is_workspace_member(workspace_id));
-- No direct INSERT, UPDATE, or DELETE policy: history is append-only through the RPC.
create function public.record_workspace_activity(target_workspace uuid,event_type text,workflow_type text,sharing_context text,policy_version bigint,total_findings integer,credential_count integer,email_count integer,phone_count integer,internal_ip_count integer,internal_url_count integer,public_url_count integer,qr_count integer,metadata_count integer,protected_count integer,warning_count integer,verification_status text,review_status text) returns uuid
language plpgsql security definer set search_path=public as $$
declare activity_id uuid;
begin
 if auth.uid() is null or not public.is_workspace_member(target_workspace) then raise exception 'Not authorized'; end if;
 if event_type not in ('SCREENSHOT_VERIFIED','SCREENSHOT_APPROVED','BATCH_ITEM_APPROVED','TEAM_POLICY_UPDATED') then raise exception 'Invalid event'; end if;
 if workflow_type not in ('SINGLE','BATCH','POLICY') or sharing_context<>'Team Policy' then raise exception 'Invalid context'; end if;
 if policy_version is null or policy_version<=0 then raise exception 'Invalid version'; end if;
 if total_findings not between 0 and 10000 or credential_count not between 0 and 10000 or email_count not between 0 and 10000 or phone_count not between 0 and 10000 or internal_ip_count not between 0 and 10000 or internal_url_count not between 0 and 10000 or public_url_count not between 0 and 10000 or qr_count not between 0 and 10000 or metadata_count not between 0 and 10000 or protected_count not between 0 and 10000 or warning_count not between 0 and 10000 then raise exception 'Invalid counts'; end if;
 if credential_count+email_count+phone_count+internal_ip_count+internal_url_count+public_url_count+qr_count+metadata_count>total_findings or protected_count>total_findings or warning_count>total_findings then raise exception 'Invalid totals'; end if;
 if (event_type='TEAM_POLICY_UPDATED' and not(workflow_type='POLICY' and total_findings=0 and verification_status='UPDATED' and review_status='NOT_REQUIRED')) or (event_type<>'TEAM_POLICY_UPDATED' and (workflow_type='POLICY' or verification_status not in ('VERIFIED','APPROVED') or review_status not in ('PENDING','APPROVED'))) then raise exception 'Invalid state'; end if;
 insert into public.workspace_activity(workspace_id,actor_user_id,event_type,workflow_type,sharing_context,policy_version,total_findings,credential_count,email_count,phone_count,internal_ip_count,internal_url_count,public_url_count,qr_count,metadata_count,protected_count,warning_count,verification_status,review_status) values(target_workspace,auth.uid(),event_type,workflow_type,sharing_context,policy_version,total_findings,credential_count,email_count,phone_count,internal_ip_count,internal_url_count,public_url_count,qr_count,metadata_count,protected_count,warning_count,verification_status,review_status) returning id into activity_id;
 return activity_id;
end $$;
revoke all on function public.record_workspace_activity(uuid,text,text,text,bigint,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,text) from public;
grant execute on function public.record_workspace_activity(uuid,text,text,text,bigint,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,text) to authenticated;
