# SafeShare Agent M4

SafeShare Agent is a Windows desktop development checkpoint for local screenshot detection, review, protection, fresh verification, clipboard approval, company authentication, workspace selection, and Team Policy synchronization. It reuses the SafeShare web OCR, detector, policy, protection, and verification modules.

## Architecture

- Rust owns the tray, Windows clipboard listener, in-memory image conversion, notifications, review-window commands, clipboard image writes, and the small Team Policy cache file.
- The Tauri WebView owns authentication UI, workspace selection, Team Policy validation, local OCR/detection/protection/verification, review state, and approval state.
- The Agent reads the existing RLS-protected workspace_members, workspaces, and workspace_policies data. M3 needs no database migration.
- Supabase auth persistence is disabled. The session and password are not written to browser storage or plaintext files.
- One accessible workspace is selected automatically. Multiple workspaces require a choice. An account with no workspace remains blocked.
- The server policy is preferred. A validated cache may be used offline only for the same workspace ID.
- Each review is bound to its exact workspace, policy version, and validated rules.
- A policy version or rule change reevaluates local findings and clears protected output, verification, approval, Ready state, and copy authorization.
- Policy loading runs before each clipboard review and before protection. Missing or malformed policy state fails closed.
- Sign out clears active and pending screenshots, protected bytes, verification, approval, workspace, and policy from memory.

## Configuration

The Agent reads the repository root public Vite configuration:

    VITE_SUPABASE_URL=
    VITE_SUPABASE_ANON_KEY=

agent/.env.example documents these values. Never place a service-role key in the Agent. Account and workspace administration remain in the SafeShare Console.

## Privacy boundary

Supabase may receive authentication/session traffic, RLS-scoped workspace membership reads, and Team Policy reads.

The Agent does not send screenshot pixels, clipboard image bytes, OCR text or words, bounding boxes, findings, detected values, protected images, verification details, or approval state to Supabase. OCR, detection, protection, and verification remain local.

The M3 disk cache contains only workspace ID/name, policy version, validated category/action rules, and fetch timestamp. It contains no screenshots, OCR, findings, protected images, reports, passwords, or auth tokens. Development logs remain structural and contain no OCR text or detected values.

## Commands

    cd D:\SafeShare\agent
    npm install
    npm test
    npm run build
    npm run check:native
    npm run tauri dev

The tray shows running status, selected workspace, policy version/source, Review latest screenshot, Open SafeShare Agent, and Quit.

## M2 Windows validation retained

M2 was manually validated on the current Windows development machine with synthetic screenshots. Win+Shift+S detection, sensitive review, credential/email/internal URL protection, fresh verification, exact approved clipboard output, self-write suppression, pending review promotion, non-destructive dismissal, and tray lifecycle were observed working.

These observations apply only to the current Windows development machine and do not establish universal compatibility, perfect detection, enterprise readiness, or zero false positives/negatives.

## Manual M3 validation still required

Use synthetic data only.

1. Start online and sign in with an existing confirmed SafeShare account.
2. Confirm zero, one, and multiple-workspace behavior as applicable. Verify tray workspace and Team Policy version.
3. Capture a synthetic sensitive screenshot. Confirm actions match Team Policy, then protect, freshly verify, approve, and paste into Paint.
4. Change Team Policy in the web console. Refresh Agent policy and confirm old protected output, verification, approval, Ready state, and copy authorization are invalidated while local findings are reevaluated.
5. Reprocess under the new version and confirm the new version through approval.
6. During the same authenticated run, disconnect after a valid same-workspace policy is cached. Confirm the Agent clearly reports offline cached policy use.
7. Remove or corrupt the cache in a controlled offline test and confirm review/share authorization remains unavailable.
8. Sign out and confirm all review state disappears and tray status returns to sign-in required/policy unavailable.

## Remaining limitations

- M3 needs the manual authentication, workspace, online/offline policy, policy-change, and sign-out tests above.
- Session persistence is intentionally disabled; restart requires sign-in.
- Offline policy use requires the authenticated in-memory session for the running process. Cache is not authentication.
- Detection depends on local OCR quality and can produce false positives or false negatives.
- Clipboard support remains limited to implemented PNG and supported DIB/DIBV5 paths.
- Notification click activation is not a dependable development contract; tray Review is the fallback.
- Installer, startup registration, code signing, activity logging, enterprise deployment, and universal Windows compatibility are not validated.

## M4 privacy-safe workspace activity

M4 reuses the existing append-only workspace_activity table and record_workspace_activity RPC. It records only these canonical events:

- SCREENSHOT_VERIFIED after a fresh protected-image scan succeeds with no unresolved required BLOCK or PROTECT findings under the current Team Policy version.
- SCREENSHOT_APPROVED after the user explicitly selects Approve & Copy and the exact verified protected image is successfully written to the Windows clipboard.

