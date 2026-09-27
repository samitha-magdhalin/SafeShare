# Supabase setup

SafeShare uses Supabase only for its account and workspace control plane. Screenshot pixels, image blobs and URLs, OCR output, detected values, findings, protected images, reports, and clipboard content remain in browser memory and are not written to Supabase.

## Project setup

1. Create a Supabase project.
2. In **Project Settings > API**, copy the project URL and public anon key. Never use a service role key in this Vite application.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. In the Supabase SQL editor, run `supabase/migrations/202609260001_saas_foundation.sql`.
5. In **Authentication > Providers**, enable Email. Configure the site URL and redirect URLs for local development and the production domain. Decide whether email confirmation is required.
6. Run `npm install` and `npm run dev`.

For Vercel, add the same two public variables in Project Settings > Environment Variables and redeploy. Do not add a service role key.

## Database authorization

RLS is enabled on every application table. A user can read and update only their own profile. Workspace and membership reads require membership in that workspace. `is_workspace_member` is a security-definer helper that prevents recursive membership policies. `create_workspace` validates the caller and name, then creates the workspace and owner membership in one transaction. Direct browser insert policies are intentionally absent.

## Manual test plan

### Unconfigured mode

Run without the two environment variables. Confirm the development-mode notice appears and Single and Batch scanning remain available without network calls.

### Account and workspace

Configure Supabase, create a synthetic account, handle email confirmation if enabled, create `SafeShare Demo Team`, and confirm the Team page reports the owner role. Refresh and confirm session and workspace restoration. Sign out and confirm workspace pages are inaccessible.

### Privacy workflow

Paste a synthetic screenshot containing fake credentials and an account-like email. Complete Scan, Protect & Verify, Review, and Approve & Copy. In browser DevTools, confirm no request body contains image data, OCR text, detected values, findings, or reports. Confirm Supabase contains only profile, workspace, and membership rows.

## Feature 8: Team Policy Management

After applying `202609260001_saas_foundation.sql`, apply `supabase/migrations/202609260002_team_policy.sql` in the Supabase SQL editor. It creates only workspace policy configuration and safe update metadata.

Every workspace receives a validated default policy. Workspace members may read it. Owners and admins may update it only through the version-checked `update_workspace_policy` RPC; members cannot update it and non-members cannot read it. The database validator requires exactly the eight supported categories and only `BLOCK`, `PROTECT`, `WARN`, or `ALLOW` values.

With Supabase configured, the scanner fails closed until the required team policy loads. Single and Batch workflows use the same policy and version. A policy version change invalidates stale verification and human approval before copy or export. Local unconfigured development continues using device-local profiles.

No image, OCR output, finding, detected value, protected image, or report belongs in `workspace_policies` or an RPC payload.

## Feature 9: Privacy-Safe Workspace Activity

Apply `supabase/migrations/202609260003_workspace_activity.sql` after the SaaS foundation and team policy migrations. Activity is append-only metadata evidence. Members can read only their workspace through RLS; direct insert, update, and delete policies do not exist. Authenticated members create records only through `record_workspace_activity`, which derives the actor from `auth.uid()` and validates every enum, status, version, and bounded count.

Stored fields are workspace and actor IDs, allowlisted event/workflow types, the `Team Policy` context, policy version, total and generic category counts, protected and warning counts, verification/review status, and timestamp. SafeShare never stores screenshots, filenames, pixels, Files, Blobs, Blob URLs, OCR output, bounding boxes, raw or masked values, detected emails/phones/IPs/URLs/credentials, QR or EXIF values, reports, or clipboard contents in activity.

Manual validation: apply the migration, complete a single verification and approval, approve a batch item, and update team policy. Confirm one metadata-only event per transition, newest-first Activity pagination, member-only reads, denied direct mutations, and that a forced activity RPC failure shows a warning without changing local Ready authorization.

## Feature 10: Company Workspace Invitations

Apply `supabase/migrations/202609260004_workspace_invitations.sql` after the Feature 9 activity migration. The migration creates `workspace_invitations`, strict RLS, token-based invitation RPCs, and a safe workspace roster RPC.

Invitation links use a 32-byte cryptographically random token. Only its SHA-256 digest is stored. The raw token exists in the creation response and invite URL long enough for the inviter to copy and send it; it is not stored in activity, reports, localStorage, sessionStorage, or pending invitation rows. Pending invitations expire after seven days, with expiry enforced by database functions.

Owners can invite Admins or Members and revoke pending invitations. Admins can invite and revoke Member invitations only. Members cannot list or manage invitations. Direct invitation and membership writes remain unavailable to browser clients. Acceptance is an atomic security-definer RPC that derives the current account from `auth.uid()`, requires a confirmed current account email, compares it to the normalized invited email, uses the stored role, inserts membership once, and marks the invitation accepted.

No paid email provider is required for the private pilot. After creating an invitation, use **Copy invite link** and send it manually through the company's chosen communication channel. The link alone cannot join a workspace; the signed-in, confirmed account email must match.

For production, enable email confirmation in Supabase Authentication and add the deployed origin plus `/invite/*` paths to the allowed redirect URLs. Keep local development origins in the redirect allowlist while testing. Do not disable confirmation as an invitation workaround.

Manual validation: create a Member invitation as an owner, copy it, open it in a signed-out browser profile, create or sign in to the matching confirmed account, and confirm the existing workspace opens without workspace creation. Repeat with a different account and confirm rejection. Also test expiry, revocation, an owner-created Admin invitation, an Admin-created Member invitation, and denial of Admin-to-Admin and Member invitation attempts.
