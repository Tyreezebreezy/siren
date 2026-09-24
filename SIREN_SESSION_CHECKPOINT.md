# SIREN v1.2.0 session checkpoint

## v1.2.0 current phase

- Authoritative starting branch: clean `main` at
  `a1bc910b565f974b34205eac50ead8c3ed828eac`, synchronized with `origin/main`.
- Published baseline: annotated `v1.1.0` peeling to
  `416b2e430613642da244ac382a65d0ebf8315a30` in the private Gitea repository.
- Versions before changes: application/package `1.1.0`; `kokoro-en` 0.1.5;
  ONNX Runtime `ort`/`ort-sys` 2.0.0-rc.13; `pdf-extract` 0.12.0.
- Bundled model before changes: `model_quantized.onnx`, 92,361,116 bytes,
  SHA-256 `FBAE9257E1E05FFC727E951EF9B9C98418E6D79F1C9B6B13BD59F5C9028A1478`.

## Fresh installed v1.1.0 baseline

The exact published installer hash was verified, installed to an isolated
temporary directory, exercised, and uninstalled successfully.

- Process launch to WebView target: 1,571 ms.
- Native model/session load: 2,447.5 ms in the existing local-model benchmark.
- First 66-character synthesis: 6,540.3 ms for 4,500 ms audio, RTF 1.453;
  total including model load 8,987.9 ms.
- Warm 147-character synthesis: 9,010.0 ms for 9,975 ms audio, RTF 0.903.
- Warm 288-character synthesis: 21,673.8 ms for 18,375 ms audio, RTF 1.180.
- Installed first audible: 12,912 ms.
- Installed 10-chunk continuity: 36 ms average transition, 62 ms worst,
  zero observed underruns.
- Stop response: 2 ms; no stale playback in the following 25 seconds.
- CPU: 159.7% average and 311.3% peak of one logical-core equivalent.
- Working set: 772.7 MiB average, 918.6 MiB peak.
- Private memory: 944.4 MiB average, 1,359.0 MiB peak.

## v1.2.0 implementation state

- Cold-path instrumentation measured roughly 35 ms of model I/O, 2.40 s of
  engine/session setup, 2.56 s of phonemization, and 3.97 s of first inference.
- Removing the v1.1 warmup regressed installed first-audible time to 15.9 s and
  produced 1.2 s average / 2.8 s worst transitions, so it was reverted.
- The official q8f16 candidate crashed the locked ONNX Runtime and was rejected.
  v1.2 retains the stable quantized model and v1.1 playback queue.
- Added local scanned/mixed-PDF OCR using the existing per-page PDF extraction,
  PDFium 156.0.8066.0, Tesseract 5.4.0, and English `tessdata_fast` at pinned
  revision `87416418657359cb625c412a48b6e1d6d41c29bd`.
- OCR renders only text-poor pages, preserves native text, reports page progress,
  supports cancellation between pages, removes temporary images, and never writes
  the source PDF.
- Added hash-and-engine-keyed OCR caching, cache cleanup, retry/failure states,
  local/privacy messaging, and accessible dialog semantics.
- Added scanned and mixed PDF fixtures plus Rust, persistence, and interaction
  regression coverage.
- Browser fallback QA passed 18 states across 1366x768, 1440x900, and 1920x1080
  with no overflow, unnamed controls, or observed interaction failures.
- Current source gates: 9 Node tests PASS; 6 Rust tests PASS with 3 ignored;
  ignored real-OCR scanned/mixed integration PASS; TypeScript/Vite build PASS.
- Release clippy PASS with warnings denied; npm audit and refreshed Trivy report
  zero vulnerabilities; Gitleaks reports zero leaks across the 43-file candidate,
  the installed-path fix, and all 22 committed revisions. RustSec reports no
  vulnerabilities and only inherited maintenance/unsoundness warnings.
