# SIREN

SIREN 0.1.0 is a local-first Windows text-to-speech reader built with Tauri 2,
React, TypeScript, and Rust. It reads typed or pasted text plus TXT, Markdown,
and text-based PDF documents with local Kokoro speech synthesis. No cloud TTS
API, account, or network connection is required during normal use.

## Features

- Sentence-oriented Play, Pause/Resume, Stop, Previous, and Next controls.
- Current-sentence highlighting, progress, and optional auto-scroll.
- Four bundled Kokoro voices: Bella, Heart, Adam, and Emma.
- Reading speed from 0.5× to 2.0×.
- Dark, Light, and System themes.
- Local settings, recent readings, document text, and sentence position resume.
- Keyboard controls outside text fields: Space to play/pause, Escape to stop,
  and Left/Right to move between sentences.

## Supported documents

- `.txt`: Unicode plain text.
- `.md`: headings, links, emphasis, lists, and common inline syntax are reduced
  to readable text.
- `.pdf`: PDFs with an extractable text layer, up to 50 MB.

Scanned/image-only PDFs are not supported and show an explicit no-OCR message.
DOCX, EPUB, OCR, voice cloning, cloud sync, and audio export are outside 0.1.0.

## Development

Requirements are Node.js/npm, Rust/Cargo, the Windows MSVC build tools, and the
normal Tauri 2 Windows prerequisites.

```powershell
npm.cmd ci
npm.cmd run check
cargo fmt --manifest-path src-tauri\Cargo.toml -- --check
cargo test --locked --manifest-path src-tauri\Cargo.toml
cargo clippy --locked --manifest-path src-tauri\Cargo.toml --all-targets -- -D warnings
```

Run the desktop app with `npm.cmd run tauri dev`. Run the complete Forge-derived
gate with `powershell -ExecutionPolicy Bypass -File scripts\validate.ps1`.

## Local Kokoro assets

Model files are intentionally excluded from Git. For development, place these
official `onnx-community/Kokoro-82M-v1.0-ONNX` files at:

- `models/model_quantized.onnx`
- `models/voices/af_bella.bin`
- `models/voices/af_heart.bin`
- `models/voices/am_adam.bin`
- `models/voices/bf_emma.bin`

`SIREN_MODEL_DIR` may override that directory for development. Production
installers bundle the model and voices as Tauri resources, so users do not
manually provision assets.

## Packaging

```powershell
npm.cmd run tauri build
```

The Windows NSIS installer is written under
`src-tauri\target\release\bundle\nsis`. The model adds roughly 94 MB before
installer compression. Release artifacts are build output and are not committed.

## Persistence and privacy

SIREN stores settings and up to eight recent reading bodies in the app webview's
versioned local storage. Keeping the normalized text locally lets a reading
resume even if its source file is later moved. The 0.1.0 storage ceiling is the
webview's local quota; SQLite is the upgrade path if book-scale libraries exceed
it. Documents and synthesized audio are not sent to a remote service.

## Known limitations

- First speech after launch loads the model and can take several seconds on CPU.
- PDF extraction follows the embedded text order and does not perform OCR.
- Pause resumes the current audio sample; Stop preserves the sentence position.
- Sentence segmentation uses the native `Intl.Segmenter` plus common English
  abbreviation handling rather than a heavyweight NLP runtime.

See `docs/ARCHITECTURE.md`, `THIRD_PARTY_NOTICES.md`, and `STATUS.md` for design,
licensing, and verified build status.
