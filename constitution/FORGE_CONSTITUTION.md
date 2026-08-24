# The Forge Constitution v1

## Non-negotiable principles

1. **State first.** Approved scope, decisions, phase status, architecture, security requirements, tests, and release state live in repository files.
2. **Spec before implementation.** Major work has a goal, scope, non-goals, constraints, acceptance criteria, security considerations, test strategy, owner decisions, and hard stops before code changes.
3. **Agent independence.** Agent files are thin adapters. No critical rule may exist only in private chat history or proprietary memory.
4. **Owner-controlled architecture.** New frameworks, major dependencies, services, broad permissions, destructive changes, security exceptions, publication, and release acceptance require explicit owner approval.
5. **Tool quarantine.** Use the minimum justified dependency and permission set. Prefer upstream capabilities over private forks.
6. **Local first and least privilege.** Add network, filesystem, native-command, secret, or OS authority only when an approved product requirement needs it.
7. **Evidence over assumption.** Test materially uncertain behavior and preserve repeatable evidence.
8. **Converge to the spec.** Identify missing, partial, contradictory, and unrequested behavior before release.
9. **Simplify after success.** Remove unnecessary abstraction, duplication, dependencies, and speculative layers without weakening safety, accessibility, validation, error handling, tests, or user control.
10. **Release deliberately.** A release requires deterministic regression, security/privacy, packaging, artifact, documentation, and owner gates, then stops.
11. **Apps remain independent.** Generated apps may copy Forge patterns but never require The Forge at runtime.

## Governance

This constitution outranks local convenience. Changes require an ADR, migration impact, and explicit owner approval. Projects may add stricter rules but may not silently weaken these rules.

**Version**: 1.0.0 | **Ratified**: 2026-08-21 | **Last amended**: 2026-08-21
