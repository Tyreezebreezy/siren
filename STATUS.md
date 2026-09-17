# SIREN Build Status

## Current state

SIREN 1.0.0 is the released private Gitea checkpoint. The native Windows app
reads typed or pasted text plus TXT, Markdown, and text-layer PDFs; synthesizes
speech offline with bundled Kokoro assets; highlights and navigates sentences;
and persists settings, recent readings, and exact sentence position across
restart. Continuous buffered playback keeps the next speech unit ready while
the current one plays, so long passages flow without the sentence-by-sentence
gaps of the v0.1.0 pipeline.

The annotated `v1.0.0` tag marks the tested release source. The earlier
`v0.1.0-rc.1` and `v0.1.0` tags remain untouched and resolve to the historical
v0.1.0 checkpoint `dbc4c3df19647a68b5402c038f425debe1c0060d`.

## Performance measurements

Local Kokoro benchmark (`cargo test --ignored benchmarks_local_kokoro`,
debug build; inference runs in the precompiled ONNX runtime):

- Model load: `4444.5 ms` (debug build; release loads in roughly 2.2 s).
- First synthesis (66 characters, cold): `7463.0 ms` for `4500 ms` audio
  (RTF 1.658). This first request includes a one-time ONNX session
  initialization penalty of roughly 3.5 s.
- Warm synthesis (147 characters): `8318.5 ms` for `9975 ms` audio (RTF 0.834).
- Warm synthesis (288 characters): `16727.8 ms` for `18375 ms` audio (RTF 0.910).

The explicit-CPU provider default avoids unavailable CUDA/DirectML probing and
cut model setup from roughly 8.0 s to roughly 2.2 s. Startup warmup now runs one
tiny synthesis so the user's first Play does not pay the cold-inference penalty;
the remaining first-speech delay is the warm CPU synthesis of the first
150-350-character chunk.

## Long-form results

A real installed-app run read an 18-sentence, two-paragraph document (about 730
characters) through multiple speech chunks. Playback advanced from sentence 1
through sentence 12 to the end with the status continuously reporting
"Reading locally." and no visible stall. Stop preserved the position at sentence
12, and a full app restart restored "Sentence 12 of 18" exactly.

## Laptop QA

Browser QA at 1366x768 and 1440x900 reported no page-level horizontal overflow.
The editor renders a compact six-row resizable textarea, the reader keeps a
comfortable width, the recent-library rail expands without clipping the reader,
and controls remain inside the viewport. Visible focus rings are defined for
buttons, inputs, selects, and textareas. Navigation, theme switching, and the
recent library were exercised at both sizes.

## Tests

- `scripts\validate.ps1` — PASS (`SIREN_VALIDATION=PASS`).
- Eight Node frontend tests (reader, playback buffer, theme) — PASS.
- TypeScript, Prettier formatting, and Vite production build — PASS.
- `cargo test --locked` — PASS, four Rust/TTS/PDF tests (one benchmark ignored).
- `cargo clippy --locked --release --all-targets -- -D warnings` — PASS, clean.
- Release build compiles with no warnings, including the former unused
  debug-log argument.

## Security gates

- `npm audit --audit-level=high` — PASS, zero vulnerabilities.
- Trivy 0.72.0 with a refreshed vulnerability database — PASS, zero High/Critical
  npm and Cargo findings and zero secrets.
- Gitleaks 8.30.1 — PASS, eleven commits scanned, zero leaks.

## Known limitations

- The installer is not code-signed.
- First speech after launch takes several seconds on CPU while the first
  150-350-character chunk is synthesized.
- Adjacent sentences may share one audio chunk; highlighting covers the active
  chunk because Kokoro does not expose sentence timestamps.
- OCR, DOCX, EPUB, cloud sync, voice cloning, and audio export are intentionally
  outside 1.0.0.

## Final version

`1.0.0`

## Final commit

`2f4f10845ae946f4ced5125937711aa9e7d2d0d6` — `docs: record SIREN v1.0.0 release status`

## Installer

- File: `SIREN_1.0.0_x64-setup.exe`
- Size: `76,459,745` bytes
- SHA-256: `0E34000A8D843F1C5B3E0EED1301BDD324E34344E6A32A060BEFE06CA136C1BF`

## Gitea release

Published as a non-draft, non-prerelease `v1.0.0` release to the private
`Tyreezebreezy/siren` repository at
`[private-git-server]` with the Windows
installer and its SHA-256 checksum attached. The installer and checksum were
downloaded back and re-verified against the local hashes, and unauthenticated
requests to the repository, release, and assets all return 404.
