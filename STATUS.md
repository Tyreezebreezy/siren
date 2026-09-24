# SIREN Build Status

## Current state

SIREN 1.1.0 is validated for final private release. It preserves the local-only
Kokoro, document, and persistence boundaries from v1.0.0 while adding a focused
Reader, Library/Continue surface, click-to-read navigation, manual-scroll yielding,
Return to current, and persisted appearance controls.

The installer was built from runtime commit
`a3a3fe068a19faf6ee460416cb168a7ecab555b3` and passed an isolated install,
native playback, cancellation, restart/resume, and silent uninstall smoke test.

## Performance measurements

The audited v1.0.0 baseline measured 15,389 ms to first audible playback, 45 ms
average and 66 ms worst transitions across 10 chunks, with no underruns. Baseline
synthesis used 161.9% of one logical core equivalent, averaged 739.1 MiB working
set and 828.7 MiB private memory, and restored sentence 50 of 50 after relaunch.

The exact installed v1.1.0 release played the same 50-sentence fixture through
10 chunks with these observed results:

- First audible playback: 12,749 ms, 17.2% lower than the v1.0.0 baseline.
- Average transition: 30 ms.
- Worst transition: 45 ms.
- Observable underruns: 0.
- End state: sentence 50 of 50 with `End of document.`
- Stop UI transition: 1 ms.
- Playback after Stop: none during a 25-second observation window.
- Relaunch resume: the same 50-sentence document at sentence 11 of 50.

A smaller adaptive first-chunk experiment reached 5.96-9.64 second first-audible
times but caused audible underruns and was fully reverted. The final release keeps
the proven paragraph-bounded queue and moves its single warmup to native startup.

## Responsive and interaction QA

Native WebView2 checks at 1366x768, 1440x900, and 1920x1080 found no page-level
overflow. Click-to-read, click-to-resume during playback, appearance settings,
manual-scroll yielding, Return to current, Library navigation, and recent-reading
rendering passed with no captured console errors. Screenshots are preserved in
the session output directory for all three sizes.

The in-app Browser/Computer Use image runtime was unavailable because its Windows
sandbox helper failed. WebView2 CDP supplied the rendered DOM, interaction, audio,
and screenshot evidence instead.

## Tests

- `scripts\validate.ps1`: PASS (`SIREN_VALIDATION=PASS`).
- Prettier, TypeScript, 8 Node tests, and Vite production build: PASS.
- `cargo test --locked`: PASS (4 passed; 1 local-model benchmark ignored).
- `cargo clippy --locked --release --all-targets -- -D warnings`: PASS.
- `npm.cmd run tauri build`: PASS; NSIS installer produced.
- Isolated silent install and uninstall: PASS.

## Security gates

- `npm audit --audit-level=high`: PASS, zero vulnerabilities.
- Trivy 0.72.0 with refreshed database: PASS, zero High/Critical npm or Cargo
  findings and zero reported source secrets.
- Gitleaks 8.30.1: PASS, 18 committed revisions and the exact staged v1.1.0
  patch scanned with zero leaks.
- Repository remains private; no GitHub publication is authorized.

## Known limitations

- The Windows installer is not code-signed.
- First speech still takes several seconds on CPU; the measured improvement is
  meaningful but does not meet the research pack's aspirational near-instant goal.
- Highlighting is speech-chunk accurate because Kokoro has no sentence timestamps.
- OCR, DOCX, EPUB, cloud sync, voice cloning, and audio export remain outside 1.1.0.

## Final version

`1.1.0`

## Installer

- File: `SIREN_1.1.0_x64-setup.exe`
- Size: `76,400,879` bytes
- SHA-256: `53524D946EBCE4158986E9273F99CE8E71CEA81A3836312EDB450A9AF6E7BDE1`
- Signature: not signed

## Release state

All local release gates pass. The final annotated `v1.1.0` tag and private Gitea
release have not yet been created; publication and authenticated/unauthenticated
readback are the remaining actions.
