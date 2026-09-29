# SafeShare Windows Pilot Installation

SafeShare Agent 0.1.0 is a private Windows pilot build. It is not a production or enterprise deployment release.

## Requirements

- A supported 64-bit Windows 10 or Windows 11 machine
- Microsoft Edge WebView2 Runtime
- Internet access during installation if WebView2 is not already installed
- An existing confirmed SafeShare account with workspace membership

The current NSIS installer checks for WebView2 and uses Microsoft's download bootstrapper when the runtime is missing.

## Install

1. Obtain the pilot NSIS setup executable from the SafeShare pilot administrator.
2. Verify the filename and checksum supplied through the pilot's trusted distribution channel.
3. Run the installer.
4. Install for the current Windows user. Administrator access should not normally be required.
5. This pilot is currently unsigned. Windows may show an unknown publisher or reputation warning. Confirm the artifact with the pilot administrator. Do not disable SmartScreen or antivirus.

## Launch and sign in

1. Launch **SafeShare Agent** from the Start Menu.
2. Find the SafeShare Agent icon in the Windows notification area.
3. Open **SafeShare Agent** from the tray.
4. Sign in with an existing SafeShare account.
5. Confirm the displayed workspace, role, and Team Policy version.

Launching the Agent a second time should focus the existing Agent instead of starting another clipboard listener or tray process.

## Protect a screenshot

1. Capture a screenshot with Win+Shift+S.
2. Open **Review latest screenshot** from the tray when SafeShare reports sensitive information.
3. Review the original image and policy actions.
4. Select **Protect & Verify**.
5. Approve only after fresh verification succeeds.
6. Select **Approve & Copy** and paste the protected image into the intended local application.

Screenshot pixels, clipboard images, OCR, findings, protection, and verification remain on the Windows device. SafeShare Console receives authentication, workspace, Team Policy, and the minimal approved activity events documented by the pilot. Automated detection is not perfect and the protected image still requires human review.

## Tray and shutdown

Closing the Agent window hides it while the tray process continues. Use **Open SafeShare Agent** or **Review latest screenshot** to reopen it. Use **Quit** in the tray menu to terminate clipboard monitoring.

Start with Windows is not implemented in this pilot and is off by default.

## Offline behavior

During an authenticated running session, a validated Team Policy cache for the same workspace may support local protection during a temporary network outage. Activity updates may fail and are not queued. Authentication is memory-only, so restarting the Agent requires sign-in.

## Uninstall

1. Quit SafeShare Agent from the tray.
2. Open Windows **Installed apps**.
3. Find **SafeShare Agent** and select **Uninstall**.
4. Confirm the executable and Start Menu entry are removed.
5. The safe Team Policy cache or WebView profile data may remain in the current user's application-data directory. It contains no screenshots, OCR, findings, protected images, or auth tokens.
6. Confirm no SafeShare process or tray icon remains.

## Pilot limitations

- The executable and installer are unsigned.
- Windows may display publisher or reputation warnings.
- Automatic updates and Start with Windows are not implemented.
- Installer behavior, single-instance behavior, notifications, uninstall cleanup, and supported Windows coverage require pilot-machine validation.
- This pilot does not claim perfect detection, universal compatibility, production readiness, or enterprise readiness.
