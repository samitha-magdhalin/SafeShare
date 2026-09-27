# SafeShare Desktop Agent Architecture

Status: Phase 2 proposal only. No desktop agent is implemented by this document.

## Product split

### SafeShare Console

The existing React, TypeScript, Vite, and Supabase application remains the control plane for authentication, workspaces, roles, Team Policy, privacy-safe activity metadata, invitations, and the browser-local protection workflow.

The current web application stays at the repository root until an Agent proof of concept demonstrates that a larger repository move is worthwhile.

### SafeShare Agent

The Agent is a Windows-local employee application. It notices new clipboard images, evaluates them locally, and alerts the employee only when effective policy requires protection or review.

Screenshot contents, OCR output, findings, and protected images must never be uploaded to the Console.

## Intended workflow

~~~text
Win + Shift + S
-> image enters the Windows clipboard
-> Agent notices a new clipboard image
-> repeated clipboard notifications are deduplicated
-> image is decoded locally
-> OCR and detectors run locally
-> effective policy is applied locally
-> no relevant issue: remain quiet
-> protection or review required: show a local notification
-> employee opens Review & Protect
-> protected output is generated locally
-> a fresh local verification scan runs
-> employee approves the exact verified output
-> protected output is copied to the clipboard
-> employee pastes it into the intended application
~~~

## Explicit boundaries

The Agent is not:

- A screen recorder
- A keylogger
- Employee surveillance
- A continuous screen-capture service
- An application that uploads clipboard contents
- An application that silently modifies arbitrary files
- A network interceptor for Teams, Slack, browsers, email, Jira, or AI tools

M1 observes clipboard image events only. It does not monitor clipboard text or continuously capture the screen.

## Technology recommendation

Use **Tauri 2 with a React and TypeScript review UI plus a narrow Rust Windows shell**.

The Rust shell should own:

- Process, single-instance, and tray lifecycle
- Windows clipboard image event integration
- Image extraction from Windows clipboard formats
- Notification dispatch
- Resource and concurrency limits
- A minimal allowlisted command and event bridge

The TypeScript layer should own the reusable privacy engine and review experience. OCR worker, WASM, trained data, QR, and metadata dependencies must be packaged locally.

### Comparison

| Criterion | Tauri 2 and React/TypeScript | Electron | Native .NET/C# shell |
|---|---|---|---|
| TypeScript engine reuse | Strong, with focused native adapters | Strongest direct reuse | Requires WebView2 hosting or a rewrite |
| Bundle size | Usually smaller by reusing WebView2 | Largest because Chromium and Node ship | Potentially compact, with Windows runtime decisions |
| Idle memory | Expected below Electron; must be measured with OCR loaded | Usually higher due to Chromium processes | Potentially lowest, depending on embedded engine |
| Tray | Built-in Tauri capability | Mature main-process Tray API | Available through Windows desktop APIs |
| Clipboard image events | Rust Windows adapter or proven plugin required | Mature clipboard API; monitoring still needs design | Best direct Windows API access |
| Notifications | Official plugin; packaged behavior must be tested | Built-in, with Windows identity considerations | Native Windows App SDK support |
| Security surface | Narrow command allowlist and local WebView content | Larger Chromium, Node, preload, and IPC surface | Small native shell possible; engine bridge still needs security |
| Installer/signing | MSI or NSIS and Windows signing paths exist | Mature packaging and signing ecosystem | Strong MSIX and enterprise deployment path |
| Maintainability | Best balance for this TypeScript project | Fastest JS route but larger patching burden | Adds C# ownership and duplicate-engine risk |

### Decision

Tauri is recommended because it balances reuse of the existing TypeScript engine, a small native authority boundary, lower normal distribution overhead than Electron, and an established Windows installer path.

This recommendation is conditional on an M1 spike proving reliable clipboard image events and local OCR in a tray-oriented Tauri process. If that spike fails, prefer a small native .NET clipboard host that invokes the same TypeScript engine locally. Do not rewrite privacy rules in C#.

Electron remains a fallback for rapid prototyping, but its Chromium and Node footprint plus IPC security maintenance are less attractive for a background security application.

