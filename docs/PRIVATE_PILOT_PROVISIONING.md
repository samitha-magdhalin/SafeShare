# Private Pilot Provisioning

This runbook is for trusted SafeShare operators provisioning the first controlled company pilots. Perform these steps in the Supabase SQL Editor and SafeShare Console. Never place a `service_role` key in the Web application, Agent, source control, scripts, or pilot records.

Use placeholders such as `<APPROVED_OWNER_EMAIL>`, `<COMPANY_NAME>`, `<WORKSPACE_ID>`, and `<OPERATOR_USER_ID>`. Do not copy real credentials, passwords, invitation tokens, environment values, or screenshot-derived data into this document or an approval record.

## 1. Approve the pilot

Record the approved company name and normalized owner email through the private pilot process. Invitation tokens and passwords must not be stored in pilot approval records.

## 2. Bootstrap the workspace

In the Supabase SQL Editor, resolve the trusted operator account by exact normalized email. Require exactly one confirmed `auth.users` row and its `public.profiles` row. Check that the proposed normalized company name is not already in `public.workspaces`.

In one transaction:

1. Lock workspace provisioning for the short transaction.
2. Insert one workspace using `<COMPANY_NAME>` and the trusted operator user ID.
3. Insert one `workspace_members` row for that workspace and operator with role `owner`.
4. Verify the owner-membership trigger created exactly one `workspace_policies` row at version 1.
5. Abort with an exception if any precondition or verification fails.

The transaction must return only safe administrative identifiers. An exception must roll back the workspace, membership, and policy together.
### Bootstrap SQL template

Replace every angle-bracket placeholder before review. Run the block as one SQL Editor statement:

```sql
do $provision$
declare
  v_operator_id uuid;
  v_workspace_id uuid;
begin
  lock table public.workspaces in share row exclusive mode;

  select au.id into strict v_operator_id
  from auth.users as au
  where lower(trim(au.email))=lower(trim('<OPERATOR_EMAIL>'))
    and au.email_confirmed_at is not null;

  if not exists(select 1 from public.profiles as p where p.id=v_operator_id) then
    raise exception 'OPERATOR_PROFILE_MISSING';
  end if;
  if exists(select 1 from public.workspace_members as wm where wm.user_id=v_operator_id) then
    raise exception 'OPERATOR_ALREADY_HAS_WORKSPACE';
  end if;
  if exists(select 1 from public.workspaces as w where lower(trim(w.name))=lower(trim('<COMPANY_NAME>'))) then
    raise exception 'WORKSPACE_ALREADY_EXISTS';
  end if;

  insert into public.workspaces(name,created_by)
  values(trim('<COMPANY_NAME>'),v_operator_id)
  returning id into v_workspace_id;

  insert into public.workspace_members(workspace_id,user_id,role)
  values(v_workspace_id,v_operator_id,'owner');

  if (select count(*) from public.workspace_policies as wp where wp.workspace_id=v_workspace_id and wp.version=1)<>1 then
    raise exception 'DEFAULT_POLICY_MISSING';
  end if;

  raise notice 'Provisioned workspace % for temporary operator %',v_workspace_id,v_operator_id;
end
$provision$;
```

## 3. Invite the approved contact

Sign into the SafeShare Console as the temporary operator owner. Create an **Admin** invitation for `<APPROVED_OWNER_EMAIL>`. Deliver the private invitation link directly to the approved contact. Do not store the raw invitation token in the approval record.

The contact opens the invitation route, signs in or creates an account using the invited email, and explicitly accepts the invitation.

## 4. Verify the accepted identity

Before transferring ownership, use the SQL Editor to verify all of the following:

- The invitation belongs to `<WORKSPACE_ID>`.
- Its normalized email equals `<APPROVED_OWNER_EMAIL>`.
- Its status is `accepted`.
- `accepted_by` identifies exactly one `auth.users` row.
- The account email exactly matches the normalized approved email.
- `email_confirmed_at` is present.
- The accepted user currently has role `admin` in that workspace.

Derive the owner user ID from the accepted invitation and matching account. Do not accept a UUID supplied through email, chat, or arbitrary caller input.

## 5. Transfer ownership

