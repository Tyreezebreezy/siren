# SIREN

SIREN is a local-first Windows text-to-speech reader built with Tauri 2, React,
TypeScript, and Rust. Version 0.1.0 is under active development.

## Development

```powershell
npm.cmd ci
npm.cmd run check
cargo fmt --manifest-path src-tauri\Cargo.toml -- --check
cargo check --locked --manifest-path src-tauri\Cargo.toml
```

Run the desktop app with `npm.cmd run tauri dev`.

Kokoro model setup and complete product documentation will be added after the
native synthesis gate succeeds. Model files are intentionally excluded from Git.

## Privacy

SIREN is designed to read documents and synthesize speech locally. It does not
require a cloud TTS API.
