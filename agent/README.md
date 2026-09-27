# SafeShare Agent M1

This directory contains only the Windows Clipboard Detection technical spike. A native message-only window watches Windows clipboard image updates. Image bytes remain in memory and enter the existing local Tesseract and SafeShare detector pipeline. A Windows notification is shown when the bundled Client Sharing policy returns `BLOCK`, `PROTECT`, or `WARN`.

It does not read clipboard text, replace clipboard contents, persist images, connect to Supabase, send telemetry, or implement protection and approval.

## Architecture and privacy boundary

- Rust owns the tray, `WM_CLIPBOARDUPDATE` listener, in-memory PNG/DIB image extraction, and Windows notification.
- The hidden local Tauri WebView owns SHA-256 deduplication, packaged Tesseract/WASM OCR, existing SafeShare detection, and local policy evaluation.
- The listener checks only PNG, `CF_DIBV5`, and `CF_DIB`. It never requests a clipboard text format.
- Image bytes cross only the local Tauri command bridge. No temporary file, browser storage, network client, Supabase client, analytics, or crash reporter is used.
- Development logs are typed and limited to lifecycle state, finding count, attention boolean, duration, and generic error category.

The bundled M1 policy is the existing **Client Sharing** local profile: credentials `BLOCK`; email, phone, internal IP, and internal URL `PROTECT`; public URL `ALLOW`; QR and metadata `WARN`. It is not a workspace Team Policy.

## Prerequisites and commands

Install the current stable Rust MSVC toolchain, Microsoft C++ Build Tools with the Windows SDK, Microsoft WebView2, and Node.js. This machine currently lacks Rust and the native build tools, so the native check must be completed before manual testing.

```powershell
cd D:\SafeShare\agent
npm install
npm test
npm run build
npm run check:native
npm run tauri dev
```

The last command starts the hidden processing WebView and shows **SafeShare Agent** in the Windows tray. Use the tray menu to verify `Status: Running` or select `Quit`.

## Manual M1 procedure

Use synthetic data only.

1. Start the Agent with `npm run tauri dev` and confirm the tray icon and `Status: Running`.
2. **Sensitive screenshot:** display `API_KEY=sk_test_safeshare_8H2K9M4P7Q`, `CUSTOMER_EMAIL=ananya.demo@example.com`, and `INTERNAL_API=http://192.168.1.25:8080/admin`. Press Win+Shift+S and capture it. Expect one local SafeShare notification after OCR completes.
3. **Clean screenshot:** capture harmless text without private data. Expect local processing and no notification.
4. **Duplicate:** leave the clipboard unchanged. Expect no continuous rescans or notifications. If another application republishes identical image bytes, the SHA-256 deduplicator should still reject it.
5. **Text clipboard:** copy normal text. Expect no scan and no notification; the native reader returns `None` without requesting text.
6. **Quit:** choose `Quit` from the tray, then capture another screenshot. Expect no SafeShare processing or notification.

Development diagnostics may be inspected while running from the terminal. They must contain no OCR text, finding descriptions, or detected values.

## Network privacy check

This is a narrow runtime observation, not universal proof:

1. Close unrelated applications where practical.
2. Start Windows Resource Monitor (`resmon.exe`) or Sysinternals TCPView and filter for `safeshare-agent.exe` and its WebView2 child processes.
3. Start the Agent, then run the sensitive and clean tests.
4. Verify that no external TCP connection is created by `safeshare-agent.exe`. WebView2 may have unrelated platform behavior, so correlate destination, process, and timestamp rather than assuming every machine-wide request belongs to SafeShare.
5. For stronger evidence, repeat with a packet capture filtered to the Agent process, or run temporarily behind a deny-all outbound firewall rule. Confirm OCR still completes and notification behavior is unchanged.
6. Do not inspect or export payloads containing real sensitive screenshots. Use only the synthetic fixture above.

The packaged OCR files are loaded from the Tauri application origin. The M1 source contains no application network client, Supabase integration, telemetry, or remote OCR configuration.

## Known M1 limits

- Native compilation and real clipboard testing remain pending until Rust MSVC and Microsoft C++ Build Tools are installed.
- Tauri production custom-protocol support for the existing OCR asset `HEAD` checks must be validated in the real runtime.
- The DIB adapter handles uncompressed or bitfield 24/32-bit DIB data and caps inputs at 128 MiB and 40 million pixels. Other clipboard image encodings fail safely.
- Clipboard lock contention currently yields a categorized failure; retry/backoff behavior needs evidence from manual Snipping Tool tests before refinement.
- M1 has no protection workflow, policy synchronization, startup registration, installer, or clipboard replacement.

## M1 validation

M1 was manually validated on the current Windows development machine. The validated behavior was:

- The Agent launched and its Windows tray lifecycle worked.
- A Win+Shift+S screenshot entered the clipboard and triggered local image processing.
- A synthetic screenshot containing a fake API key assignment, customer email, and internal URL produced the SafeShare sensitive-information notification.
- A harmless screenshot was processed without a notification.
- An unchanged clipboard image did not continuously rescan or repeatedly notify.
- Copying ordinary clipboard text did not trigger the image workflow.
- Quitting from the tray stopped subsequent Agent activity.

These results establish the M1 workflow on this development machine. They do not establish universal Windows compatibility, detection completeness, enterprise or production readiness, a complete privacy proof, Team Policy integration, or screenshot protection capability.
