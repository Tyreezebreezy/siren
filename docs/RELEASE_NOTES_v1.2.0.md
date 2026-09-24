# SIREN v1.2.0

SIREN v1.2.0 adds fully local scanned-PDF OCR while preserving the known-good
v1.1 playback pipeline.

## Highlights

- Detects text-poor pages in scanned and mixed PDFs, preserving existing text.
- Runs bundled PDFium and Tesseract English `tessdata_fast` completely offline.
- Shows OCR confirmation, page progress, cancellation, failure, and retry states.
- Caches successful PDF text by file hash and OCR runtime identity.
- Improves primary-control contrast and responsive OCR presentation.
- Adds regression, OCR, persistence, accessibility, and three-viewport UI checks.

## Fast Start result

Cold-path instrumentation found the first inference and phonemization dominate
startup rather than model I/O. An official q8f16 candidate was rejected because
it crashed the locked ONNX Runtime, and removing the v1.1 warmup was rejected
after first-audible time and transition gaps regressed materially. v1.2 therefore
keeps the stable v1.1 model and warmup behavior instead of trading continuity or
speech quality for an unverified startup shortcut.

## Limits

- OCR is English-only and may misread handwriting or complex page layouts.
- OCR cancellation takes effect between pages; the current local page can finish.
- First speech after launch can still take several seconds on CPU.
