# SIREN v0.1.0

## Goal

Ship a polished local-first Windows reader that turns typed, pasted, TXT,
Markdown, and text-based PDF content into natural offline speech.

## Frozen scope

- Kokoro 82M local synthesis behind a small internal engine boundary.
- Sentence parsing, highlighting, navigation, queued playback, and auto-scroll.
- Play, pause, resume, stop, previous, and next controls.
- Voice, speed, theme, and auto-scroll preferences.
- TXT, Markdown, and text-PDF imports with explicit no-OCR behavior.
- Recent documents and durable sentence-level resume.
- Accessible dark/light/system desktop interface and NSIS package.

## Non-goals

DOCX, EPUB, OCR, cloud sync, accounts, web/mobile clients, voice cloning,
summaries, chat, podcasting, SSML authoring, and plugin systems.

## Release gate

Do not tag `v0.1.0` unless production packaging, local speech, supported imports,
resume, tests, security review, packaged launch, and repository state all pass.
