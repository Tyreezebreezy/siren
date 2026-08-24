# SIREN architecture

## TTS

The frontend calls a narrow Tauri command with one sentence, voice, and speed.
Rust validates those inputs and routes them through `TtsEngine`, currently the
single Kokoro ONNX variant. The loaded engine is reused behind an asynchronous
mutex. Synthesized 24 kHz mono samples are encoded as PCM WAV and returned over
Tauri's raw binary IPC response for playback by the webview's native audio API.

Model and voice paths are fixed by the application, not supplied by the webview.
Development may override the model directory with `SIREN_MODEL_DIR`; packaged
builds will use bundled resources.

## Reader

Version 0.1 uses a sentence-oriented queue. The current sentence is the single
source of truth for synthesis, highlighting, navigation, progress, and resume.
Upcoming sentences are synthesized incrementally rather than generating a whole
document before playback.

## Documents and persistence

TXT, readable Markdown, and text-based PDF inputs normalize into paragraphs and
sentences. Settings, recent documents, and the current sentence index persist
locally. Missing files and PDFs without a text layer produce recoverable errors.