The Agent activity DTO contains only workspace ID, canonical event type, and Team Policy version. The existing RPC requires count fields, so the Agent sends zero for every total, category, protected, and warning count. It does not calculate or transmit screenshot-derived activity counts. There is no device/source column in the existing safe schema, so M4 does not overload another field or collect a device identity.

Activity writes are authorized by the existing Supabase function. The function derives the actor from auth.uid(), rejects non-members, validates allowlisted values, and inserts into an append-only table. Direct browser inserts, updates, and deletes remain unavailable.

Successful activity writes are deduplicated in memory by event type, workspace ID, policy version, and protected-output fingerprint. The fingerprint is used only for local lifecycle deduplication and is never included in the activity DTO or RPC. Policy changes and workspace changes prevent stale authorization from producing an event. Sign out disables later writes.

Activity failure does not change successful local protection, verification, approval, or clipboard output. The Agent displays:

    Protected successfully. Workspace activity could not be updated.

M4 has no offline activity queue. When offline, valid cached Team Policy behavior remains governed by M3, while an activity write may fail safely without persisting tracking data for later submission.

This activity is evidence of the SafeShare security workflow. It is not employee monitoring. M4 does not collect device identity, hostname, Windows username, IP address, heartbeat, productivity information, screenshot content, OCR, findings, detected values, filenames, reports, or arbitrary metadata.

## Manual M4 Console validation still required

1. Sign in to the Agent and confirm the correct workspace, role, and Team Policy version.
2. Capture a screenshot containing synthetic sensitive data.
3. Complete Protect & Verify successfully.
4. Open Console Activity and confirm exactly one Screenshot verified event appears with the correct policy version.
5. Confirm the event contains no screenshot details, findings, categories, values, filenames, or device identity.
6. Select Approve & Copy and confirm the protected image reaches the clipboard.
7. Refresh Console Activity and confirm exactly one Screenshot approved event appears with the same authorizing policy version.
8. Reopen the Agent window and repeat rendering actions without creating duplicate events.
9. Cause a fresh verification failure and confirm no successful verified event is recorded for that attempt.
10. Cause a clipboard write failure and confirm no approved event is recorded.
11. Change Team Policy before approval and confirm stale approval remains unavailable and no stale-version approval event is written.
12. During the same authenticated run, disconnect the network with a valid same-workspace cached policy and complete a safe local workflow.
13. Confirm local protection remains usable and the Agent reports that workspace activity could not be updated.
14. Confirm no offline activity queue or later automatic replay occurs.
15. Inspect Supabase network requests. Activity requests should contain workspace ID, canonical event type, Team Policy version, SINGLE workflow, Team Policy context, required statuses, and zero counts.
16. Confirm request payloads contain no image/blob/base64 data, OCR, findings, descriptions, detected values, geometry, filenames, reports, or device identifiers.

M3 offline cached-policy, sign-out cleanup, and manual network privacy validation remain pending and must be completed alongside the M4 checks.

## Windows Pilot Build

SafeShare Agent 0.1.0 can be packaged as a current-user Windows NSIS installer. This is a private SafeShare Windows Pilot Build, not a production or enterprise release.

### Build configuration

- Product and window name: SafeShare Agent
- Stable neutral application identifier: app.safeshare.agent
- Version: 0.1.0
- Installer: NSIS current-user installation
- WebView2: download bootstrapper when the runtime is missing
- Startup: off and not implemented
- Single instance: official Tauri plugin; a second launch shows and focuses the existing Agent
- Signing: no certificate is configured, so pilot artifacts are unsigned

The existing repository-owned development icon remains in use. Final branding is pending.

### Production Supabase configuration

Vite substitutes VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time. The installed application does not read the developer's .env.local file at runtime.

For a pilot release, provide only the public Supabase project URL and publishable/anonymous client key in the controlled build environment or ignored .env.production.local file. Never provide a service-role key, database password, developer credentials, signing private key, or test-user password.

Because these client-safe values are compiled into frontend assets, changing them requires rebuilding the Agent.

### Build and artifact command

Run the existing validation commands, then:

    cd D:\SafeShare\agent
    npm run build:pilot

The pilot build wrapper remaps local developer paths from Rust release metadata. Tauri embeds the production frontend and packaged local OCR assets into the application and creates the configured NSIS setup executable. Generated dist, target, OCR copies, executable, and installer artifacts remain ignored.

### Installed behavior

The installed Agent starts as a discoverable tray application. Closing its window hides it without terminating clipboard protection. The tray can open the Agent or current review. Explicit Quit terminates the process.

Screenshot pixels, clipboard bytes, OCR, findings, protected output, and verification remain local. The safe Team Policy cache remains the only application data file intentionally written by SafeShare code. M4 Console activity contains only the minimal workspace, canonical workflow event, policy version, fixed statuses, and zero screenshot-derived counts.

The application does not register itself to start with Windows. Autostart remains pending until a visible opt-in setting and uninstall lifecycle can be implemented and manually tested.

See ../docs/WINDOWS_PILOT_INSTALL.md for installation, use, uninstall, privacy, and unsigned-pilot guidance.
