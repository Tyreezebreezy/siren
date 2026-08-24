# Security standard

Use a practical NIST SSDF-inspired baseline proportionate to project risk.

## Required review

- Inventory direct and transitive dependencies; review lockfile changes and licenses.
- Run secret and vulnerability scans; interpret results against the shipped dependency graph.
- Review native/API command allowlists, filesystem scopes, network endpoints, secrets, logs, temporary files, caches, CSP/browser policy, installer contents, and artifact hashes.
- Document real limitations. Security exceptions require explicit owner acceptance and may not be hidden as test waivers.

## Authority rules

- Default to no network, no broad filesystem access, no shell execution, and no remote webview content.
- Grant a Tauri capability only to the exact window, command, platform, and scope that needs it.
- Never log secrets or sensitive user data. Do not commit `.env` files, credentials, tokens, private keys, or generated user data.
- Review third-party workflows, presets, extensions, and scripts before execution. A declared requirement is not a runtime sandbox.

## Evidence

Record scanner name/version, command, scope, timestamp, exit status, findings, dispositions, and any owner acceptance in the active phase QA record.
