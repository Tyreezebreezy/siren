# SIREN v1.1.0

SIREN v1.1.0 focuses the local Windows reading experience without changing its
offline trust boundary.

## Highlights

- Separate Library and focused Reader surfaces with a Continue action.
- Click any sentence to read from it, including while playback is active.
- Auto-follow yields to manual scrolling and offers Return to current.
- Persisted text size, line spacing, reader width, highlighting, and theme.
- Native-owned single startup warmup avoids duplicate frontend warmup work.
- Improved keyboard and focus behavior, loading/error states, and laptop layout.

## Performance

On the release workstation, first audible playback improved from 15,389 ms to
13,554 ms in the development benchmark. The stable paragraph-bounded queue was
kept after a more aggressive first-chunk experiment caused audible underruns.
Exact installed-release results are recorded in `STATUS.md`.

## Scope

Kokoro inference, documents, settings, and recent reading bodies remain local.
OCR, DOCX, EPUB, cloud sync, voice cloning, and audio export remain out of scope.
The Windows installer is not code-signed.
