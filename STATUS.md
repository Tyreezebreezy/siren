# SIREN Build Status

## Current state

SIREN 0.1.0 is released privately on Gitea. The native Windows app
reads typed text, TXT, readable Markdown, and text-layer PDFs; synthesizes speech
offline with bundled Kokoro assets; highlights and navigates sentences; and
persists settings, recent readings, and position across restart. The final NSIS
installer built, installed into an isolated directory, launched, found all four
voices, restored reading state, and uninstalled cleanly.

The annotated `v0.1.0-rc.1` and `v0.1.0` tags both resolve to the tested release
checkpoint `dbc4c3df19647a68b5402c038f425debe1c0060d`.

## Completed

- Forge-derived Tauri 2/React/Rust project at `C:\Dev\siren` with clean Git history.
- Native `kokoro-en` 0.1.5 inference without Python, PyTorch, CMake, or cloud APIs.
- Bundled quantized Kokoro model and Bella, Heart, Adam, and Emma voice assets.
- Sentence parsing, queue, highlighting, auto-scroll, progress, and navigation.
- Play, sample-level Pause/Resume, Stop, Previous, Next, speed, and voice controls.
- TXT, readable Markdown, and text-layer PDF import with explicit no-OCR handling.
- Versioned local settings, eight-reading recent library, and sentence resume.
- Dark, Light, and System themes; keyboard controls; responsive desktop/mobile UI.
- Original SIREN icon, complete README, architecture notes, and third-party hashes.
- Production CSP corrected and narrowed for local blob audio.
- NSIS installer build and isolated install/start/uninstall smoke test.
- Private `Tyreezebreezy/siren` Gitea repository, complete history, RC and final
  tags, and final release with the verified installer and SHA-256 attachment.

## In progress

- None in the local v0.1.0 scope.

## Blockers

- None.

## Decisions made

- Use native Rust/ONNX with a small internal `TtsEngine` boundary.
- Keep model binaries out of Git and bundle verified assets as Tauri resources.
- Return PCM WAV through raw Tauri IPC and play it with the native webview audio API.
- Use `Intl.Segmenter` plus common-abbreviation merging instead of heavyweight NLP.
- Store up to eight normalized readings in versioned local storage; move to SQLite
  only if measured webview quota becomes a real library-size limit.
- Use native file inputs and no filesystem/shell plugin permissions.

## Tests

- `scripts\validate.ps1` — PASS (`SIREN_VALIDATION=PASS`).
- Prettier, TypeScript, five Node reader/persistence tests, and Vite build — PASS.
- `cargo test --locked` — PASS, four Rust/TTS/PDF tests.
- `cargo clippy --locked --all-targets -- -D warnings` — PASS.
- `npm audit --audit-level=high` — PASS, zero vulnerabilities.
- Gitleaks — PASS, five commits scanned after final status commit; zero leaks.
- Trivy with a refreshed database — PASS, zero High/Critical Cargo/npm findings
  and zero reported secrets in the scoped source scan.
- Browser QA — PASS at 1440×900 and 390×844, no console warnings/errors or
  horizontal overflow; current position survived reload; TXT import opened five
  sentences; Markdown parsing test passed.
- PDF fixtures — PASS: text PDF extracted; scanned/no-text PDF returned the exact
  no-OCR message; both fixture pages were rendered and visually inspected.
- Native TTS proof — PASS through the real Windows audio output.
- Production executable smoke — PASS: bundled voices discovered, local speech
  played, highlight stayed aligned, and Pause/Resume worked.
- Installer smoke — PASS: silent isolated install, installed app launch, reading
  resume, four bundled voices, and clean uninstall.
- Installer SHA-256 —
  `918C7CED9A9C9D9850A56FB179BACBDF4B2ECE3A9497A425801573787CF09CA3`.
- Private Gitea readback — PASS: repository, release, and installer were hidden
  from unauthenticated requests; both installer downloads matched the recorded
  SHA-256; repeated ZIP and tar.gz source downloads matched and contained 81
  entries with no `node_modules`, `target`, `dist`, or `.env` paths.

## Known issues

- The installer is not code-signed.
- Initial model load and long-sentence CPU synthesis can take several seconds.
- OCR, DOCX, EPUB, cloud sync, and audio export are intentionally outside v0.1.0.
- `cargo-audit` is not installed; the refreshed Trivy scan covered `Cargo.lock`.

## Next actions

1. Optionally code-sign a future installer when a trusted signing certificate is
   available.

## Latest stable commit

`dbc4c3d` — tested and published `v0.1.0` checkpoint
