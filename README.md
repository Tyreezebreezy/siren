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

## Local Kokoro assets

Model files are intentionally excluded from Git. Development currently uses:

- `models/model_quantized.onnx`
- `models/voices/af_heart.bin`

Both files come from the official
`onnx-community/Kokoro-82M-v1.0-ONNX` repository. The release build will bundle
the required files so normal users do not need to place them manually.

## Privacy

SIREN is designed to read documents and synthesize speech locally. It does not
require a cloud TTS API.