In one transaction:

1. Lock the intended workspace and membership rows.
2. Revalidate the accepted invitation and exact approved email.
3. Update the approved contact membership from `admin` to `owner`.
4. Verify exactly one intended owner exists for the workspace.
5. Remove the temporary operator membership.
6. Recheck that the approved contact remains the owner and the default Team Policy still exists.

Keep `workspaces.created_by` and policy update metadata factual. Authorization is determined by `workspace_members`.
### Ownership-transfer SQL template

Replace every placeholder and run the block as one reviewed SQL Editor statement:

```sql
do $transfer$
declare
  target_workspace constant uuid:='<WORKSPACE_ID>'::uuid;
  temporary_operator constant uuid:='<OPERATOR_USER_ID>'::uuid;
  approved_owner_id uuid;
  owner_count integer;
begin
  perform 1 from public.workspaces as w where w.id=target_workspace for update;
  if not found then raise exception 'WORKSPACE_NOT_FOUND'; end if;
  perform 1 from public.workspace_members as wm where wm.workspace_id=target_workspace for update;

  select wi.accepted_by into strict approved_owner_id
  from public.workspace_invitations as wi
  join auth.users as au on au.id=wi.accepted_by
  where wi.workspace_id=target_workspace
    and wi.status='accepted'
    and lower(trim(wi.email))=lower(trim('<APPROVED_OWNER_EMAIL>'))
    and lower(trim(au.email))=lower(trim('<APPROVED_OWNER_EMAIL>'))
    and au.email_confirmed_at is not null;

  if not exists(
    select 1 from public.workspace_members as wm
    where wm.workspace_id=target_workspace and wm.user_id=approved_owner_id and wm.role='admin'
  ) then raise exception 'APPROVED_ADMIN_MEMBERSHIP_MISSING'; end if;

  update public.workspace_members as wm
  set role='owner'
  where wm.workspace_id=target_workspace and wm.user_id=approved_owner_id and wm.role='admin';

  select count(*) into owner_count
  from public.workspace_members as wm
  where wm.workspace_id=target_workspace and wm.role='owner';
  if owner_count<>2 then raise exception 'UNEXPECTED_OWNER_SET_BEFORE_TRANSFER'; end if;

  delete from public.workspace_members as wm
  where wm.workspace_id=target_workspace and wm.user_id=temporary_operator and wm.role='owner';
  if not found then raise exception 'TEMPORARY_OPERATOR_MEMBERSHIP_MISSING'; end if;

  select count(*) into owner_count
  from public.workspace_members as wm
  where wm.workspace_id=target_workspace and wm.role='owner' and wm.user_id=approved_owner_id;
  if owner_count<>1 then raise exception 'INTENDED_OWNER_NOT_ESTABLISHED'; end if;
  if not exists(select 1 from public.workspace_policies as wp where wp.workspace_id=target_workspace) then
    raise exception 'TEAM_POLICY_MISSING';
  end if;
end
$transfer$;
```

The temporary operator membership must be removed before provisioning the next pilot. The current Console workspace discovery is single-workspace oriented.

## 6. Validate access

Ask the approved owner to sign into the Console and verify:

- The intended workspace loads once.
- The displayed role is `owner`.
- Team Policy loads.
- Team roster loads.
- Invitation management is available.
- Existing owner policy authorization works.

The owner can then invite admins and members through the existing invitation system.

## 7. Rollback and cancellation

If bootstrap provisioning fails, allow the transaction to roll back. Do not manually preserve a partial workspace.

If the pilot is cancelled before invitation acceptance, revoke the pending invitation and delete the bootstrap workspace in one reviewed transaction. Workspace deletion cascades its related memberships, policy, invitations, and activity.

If cancellation occurs after acceptance but before ownership transfer, verify the workspace and accepted identity, then remove the entire workspace in one reviewed transaction when appropriate.

To reverse an ownership transfer, first restore a trusted operator as owner and verify that membership. Only then demote or remove the company contact. Never leave a workspace without a verified owner.

Restoring public workspace creation requires an explicit forward decision and grant. Do not grant `create_workspace(text)` to `authenticated` during routine pilot operations.