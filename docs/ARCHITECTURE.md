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

The loaded engine is reused behind an asynchronous mutex. Native startup owns a
single background warmup, so React remounts cannot duplicate it and the first
real request does not pay the one-time ONNX session initialization cost. CPU is the stable default
execution provider unless development
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
remains the source of truth for navigation, progress, click-to-read, and resume. Adjacent short
sentences may be combined into speech chunks of up to 300 characters without crossing
paragraph boundaries. A producer synthesizes ahead while a consumer plays one
chunk at a time; the ready queue is capped at three chunks, and completed audio
is released immediately.

The focused Reader follows the active chunk until manual wheel or touch input
yields auto-scroll; Return to current restores following. A contents rail is
derived from real paragraphs rather than synthetic headings.

The audio element implements sample-level Pause/Resume. Stop releases the blob
URL and keeps the stable sentence position. Previous/Next move one sentence and
invalidate the old session. Voice and speed changes use the same invalidation
path. Kokoro does not expose sentence timestamps, so all sentences in the active
chunk are highlighted together rather than using fake intra-chunk timing.

## Documents and OCR

The webview decodes TXT and Markdown as Unicode. Markdown syntax is reduced with
small deterministic rules rather than a parser dependency. PDF bytes cross raw
IPC and are checked for size, signature, and a 500-page ceiling before
`pdf-extract` reads each text layer. Pages with fewer than 20 alphanumeric
characters are treated as text-poor; existing page text is preserved.

OCR is explicit and local. After confirmation, Rust loads the bundled PDFium DLL,
renders only text-poor pages sequentially to temporary JPEGs at a target width of
2400 pixels, and invokes the bundled Tesseract executable directly with fixed
English `tessdata_fast` arguments. SIREN never writes the source PDF. A generation
token cancels future pages and prevents stale results from replacing a newer
document. Temporary images are removed when work completes, fails, or is canceled.
Only one OCR operation owns the PDFium runtime at a time; this deliberately favors
bounded memory and simple cancellation over parallel throughput.

Successful PDF text is cached in versioned local storage under a SHA-256 of the
source bytes plus the OCR engine/model/render identity. Cache cleanup reuses the
existing recent-document deletion path.

## Persistence

A versioned local-storage record contains validated settings, reader appearance
preferences, up to eight recent normalized documents, the active document id,
current sentence indexes, and last opened timestamps. Invalid or unavailable
stored data falls back to safe defaults.
The recent-body approach is intentionally simple and supports resume after a
source file moves. The documented ceiling is webview quota; SQLite is deferred
until measured library size requires it.
