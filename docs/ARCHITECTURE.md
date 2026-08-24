# SIREN architecture

## Runtime boundary

SIREN is a Tauri 2 desktop application. The React webview owns reader state and
audio playback; Rust owns document extraction and local inference. The webview
has no filesystem or shell plugin permissions. Native file inputs provide only
user-selected bytes, and the production CSP permits app resources, Tauri IPC,
and local blob audio without remote content.

## TTS

The frontend invokes one narrow command with one sentence, voice, and speed.
Rust validates length, speed, and the voice identifier before routing the request
through `TtsEngine`, currently the single native Kokoro ONNX variant. This small
engine boundary allows another implementation later without a plugin framework.

The loaded engine is reused behind an asynchronous mutex. Synthesized 24 kHz
mono samples are encoded as PCM WAV and returned using Tauri's raw binary IPC
response, then played by the webview's native `Audio` element. A monotonically
increasing request id prevents stale synthesis results from playing after Stop,
navigation, edits, or document changes. Play is disabled during synthesis to
avoid duplicate work.

Development reads Git-ignored assets from `models/` or `SIREN_MODEL_DIR`.
Production resolves the same fixed filenames from Tauri's bundled resource
directory. The webview cannot supply a model path.

## Reader and queue

TXT, readable Markdown, and text-based PDF bytes normalize into paragraphs and
sentences. `Intl.Segmenter` provides native sentence boundaries; a small merge
step handles common abbreviations such as `Dr.`. The current sentence index is
the source of truth for synthesis, highlighting, navigation, progress, and
resume. Only the current sentence is synthesized, so a long document does not
require whole-document audio generation.

The audio element implements sample-level Pause/Resume. Stop releases the blob
URL and keeps the current sentence. Previous/Next cancel the active request and
move one bounded queue position. Highlighted elements scroll into view only when
auto-scroll is enabled.

## Documents

The webview decodes TXT and Markdown as Unicode. Markdown syntax is reduced with
small deterministic rules rather than a parser dependency. PDF bytes cross raw
IPC and are checked for size and signature before `pdf-extract` reads the text
layer. Empty, corrupt, encrypted, and image-only PDFs return user-facing errors;
OCR is intentionally absent.

## Persistence

A versioned local-storage record contains validated settings, up to eight recent
normalized documents, the active document id, current sentence indexes, and last
opened timestamps. Invalid or unavailable stored data falls back to safe defaults.
The recent-body approach is intentionally simple and supports resume after a
source file moves. The documented ceiling is webview quota; SQLite is deferred
until measured library size requires it.
