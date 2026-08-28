# SIREN v0.1.1

## Goal

Make long-form local speech continuous on ordinary Windows laptops and make the
existing reader fit comfortably at 1366×768 and 1440×900.

## Scope

- Measure Kokoro model load, synthesis, audio duration, RTF, playback startup,
  transition delay, and bounded queue state.
- Generate moderate paragraph-respecting speech chunks ahead of playback while
  preserving sentence indexes for navigation, highlighting, and resume.
- Invalidate stale work on Stop, navigation, document, voice, or speed changes.
- Compact the laptop layout, text input, sidebar, and playback controls without
  redesigning the importer or overall visual direction.
- Replace the icon with simple original waveform/S geometry that remains legible
  at Windows icon sizes.
- Regress supported imports, reader behavior, persistence, packaging, and security.

## Non-goals

New TTS engines, Python/PyTorch, cloud APIs, CUDA requirements, OCR, DOCX, EPUB,
audio export, or a general interface redesign.

## Release gate

Create only an annotated `v0.1.1-rc.1` after measured long-form playback,
responsive laptop QA, existing regression checks, security scans, production
packaging, and installed-app smoke testing pass. Final `v0.1.1` publication
requires a later explicit owner gate.
