# SIREN Build Status

## Current state

The SIREN repository has been initialized from The Forge's approved Tauri 2,
React, TypeScript, and Rust starter. Product metadata and visible identity are
renamed. Local Kokoro synthesis is the next engineering gate.

## Completed

- Environment preflight.
- Forge baseline inspection.
- SIREN project baseline and local-only security defaults.
- Initial dark-first reader design concept.

## In progress

- Native Rust plus ONNX Kokoro synthesis proof.

## Blockers

None.

## Decisions made

- Use native Rust/ONNX first; fall back only if the path becomes an architectural dead end.
- Keep model files outside Git and verify their licenses and hashes.
- Use sentence-oriented playback and sentence-level resume.

## Tests

Not yet run for this baseline.

## Known issues

- TTS is not integrated yet.
- Forge placeholder icons remain pending replacement.

## Next actions

1. Prove audible Kokoro synthesis.
2. Add the minimal TTS engine boundary.
3. Implement the reader and persistence workflows.

## Latest stable commit

Pending initial baseline commit.
