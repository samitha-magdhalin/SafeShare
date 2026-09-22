# SafeShare V1 privacy notes

Image processing occurs inside the browser. Selecting a file creates a temporary object URL. Scanning decodes it locally, sends pixels to the local Tesseract worker, and runs QR/metadata inspection in JavaScript. No SafeShare backend exists. Export creates a new PNG through Canvas, so original EXIF metadata is not copied into the exported file.

The app does not intentionally send the original image, OCR text, findings, or protected output to a service. It keeps them in page memory during the workflow and revokes object URLs on reset. The worker's persistent language cache is disabled. Browser or operating-system memory reclamation is outside the app's control. Static JavaScript, WASM, and language model files are served by the app's origin and may be cached normally.

No analytics or remote fonts are included. No cloud OCR or cloud AI is used.

Verification re-runs the complete OCR and detection pipeline on the protected PNG. It checks selected original findings and also blocks a ready result if the new scan contains any critical or sensitive findings. OCR errors and uncovered text can still lead to false success. Users should review the output visually before sharing. QR content is not shown and QR protection is checked by detecting whether a QR code remains. The app makes no compliance or absolute safety claim.

## Network privacy check

Browser network inspection of the complete workflow was attempted but the available browser session could not start in this environment. Source review found no `fetch`/XHR/WebSocket transmission of image or finding content. The local dev server returned HTTP 200 for the same-origin OCR worker and language model paths. This is not a substitute for a recorded browser network check; perform the check in browser DevTools before deployment.
