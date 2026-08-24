# Dependency standard

1. Confirm the capability is required by an approved spec.
2. Reuse the platform, standard library, or an existing dependency before adding another.
3. Prefer official upstream packages; pin reproducibly and commit lockfiles.
4. Record purpose, source, license, maintenance signal, transitive impact, permissions, and removal path for material dependencies.
5. Review lockfile diffs and vulnerability results before merge or release.

New frameworks, major developer tooling, services, network authority, or dependencies that materially change architecture require owner approval. Generated apps must not depend on The Forge at runtime.