## Proposed component boundary

~~~mermaid
flowchart LR
    C[Windows clipboard image] --> H[Native clipboard host]
    H --> D[Event deduplication]
    D --> A[Local image adapter]
    A --> E[Shared privacy engine]
    E --> P[Local policy evaluation]
    P -->|No action| Q[Remain quiet]
    P -->|Protect or review| N[Local notification]
    N --> R[Review and Protect UI]
    R --> X[Local protection]
    X --> V[Fresh local verification]
    V --> U[Approval bound to exact output]
    U --> W[Protected image to clipboard]
    M[Console policy metadata] -. M3 only .-> P
    S[Privacy-safe activity metadata] -. M4 only .-> M
~~~

Native and UI IPC must use narrow typed messages. Image bytes must never enter general logs, analytics, crash metadata, or Supabase clients.

## Likely reusable modules

A future packages/privacy-engine package should build from:

- src/detection/detect.ts: text-to-finding detection rules
- src/policy/types.ts: policy model
- src/policy/profiles.ts: local policy profiles where appropriate
- src/policy/evaluatePolicy.ts: policy evaluation
- src/verification/verify.ts: verification comparison
- src/batch/model.ts: reusable state derivation patterns
- src/report/buildReport.ts: privacy-safe report model construction
- Shared finding and scan result types under src/types

These modules must remain the single source of policy and detection semantics.

## Browser-specific pieces requiring adapters

- src/detection/ocrImage.ts: browser Worker behavior and OCR asset URLs
- src/detection/scan.ts: Blob-oriented orchestration
- src/detection/qr.ts: browser pixel acquisition
- src/metadata/inspect.ts: Blob and EXIF input
- src/utils/image.ts: createImageBitmap, canvas, toBlob, and object URLs
- src/utils/useObjectUrlCleanup.ts: browser URL ownership
- App, Batch, Review, and clipboard UI: DOM and React lifecycle
- Supabase browser client and SaaS shell: Console-only concerns

Future engine adapters should accept immutable RGBA buffers, dimensions, and local encoded bytes. The core engine must not depend on Tauri, Electron, Windows handles, Supabase, React, object URLs, or DOM APIs.

## Future repository shape

Do not move the current application yet.

~~~text
SafeShare/
  apps/
    web/
    agent/
  packages/
    privacy-engine/
    privacy-engine-browser/
  supabase/
  docs/
~~~

Extraction should be incremental and protected by parity tests after M1 proves the boundary.

## Agent M1: local detection proof of concept

Windows only.

Included scope:

- Tray application with no cloud screenshot path
- Clipboard image update detection
- Ignore clipboard text and non-image events
- Deduplicate repeats with a short-lived content fingerprint and event generation
- Extract one image into process memory
- Enforce format, dimension, pixel, and memory limits
- Run packaged OCR locally
- Run the existing detector locally
- Evaluate against a bundled local test policy
- Stay quiet when no finding requires attention
- Show one local notification when protection or review is required
- Release image, OCR, and finding memory after the decision
- Privacy-safe development diagnostics without OCR or values

Excluded from M1:

- Review and protection UI
- Clipboard replacement
- Supabase authentication or policy sync
- Activity submission
- Startup registration
- Auto-update
- Installer signing
- Managed deployment
- Clipboard text monitoring

Success demonstration:

~~~text
Synthetic screenshot containing a fake credential
-> Windows clipboard receives the image
-> SafeShare notices it once
-> local OCR and detection run
-> policy requires attention
-> one Windows notification appears
-> network inspection shows no image-derived outbound data
~~~

M1 evidence must also include a clean image that causes no notification, repeated events producing one scan, idle and scan resource measurements, ignored clipboard text, a no-network capture, and web/Agent engine parity tests.

## Agent M2: protection workflow

- Review & Protect window
- Original and Protected comparison
- Deterministic local protection
- Fresh local verification
- Human approval
- Copy Protected Image
- Approval bound to exact output bytes, verification result, and policy version
- Deduplicate the Agent's own protected clipboard write

