# SIREN architecture

## Runtime boundary

SIREN is a Tauri 2 desktop application. The React webview owns reader state and
audio playback; Rust owns document extraction and local inference. The webview
has no filesystem or shell plugin permissions. Native file inputs provide only
user-selected bytes, and the production CSP permits app resources, Tauri IPC,
and local blob audio without remote content.

## TTS

The frontend invokes one narrow command with a bounded text chunk, voice, and
speed. Rust validates length, speed, and the voice identifier before routing the
request through `TtsEngine`, currently the single native Kokoro ONNX variant.

The loaded engine is reused behind an asynchronous mutex and warmed after app
startup. CPU is the stable default execution provider unless development
explicitly selects another provider. Synthesized 24 kHz
mono samples are encoded as PCM WAV and returned using Tauri's raw binary IPC
response, then played by the webview's native `Audio` element. A monotonically
increasing session id prevents stale synthesis results from playing after Stop,
navigation, settings changes, edits, or document changes.

Development reads Git-ignored assets from `models/` or `SIREN_MODEL_DIR`.
Production resolves the same fixed filenames from Tauri's bundled resource
directory. The webview cannot supply a model path.

## Reader and queue

TXT, readable Markdown, and text-based PDF bytes normalize into paragraphs and
sentences. `Intl.Segmenter` provides native sentence boundaries; a small merge
step handles common abbreviations such as `Dr.`. The current sentence index
remains the source of truth for navigation, progress, and resume. Adjacent short
sentences may be combined into speech chunks of up to 300 characters without crossing
paragraph boundaries. A producer synthesizes ahead while a consumer plays one
chunk at a time; the ready queue is capped at three chunks, and completed audio
is released immediately.

The audio element implements sample-level Pause/Resume. Stop releases the blob
URL and keeps the stable sentence position. Previous/Next move one sentence and
invalidate the old session. Voice and speed changes use the same invalidation
path. Kokoro does not expose sentence timestamps, so all sentences in the active
chunk are highlighted together rather than using fake intra-chunk timing.

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
