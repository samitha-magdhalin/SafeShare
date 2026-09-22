# SafeShare

**Scan before you share.** SafeShare is a browser-only MVP for checking screenshots and images before sharing them.

## What it does

Select a PNG, JPEG, or WebP image (up to 20 MB), scan it locally for visible text, credentials, network addresses, QR codes, and metadata, choose findings to cover, re-scan the new image, then export a freshly encoded PNG. The original file remains untouched. Detected regions are highlighted where OCR provides coordinates. Critical text is covered with solid pixels. Verification checks both selected findings and any critical or sensitive findings found in the complete second scan.

## Privacy architecture

There is no application backend. Tesseract.js runs OCR in a browser worker. Its worker script, WASM engine, and English model are copied into `public/ocr` at install time and served from the same origin. jsQR and exifr run in the browser. The app does not intentionally upload image bytes, OCR output, detected values, or sanitized images. Working data is held in page memory; object URLs are revoked when reset or replaced. The OCR language cache is disabled. Static app assets may be cached by the browser. See [PRIVACY.md](PRIVACY.md).

## Run

```text
npm install
npm run dev
```

Open the local URL printed by Vite. For production: `npm run build`; for detector tests: `npm test`.

## Demo

Open `public/fixtures/fake-debug-screen.png` in the scanner. It contains **fake data only**: an email, Indian phone number, internal URL and IP, fake API key, and fake password. The additional `fake-vscode-dark.png` and `fake-terminal-dark.png` fixtures contain more credential formats. Scan, choose **Protect & verify**, review the output, and export. Ordinary public URLs are informational and are excluded from **Protect all**. OCR quality can vary by browser and display resolution.

## Current limits

OCR can miss text or place boxes imprecisely. Detectors can produce false positives and false negatives; not every secret format is covered. QR content is hidden and requires user review. Solid covering is not generative inpainting. Fingerprint protection and advanced identity document understanding are not implemented. Visual protection does not replace organizational security controls. SafeShare does not guarantee an image contains no sensitive information.

## Roadmap

Next: validate OCR recall and protection accuracy against a wider set of real screenshot styles and resolutions using fake credentials only.

## Manual checks

- A: Scan the included fake screenshot. Expect email, phone, internal address, and credential findings, localized where OCR permits.
- B: Scan a normal photograph. Expect no fabricated critical finding.
- C: Scan an image containing a QR code. Expect a Review finding.
- D: Scan an image with EXIF GPS/device data. Expect metadata findings and a newly encoded PNG without them.
- E: Protect selected findings. Expect the verification scan to report whether selected content is still detected.

The user reported that the earlier basic fixture completed Scan → Protect → Verify in a browser. The latest dark screenshot changes have not been visually verified in a browser here because no browser session is available. Network inspection remains to be completed before deployment. Automated tests run real local OCR on all three synthetic screenshots and re-scan a protected dark fixture.

## Dependencies

React, TypeScript, Vite, Tesseract.js (Apache 2.0), jsQR (Apache 2.0), and exifr (MIT). OCR data derives from Tesseract trained data; see package licenses.