## Agent M3: Console policy integration

- Authenticate the Agent securely
- Fetch workspace identity and Team Policy configuration only
- Cache the minimum validated policy and version locally
- Define cache encryption and OS-account binding
- Fail closed when required policy is missing, invalid, expired, or stale
- Invalidate verification and approval on policy changes
- Never send screenshot, OCR, or finding content to Supabase

Offline maximum policy age, any grace period, user messaging, and permitted actions require an explicit product decision.

## Agent M4: privacy-safe activity integration

Allowed metadata:

- Workspace identifier
- Actor and approved device-safe identifier
- Workflow or event type
- Team Policy version
- Generic category counts
- Protected count
- Verification and review state
- Timestamp

Forbidden data:

- Screenshot pixels or clipboard images
- Original or protected files
- OCR text, words, or boxes
- Finding descriptions or raw/masked values
- Detected emails, phone numbers, IP addresses, or URLs
- Credentials, API keys, tokens, passwords, or database strings
- QR payloads
- EXIF contents
- Privacy report contents

The network boundary should receive counts, never finding objects.

## Agent M5: enterprise hardening

Future only:

- Signed installer
- Startup behavior
- Managed deployment
- Update mechanism
- Device registration
- Offline policy behavior
- Enterprise proxy environments
- Telemetry controls
- Crash handling
- Accessibility
- Performance and resource limits

M5 is not part of the initial Agent implementation.

## Privacy and security invariants

1. Clipboard image bytes stay local.
2. OCR text and boxes stay local.
3. Findings and detected values stay local.
4. Logs contain no image-derived values.
5. Supabase clients accept only policy, account, and allowlisted activity metadata.
6. Clean images cause no notification and no activity by default.
7. Protected clipboard writes are marked or deduplicated.
8. Approval binds to exact output bytes, current verification, and policy version.
9. Native commands are allowlisted and validate size, type, and state.
10. The review WebView loads packaged local content only.
11. Network access is isolated to explicit M3 and M4 control-plane clients.
12. Raw clipboard images are not persisted to disk in M1.

## Current Console validation status

Validated live:

- Owner authentication
- Workspace creation and roster
- Team Policy read/write
- Policy version invalidation
- Privacy-safe verified activity event
- Invitation creation and pending display
- Invitation token generation
- Roster SQL fix

Still pending before production:

- Complete invitation acceptance lifecycle
- Wrong-account rejection
- Reuse rejection
- Member and Admin live permission validation
- Cross-workspace RLS validation
- Activity mutation and RLS checks
- Re-enable email confirmation
- Production-like authentication test
- Final hosted network privacy inspection

No pending item is marked as validated.

## Risks and unknowns before M1

1. Windows duplicate clipboard events from Snipping Tool and other capture tools.
2. PNG, DIB, DIBV5, bitmap handles, alpha, color profiles, DPI, and multi-monitor behavior.
3. Clipboard locking and retry behavior.
4. Whether available Tauri APIs can monitor and extract images reliably; otherwise use a minimal Rust Windows adapter.
5. Tesseract Worker, WASM, and trained-data loading from packaged local assets.
6. OCR idle and peak CPU and memory behavior.
7. Notification activation across development and packaged builds.
8. Feedback loops after M2 writes a protected image.
9. Crash dumps and image-buffer lifetime.
10. Web and Agent engine parity.
11. WebView2 availability in offline enterprise environments.
12. Certificate ownership, signing, and SmartScreen reputation.
13. Endpoint security, clipboard policies, proxies, and least-privilege installation.
14. Keyboard and screen-reader accessibility.
15. Network evidence proving no image-derived transmission.

## Decision gates before M1

Proceed with Tauri only after a disposable technical spike proves:

- Event-driven clipboard image monitoring
- Reliable Snipping Tool image extraction
- One-event deduplication
- Local Tesseract execution from packaged assets
- Local notification activation
- Acceptable idle and scan resource use
- No image-derived network traffic

If clipboard or OCR reliability fails, evaluate a native .NET clipboard host that invokes the same TypeScript engine locally. Do not create a second privacy engine.
