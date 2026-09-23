# SIREN v1.1.0 session checkpoint

## Current repository state

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

## Exact next action

Implement and test adaptive first-chunk sizing plus earlier native warmup, then
remeasure first-audible latency before beginning the focused Reader slice.

## Release state

v1.1.0 is not yet tagged, pushed, or published. Existing v1.0.0 history and
release assets remain untouched.
