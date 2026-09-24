# SIREN Build Status

## Current state

SIREN 1.2.0 is in final release validation. It preserves the v1.1.0 local
Kokoro playback pipeline and adds explicit, fully local OCR for scanned and
mixed PDFs. Existing text layers are preserved, source PDFs are never changed,
and OCR work is cached by file hash plus pinned runtime identity.

## Fast Start decision

Cold-path instrumentation measured roughly 35 ms of model I/O, 2.40 seconds of
engine/session setup, 2.56 seconds of phonemization, and 3.97 seconds of first
inference. Two measured shortcuts were rejected:

- Removing the v1.1 warmup regressed installed first-audible time to 15.9
  seconds and produced 1.2-second average / 2.8-second worst transitions.
- The official q8f16 model candidate crashed the locked ONNX Runtime.

The stable quantized model, native warmup, and bounded v1.1 queue therefore
remain unchanged. Final installed continuity must pass before release.

## OCR implementation

- PDFium 156.0.8066.0 renders only text-poor pages at a bounded 2400-pixel width.
- Tesseract 5.4.0 uses pinned English `tessdata_fast` locally and sequentially.
- A 50 MB / 500-page boundary, fixed executable paths, progress, cancellation,
  temporary-file cleanup, stale-result rejection, retry, and failure states are
  implemented.
- The source PDF is read-only; only normalized extracted/OCR text is persisted.
- Exact runtime provenance and SHA-256 values are recorded in
  `THIRD_PARTY_NOTICES.md` and `docs/OCR_RUNTIME_SHA256.txt`.

## Completed source gates

- `scripts\validate.ps1`: PASS (`SIREN_VALIDATION=PASS`).
- Prettier, TypeScript, 9 Node tests, and Vite production build: PASS.
- `cargo test --locked`: PASS (6 passed; 3 asset benchmarks/integrations ignored).
- Real scanned/mixed-PDF OCR integration: PASS.
- `cargo clippy --locked --release --all-targets -- -D warnings`: PASS.
- Browser interaction/responsive QA: PASS across 18 states at 1366x768,
  1440x900, and 1920x1080, with no page overflow or unnamed controls.

## Security gates

- `npm audit --audit-level=high`: PASS, zero vulnerabilities.
- Trivy 0.72.0 with refreshed database: PASS, zero High/Critical npm or Cargo
  vulnerabilities and zero reported source secrets.
- RustSec: zero vulnerabilities; inherited maintenance/unsoundness warnings only.
- Gitleaks 8.30.1: PASS; exact candidate/path-fix patches and all 22 committed
  revisions scanned with zero leaks.
- Repository must remain private; no GitHub publication is authorized.

## Installed pre-final evidence

- Initial v1.2 installer launch to WebView: 1,763 ms.
- First audible: 12,523 ms; 10/10 chunks; 30 ms average and 51 ms worst
  transitions; zero observed underruns.
- Stop response: 2 ms; no stale playback during the following 25 seconds.
- Active synthesis CPU: 198.4% average / 279.8% peak of one logical-core
  equivalent; working set 908.3 MiB average / 1,005.9 MiB peak; private memory
  1,203.3 MiB average / 1,360.0 MiB peak.
- The initial install exposed a Windows verbatim-prefix incompatibility in the
  Tesseract tessdata argument. The prefix-only normalization and disk/UNC tests
  are implemented; the fixed production installed payload passed real mixed-PDF
  OCR, progress, cache reuse, eight-page cancellation, and unchanged-source hash.
- Installed responsive/accessibility checks passed at 1366x768, 1440x900, and
  1920x1080 with no overflow or unnamed controls. Restart restored page navigation,
  `sentence-1`, and a paused Play state.
- Final installer rebuild and exact reinstall/readback remain pending.

## Remaining final gates

- Exact source commit.
- NSIS build, isolated install, bundled-resource/license inspection, and uninstall.
- Installed TTS first-audible/continuity/cancellation/resume measurements.
- Installed scanned/mixed OCR, progress/cancel/cache/retry, responsive,
  accessibility, and source-PDF hash checks.
- Annotated tag, private Gitea release, asset upload/download hash readback, and
  authenticated/unauthenticated private-access checks.

## Known limitations

- The Windows installer is not code-signed.
- First speech still takes several seconds on CPU; no unstable shortcut was kept.
- Highlighting is speech-chunk accurate because Kokoro has no sentence timestamps.
- OCR is English-only and may misread handwriting or complex multi-column layouts.
- OCR cancellation takes effect between pages; an in-flight page may finish locally.

## Target version

`1.2.0`

## Release state

NOT RELEASED. Final publication is allowed only after every remaining gate passes.