- The first isolated v1.2 installer passed TTS (12,523 ms first audible, 30 ms
  average / 51 ms worst transition, zero observed underruns) but exposed an
  installed-only OCR failure: Tauri returned `\\?\` resource paths that Tesseract
  rejected for `--tessdata-dir`. SIREN now removes only that Windows prefix, with
  disk and UNC regression tests.
- The fixed production installed payload passed mixed-PDF OCR, progress, cache
  reuse, eight-page cancellation, unchanged source hash, three-viewport responsive
  and accessible-control checks, plus paused sentence/page resume after restart.

## v1.2.0 exact next action

Commit the installed-path fix, rebuild and reinstall the exact final installer,
then rerun bounded resource, OCR, responsive, resume, uninstall, and private-release
readback gates. Publish only if all pass.

## Retained v1.1.0 release record

## v1.1.0 repository state

- Branch: `main`
- Authoritative baseline: `868d8825804740505c70ba0481a75e4c2c7d0809`
- Published baseline tag: annotated `v1.0.0` at `2f4f10845ae946f4ced5125937711aa9e7d2d0d6`
- Remote: private `origin` at `[private-git-server]`
- Starting working tree: clean; `main` matched `origin/main`
- Target: `v1.1.0`, or `v1.1.0-rc.1` only for a documented release blocker

## Completed phase

Bounded v1.0.0 baseline audit completed before source changes.

## Baseline gates

- `scripts\validate.ps1`: PASS (`SIREN_VALIDATION=PASS`)
- Prettier, TypeScript, 8 Node tests, Vite production build: PASS
- `cargo test --locked`: PASS (4 passed, 1 local-model benchmark ignored by default)
- `cargo clippy --locked --release --all-targets -- -D warnings`: PASS
- `npm audit --audit-level=high`: PASS (0 vulnerabilities)
- `npm.cmd run tauri build`: PASS; exact v1.0.0 NSIS build completed

## Measured v1.0.0 performance

Local Kokoro benchmark on this workstation:

- Engine load: 3,179 ms in the standalone debug benchmark; 2,362 ms on native relaunch.
- Cold 66-character synthesis: 7,625 ms for 4,500 ms audio, RTF 1.694.
- Warm 147-character synthesis: 10,741 ms for 9,975 ms audio, RTF 1.077.
- Warm 288-character synthesis: 18,032 ms for 18,375 ms audio, RTF 0.981.

Native 50-sentence, 10-chunk run:

- First audible playback: 15,389 ms for the 212-character first chunk.
- Average synthesis: 13,906 ms.
- Average transition: 45 ms.
- Worst transition: 66 ms.
- Buffer underruns: 0.
- Ready-queue capacity: 3; observed queue remained bounded.
- Stop UI transition during active generation: 12 ms.
- Stale audio after Stop: none during a 25-second observation window.
- Synthesis CPU sample: 161.9% of one logical core equivalent.
- Average working set: 739.1 MiB; average private memory: 828.7 MiB.
- Relaunch restored the same long document at sentence 50 of 50, paused and ready.

## Responsive baseline

Rendered screenshots were captured at 1366x768, 1440x900, and 1920x1080.
DOM measurements at all three sizes showed viewport width equal to document
scroll width and viewport height equal to document scroll height. The header,
editor, reader, and playback controls stayed within the viewport. The in-app
Browser/Computer Use runtime was unavailable because its sandbox helper failed;
Edge/WebView2 CDP supplied the rendered structural and interaction evidence.

## Modernization classification

Already implemented and preserved:

- local/offline Kokoro with four bundled voices and narrow Tauri permissions;
- one long-lived native engine, CPU provider default, and background warmup;
- bounded three-unit queue with generation invalidation and stale-result rejection;
- TXT, normalized Markdown, and text-layer PDF import with honest no-OCR behavior;
- sentence navigation, chunk highlighting, progress, pause/resume/stop;
- local recent-document bodies, settings, and exact sentence resume;
- Dark/Light/System themes, visible focus, keyboard playback controls;
- responsive laptop breakpoints, coherent icon, NSIS packaging, and private release flow.

Partially implemented:

- startup warmup exists, but first audible speech is still 15.4 seconds;
- the reader is responsive, but Library, Reader, appearance, and playback concerns
  share one dense shell;
- auto-scroll follows playback but does not yield to manual scrolling;
- highlighting is accurate at chunk level but text is not click-to-read;
- status, progress, errors, and recent-document metadata are functional but basic;
- persistence is robust for the current local-body model but appearance preferences
  do not yet exist.

Useful v1.1.0 work:

1. Start native warmup earlier and reduce the first chunk while preserving the
   measured stable queue.
2. Add a minimal Library/Continue surface and a focused Reader.
3. Add click-to-read, manual-scroll yielding, and Return to current.
4. Add small persisted reader appearance presets and strengthen keyboard/focus UX.
5. Clarify loading/error/empty/playback states and extend regression tests.
6. Re-run native, responsive, security, package, installer, and private-release gates.

Deferred unless all core gates are healthy:

- OCR and a disk audio cache: both add packaging/runtime risk without improving the
  measured primary problem.
- Missing-file relink: current SIREN intentionally stores normalized local bodies,
  so moved source files do not break resume.

## Implemented v1.1.0 slice

- Native startup now owns exactly one Kokoro warmup; the public frontend warmup
  command and StrictMode duplicate-work path were removed.
- Added distinct Library and focused Reader surfaces using the existing state and
  persistence model.
- Added accessible click-to-read sentences, manual-scroll yielding, Return to
  current, and a paragraph-derived contents rail.
- Added persisted text-size, line-spacing, reader-width, highlighting, and theme
  controls plus Ctrl+O and Ctrl+, shortcuts.
- Extended the existing storage validation and regression tests without adding a
  dependency or changing the local-first trust boundary.
- Kept the proven 300-character paragraph-bounded queue after a smaller adaptive
  first-chunk experiment improved startup but caused audible underruns and gaps.

## Current v1.1.0 measurements

With native warmup and the stable baseline queue, first audible playback measured
13,554 ms, an 11.9% reduction from the 15,389 ms baseline. Average synthesis was
14,634 ms. A debug run recorded a 571 ms average transition, 4,719 ms worst
transition, and one underrun during two RTF-above-1 synthesis spikes. The queue
implementation is unchanged from the zero-underrun baseline; the exact release
build must pass an installed-app continuity smoke test before final promotion.

The rejected adaptive first-chunk trial produced 5.96-9.64 second first-audible
times but also one to three underruns and worst gaps of 449-2,317 ms. It was
fully reverted rather than trading a benchmark win for worse listening.

## v1.1.0 responsive and interaction QA

Native WebView2 CDP checks at 1366x768, 1440x900, and 1920x1080 found no page
overflow. Click-to-read, click-to-resume during playback, appearance settings,
manual-scroll yielding, Return to current, Library navigation, and recent-reading
rendering passed with no captured console errors. The Browser/Computer Use image
runtime remained unavailable due its Windows sandbox ACL helper, so CDP supplied
the rendered DOM, interaction, and screenshot evidence.

OCR remains deferred to protect release quality; it is not needed for the healthy
core v1.1.0 reading path.

## Final installed-release gates

- Exact runtime commit: `a3a3fe068a19faf6ee460416cb168a7ecab555b3`.
- Validation, Rust tests, release clippy, npm audit, Trivy, and Gitleaks: PASS.
- NSIS build and isolated silent install/uninstall: PASS.
- Installed first audible: 12,749 ms; 17.2% lower than the v1.0.0 baseline.
- Installed 10-chunk continuity: 30 ms average, 45 ms worst, zero observable underruns.
- Stop: 1 ms; no playback during the next 25 seconds.
- Relaunch: same 50-sentence document restored at sentence 11 of 50.
- Installer: `SIREN_1.1.0_x64-setup.exe`, 76,400,879 bytes.
- SHA-256: `53524D946EBCE4158986E9273F99CE8E71CEA81A3836312EDB450A9AF6E7BDE1`.

## v1.1.0 completion boundary

No release action remains. Resume only for a new explicitly authorized scope.

## Release state

Final `v1.1.0` is published to the existing private Gitea repository. The
annotated tag resolves to `416b2e430613642da244ac382a65d0ebf8315a30`.
Both release assets passed authenticated download and SHA-256 readback;
unauthenticated repository, release, and asset requests returned 404. Existing
v1.0.0 history and release assets remain untouched.
