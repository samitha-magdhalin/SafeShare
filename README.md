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

## Batch security test

1. Open **Batch Screenshots** and select **Bug Report / QA**.
2. Add at least three synthetic screenshots: A with a fake API key and email, B with only an internal URL, and C with clean public content.
3. Select **Scan All**. Confirm A reports a credential as BLOCK and email as PROTECT, B reports the internal URL as WARN, and C has no blocking finding.
4. Select **Protect Required**. Confirm each processed image receives its own fresh verification result and only successful items become Ready.
5. Switch the profile to **Public Documentation**. Confirm B's internal URL changes from WARN to PROTECT, every prior Ready output is invalidated, and **Download Ready Images** no longer authorizes those stale outputs.
6. Select **Protect Required** again. Confirm B is protected and freshly verified before it becomes Ready under the new profile.
7. Select **Download Ready Images**. Confirm it downloads only currently verified protected PNGs. It must exclude originals, failed items, unscanned items, and items with unresolved BLOCK or PROTECT findings.
8. In DevTools Network, confirm the workflow makes no request containing screenshot bytes, OCR text, findings, or protected output.


## Before/After approval test

### Single Screenshot

1. Use a synthetic screenshot containing `API_KEY=sk_test_safeshare_8H2K9M4P7Q` and `CUSTOMER_EMAIL=ananya.demo@example.com`.
2. Scan, then select **Protect & verify**.
3. Confirm the review shows the original image with the fake values and the exact protected image without them.
4. Confirm verification passed and Copy/Export remain unavailable while the result is **Awaiting review**.
5. Select **Approve for Sharing**. Confirm Copy/Export become available and both use the reviewed protected image.
6. Change the profile, finding selection, or source image. Confirm the previous approval and release eligibility disappear immediately.

### Batch Screenshots

1. Add A with a fake API key and email, B with an internal URL, and C with clean public content. Select **Bug Report / QA**.
2. Scan and select **Protect Required**. Confirm verified protected items enter **Awaiting review** and C remains **No sensitive findings** without a fake comparison.
3. Select **Review Verified Images**, inspect each Original/Protected pair, and use **Approve & Next**. Confirm approval affects only the reviewed item.
4. Confirm **Download Ready Images** includes only currently verified and approved protected outputs.
5. Switch to **Public Documentation**. Confirm previous approvals and download eligibility are invalidated and B's internal URL becomes PROTECT.
6. Re-protect, freshly verify, review, and approve. Confirm only the current approved verified outputs can be downloaded.
