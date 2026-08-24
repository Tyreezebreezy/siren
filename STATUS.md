# SIREN Build Status

## Current state

The SIREN repository is initialized from The Forge and the first engineering
gate passes: the Tauri window invokes Rust, Kokoro synthesizes locally, and the
result plays through the Windows audio output. Reader implementation is next.

## Completed

- Environment preflight.
- Forge baseline inspection.
- SIREN project baseline and local-only security defaults.
- Initial dark-first reader design concept.
- Native `kokoro-en` 0.1.5 integration without Python, PyTorch, or CMake.
- Quantized Kokoro model plus Heart voice loaded from Git-ignored local assets.
- Audible `Hello. This is SIREN.` proof through the real Tauri window.
- Small internal engine boundary, request validation, PCM/WAV encoding, and tests.

## In progress

- Sentence parsing, queue, reader controls, and highlighting.

## Blockers

- Private Gitea creation/push is pending because the external-write safety
  reviewer blocked the authorized operation. No source was transmitted.

## Decisions made

- Use native Rust/ONNX first; fall back only if the path becomes an architectural dead end.
- Keep model files outside Git and verify their licenses and hashes.
- Use sentence-oriented playback and sentence-level resume.
- Use optimized raw IPC for sentence WAV data rather than JSON sample arrays.
- Use the browser-native audio element for output to avoid another Rust audio dependency.

## Tests

- `powershell -ExecutionPolicy Bypass -File scripts\validate.ps1` — PASS at baseline.
- `cargo test --locked --manifest-path src-tauri\Cargo.toml` — PASS, 2 tests.
- Windows UI proof — PASS: Rust synthesis completed and `audio.play()` resolved.
- `npm audit` during install — 0 vulnerabilities.

## Known issues

- Forge placeholder icons remain pending replacement.
- Only the Heart voice is provisioned so far.
- The lean phonemizer omits bundled eSpeak; broader pronunciation QA is pending.

## Next actions

1. Implement the reader queue, navigation, and playback state.
2. Add document imports and persistence.
3. Complete visual, accessibility, packaging, and security gates.
4. Retry private Gitea publication when external-write approval is available.

## Latest stable commit

`95e8364` — `chore: initialize SIREN from Forge`
