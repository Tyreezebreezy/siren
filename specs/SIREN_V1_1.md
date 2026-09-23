# SIREN v1.1.0 modernization plan

## Problem and user

SIREN already reads supported local documents reliably, but first speech takes
about 15 seconds on the current CPU and the interface still feels like one dense
utility screen. The target user wants a private, calm Windows reader that opens a
document, starts local speech quickly, supports natural navigation, and resumes
without setup or cloud services.

## Device and task contract

- Platform: Windows desktop, minimum application width 760 px.
- Required QA: 1366x768, 1440x900, 1920x1080, and the existing minimum width.
- Primary task: open or continue a document, listen, redirect reading, close, and
  resume the same document and sentence without autoplay.
- Top usability priorities: efficiency, effectiveness, and recoverability.
- Experience goals: calm, focused, local, predictable.

## Current architecture and verified behavior

React owns document, reader, settings, queue, and audio-element state. Rust owns
validated PDF extraction and a retained Kokoro ONNX engine. Raw WAV bytes cross
one Tauri command boundary. A generation-aware three-unit frontend buffer rejects
late results. Versioned localStorage persists settings and up to eight normalized
documents. The v1.0.0 baseline and measurements are recorded in
`SIREN_SESSION_CHECKPOINT.md`.

## Release scope

- earlier native engine warmup and adaptive first-chunk sizing, adopted only with
  before/after evidence;
- minimal Library/Continue and focused Reader states;
- click-to-read that selects while paused and jumps/continues while playing;
- auto-follow that yields to manual scrolling plus Return to current;
- clearer persistent playback dock, progress, loading, stopped, ended, and errors;
- persisted text-size, line-spacing, reader-width, highlighting, auto-scroll,
  theme, voice, and speed settings;
- Ctrl+O, Space, arrows, Ctrl+, and Escape without hijacking editable controls;
- supported-import, cancellation, persistence, responsive, accessibility,
  security, package, installer, and private-release regression.

## Excluded scope

- cloud sync, accounts, telemetry, analytics, cloud TTS/OCR;
- DOCX, EPUB, audio export, voice cloning, summaries, chat, and plugins;
- OCR unless every P0/P1 gate is already healthy and packaging risk is negligible;
- disk speech cache without measured repeated-synthesis need;
- fabricated word timing or exact remaining-time estimates.

## Risks and controls

- Smaller chunks can hurt prosody: prefer sentence boundaries and compare RTF and
  audible flow before adoption.
- Navigation can race synthesis: every reading-path change invalidates the active
  generation before new work is accepted.
- Sticky playback can obscure focus/content: test real bounds and keyboard focus
  at every target viewport and 200% text scaling where practical.
- Persistence changes can discard old settings: normalize v1.0.0 records with
  safe defaults and retain stored documents and positions.
- Release history is immutable: never move `v1.0.0`; create only a new v1.1.0 tag.

## Performance plan

1. Preserve the 10-chunk v1.0.0 run as baseline.
2. Start warmup in the native setup path instead of waiting for a frontend effect.
3. Target roughly 120-160 characters for the first chunk and up to 300 later.
4. Re-run the same 50-sentence native fixture and compare first audible, synthesis
   RTF, transition average/worst, underruns, CPU, memory, and cancellation.
5. Reject a change that materially damages continuity or stale-work safety.

## UX direction

Use the supplied research pack: a small Library/Continue state, content-first
Reader, constrained readable column, compact settings, and persistent playback
dock. Reuse the existing palette, icon, components, and native controls. Add no
UI framework or typography dependency.

## Release, rollback, and publication

Commit coherent verified slices. Keep the prior tag and release intact. Build the
installer from the exact release checkpoint, install/launch/play/relaunch/uninstall
it in an isolated directory, generate SHA-256, scan source/history, then create an
annotated `v1.1.0` tag and publish only to the existing private Gitea repository.
Use `v1.1.0-rc.1` only if a real release blocker remains. Re-download assets,
verify hashes, and confirm unauthenticated access remains 404.
