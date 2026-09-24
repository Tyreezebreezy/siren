# SIREN v1.2.0 finalization plan

## Goal

Finish the current SIREN cycle by improving first-audible latency where evidence
permits, adding completely local scanned-PDF OCR, applying small reader polish,
and publishing one verified private Windows release.

## Scope

- Decompose and benchmark the cold Kokoro path without weakening the v1.1 queue.
- Adopt only Fast Start changes that preserve continuity, cancellation, speech
  quality, CPU fallback, and broad Windows compatibility.
- Preserve native text extraction and OCR only text-poor scanned PDF pages.
- Bundle the minimum mature permissively licensed PDF rendering, Tesseract 5,
  and English `tessdata_fast` assets needed for offline OCR.
- Show page-based OCR progress, support cancellation, retain page boundaries,
  cache normalized OCR text with deterministic versioned identity, and never
  modify the source PDF.
- Apply only the handoff's small playback/OCR-state/accessibility polish.
- Validate, package, install-test, privately publish, download, rehash, and stop.

## Non-goals

- Cloud OCR/TTS, telemetry, analytics, accounts, sync, DOCX, EPUB, audio export,
  voice cloning, summaries, chat, plugin systems, or another design rewrite.
- Mandatory GPU/CUDA support, workstation-specific threading, speculative model
  formats, multilingual traineddata, or OCR image caching.
- Starting a post-v1.2 feature version.

## Constraints and security

- Normal reading remains fully local and offline with no new network permission.
- CPU is the required TTS baseline; the stable paragraph-bounded three-unit queue
  and stale-work invalidation remain protected.
- OCR binaries/data are bundled, versioned, hashed, licensed, and invoked only
  against SIREN-owned temporary page images with bounded work and cleanup.
- Source PDFs are read-only inputs. Cache deletion can remove only SIREN-owned OCR
  records, never source files.
- New dependencies must be minimal, reproducibly locked, vulnerability-scanned,
  and documented with purpose, source, license, provenance, and removal path.

## Acceptance criteria

- TXT, Markdown, text-PDF, scanned-PDF, mixed-PDF, OCR cancel/retry/cache, Reader,
  Library, appearance, keyboard, accessibility, persistence, and resume pass.
- Installed v1.2 TTS has zero observable underruns, no stale playback, comparable
  or better transitions and Stop latency, and no material speech-quality loss.
- Installed OCR reports real page progress, cancels safely, completes locally,
  reads aloud, reopens from cache, and leaves the source PDF byte-identical.
- 1366x768, 1440x900, and 1920x1080 have no page overflow or clipped controls.
- Validation, Rust tests/clippy, audits, secret/vulnerability scans, installer,
  uninstall, private release, authenticated readback, hash, and unauthenticated
  404 checks pass.

## Test strategy

- Reuse the v1.1 50-sentence fixture for before/after TTS measurements.
- Keep unit checks at parser/cache/cancellation trust boundaries; use existing
  frontend tests for reader/persistence regressions.
- Use deterministic text, scanned, and mixed PDF fixtures plus source hashes.
- Exercise the exact installed release through native WebView2 automation and
  capture the six required UI states at the three target viewports.

## Owner decisions and hard stops

- The owner explicitly authorized live repository changes, justified dependencies,
  `main` commits, final annotated tag, and private Gitea publication.
- Publish `v1.2.0` only when OCR and all final gates pass. Use `v1.2.0-rc.1` for a
  genuine blocker and document it; never claim an unexecuted gate passed.
- Do not publish to GitHub. After verified private publication, stop.
