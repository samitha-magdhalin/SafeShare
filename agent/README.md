# SafeShare Agent M2

SafeShare Agent is a Windows desktop development checkpoint for browser-local screenshot detection, review, protection, fresh verification, and explicit clipboard approval. It reuses the SafeShare web OCR, detector, policy, protection, and verification modules.

## Architecture

- Rust owns the tray, the `WM_CLIPBOARDUPDATE` listener, in-memory PNG/DIB image conversion, notifications, review-window commands, and the explicit protected-image clipboard write.
- The local Tauri WebView owns SHA-256 deduplication, packaged Tesseract/WASM OCR, detection, Client Sharing policy evaluation, protection, fresh verification, review state, and approval state.
- An attention-required screenshot becomes the active volatile review candidate. While it is active, the Agent retains at most the newest pending candidate. Promotion clears protected output, verification, and approval state before the pending candidate becomes active.
- Protection uses the shared deterministic SafeShare image protection function. The resulting Blob receives a complete new OCR and detector scan. Approval remains unavailable unless `verifyImage` reports the fresh result ready.
- Approval is bound to the SHA-256 fingerprint of the exact protected bytes. `Approve & Copy` recalculates the fingerprint before invoking the native write.
- Rust decodes the approved PNG in memory and publishes equivalent pixels as `CF_DIBV5`. The Agent registers the protected fingerprint before writing so its own clipboard event is consumed without a feedback scan.
- Dismiss clears the active original and protected byte buffers held by the review UI and does not write to or clear the Windows clipboard.

The local M2 policy is the existing **Client Sharing** profile: credentials `BLOCK`; email, phone, internal IP, and internal URL `PROTECT`; public URL `ALLOW`; QR and metadata `WARN`. M2 does not synchronize a workspace Team Policy.

## Privacy boundary

- The native listener checks only PNG, `CF_DIBV5`, and `CF_DIB` image formats. It does not request clipboard text.
- Screenshot pixels, OCR text, findings, protected images, and approval state remain in process memory.
- The Agent does not persist screenshots or OCR output to disk, browser storage, Supabase, or another service.
- There is no cloud OCR, application network client, telemetry, analytics, or activity logging.
- Development logs are typed and limited to lifecycle events, finding count, attention boolean, duration, and generic error category. They do not include OCR text, detected values, previews, finding descriptions, image bytes, or clipboard contents.

## Prerequisites and commands

Use Node.js, Microsoft WebView2, the stable Rust MSVC toolchain, and Microsoft C++ Build Tools with an appropriate Windows SDK.

```powershell
cd D:\SafeShare\agent
npm install
npm test
npm run build
npm run check:native
npm run tauri dev
```

The final command starts the local processing WebView and adds **SafeShare Agent** to the Windows tray. The tray provides `Status: Running`, `Review latest screenshot` when a review is available, and `Quit`.

## Manual M2 validation

M2 was manually validated on the current Windows development machine with synthetic screenshots. The observed behavior was:

- Win+Shift+S clipboard images were automatically detected.
- A sensitive screenshot produced the SafeShare warning and could be opened from `Review latest screenshot`.
- The original screenshot rendered in Review.
- Synthetic credentials, email addresses, and internal URLs were detected and protected in the final retest.
- Credential values were completely covered in the validated screenshots while labels remained where geometry permitted.
- `Protect & Verify` performed a fresh OCR and detector scan of the protected Blob.
- Fresh verification blocked approval while required sensitive information remained and enabled approval after a successful result.
- `Approve & Copy` wrote the exact verified protected image to the Windows clipboard, and that image pasted successfully into Paint.
- The Agent did not create another review from its own clipboard write.
- An active review was not silently replaced. The newest pending screenshot was promoted after the first review and used its own findings, geometry, protected output, verification, and approval state.
- Credential and email protection succeeded for the promoted screenshot in the final retest.
- Dismiss remained non-destructive to the Windows clipboard.
- Tray launch, status, review command, and quit behavior worked without an immediate crash.

These observations apply only to the current Windows development machine. They do not establish universal Windows compatibility, perfect detection, zero false positives or negatives, enterprise readiness, production readiness, or a complete privacy proof.

## Manual regression procedure

Use synthetic data only.

1. Start the Agent with `npm run tauri dev` and confirm the tray icon and `Status: Running`.
2. Capture a screenshot containing a synthetic credential assignment, email address, and internal URL.
3. Open **Review latest screenshot**, confirm the original image and expected policy counts, and select **Protect & Verify**.
4. Confirm the protected preview removes the complete sensitive values and that approval remains unavailable if fresh verification finds a required remainder.
5. After successful verification, select **Approve & Copy**, paste into Paint, and inspect the pasted pixels.
6. Confirm the Agent does not notify or create another review from its own clipboard write.
7. Repeat while another screenshot is active. Confirm the newer screenshot waits, is promoted only after the first review finishes or is dismissed, and uses its own findings and protection geometry.
8. Dismiss a review before approval and confirm the clipboard remains unchanged.

## Remaining limitations

- Notification-click activation is not treated as a dependable development contract; the validated fallback is **Tray ? Review latest screenshot**.
- Detection remains dependent on local OCR quality and can produce false positives or false negatives.
- Clipboard image support is limited to the implemented PNG, uncompressed or bitfield 24/32-bit DIB, and DIBV5 paths, with existing byte and pixel limits.
- Clipboard lock contention fails safely and does not currently use a retry policy.
- M2 has no installer validation, startup registration, code-signing validation, Team Policy synchronization, Supabase integration, cloud processing, activity logging, or enterprise deployment support.