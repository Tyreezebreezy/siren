# Testing standard

Tests prove approved behavior; they do not justify unrequested features.

## Minimum gates

1. Static checks: parse configuration, type-check frontend code, and format-check changed languages.
2. Deterministic unit checks for non-trivial branches, parsers, security logic, and money/data-loss paths.
3. Build checks for every shipped target affected by the phase.
4. Rendered UI checks for page identity, meaningful content, console health, visible focus, the primary interaction, and desktop plus one narrow viewport.
5. Regression after Ponytail and security changes.

Record the exact command and result. “Looks good” is not evidence. A skipped check is a limitation, not a pass.
