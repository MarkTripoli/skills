---
name: credentials
description: Explicitly compare tracked environment-file credentials across selected repositories without exposing values.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Shared Credential Correlation

This opt-in local CLI compares environment-file values across at least two explicitly selected standalone Git repository roots. A selection must be the repository root and contain a real `.git` directory; subdirectories, linked worktrees (whose `.git` is a file), and duplicate roots are rejected. Distinct standalone roots sharing the same Git metadata directory are not distinct repositories. It does not upload source or call external services. Python 3 is required for descriptor-bound Git metadata commands; the selected root and `.git` directory are opened and pinned before Git reads, and metadata that cannot be pinned fails closed. Tracked `.env` and `.env.*` values come from the captured `HEAD` tree and locally available, object-ID-verified Git blobs with lazy fetching disabled. A finding requires an equal, non-placeholder value in distinct repositories; repeats within one repository are not findings.

```sh
node <installed-skills-dir>/credentials/scripts/correlate.mjs --repo <repo-one> --repo <repo-two>
```

Ignored env files are excluded unless the operator separately requests `--include-ignored` and affirms owner authorization with `--owner-authorized`. Tracked symlinks are rejected. Opted-in ignored paths may be nested. The bundled Python launcher runs Git from the held `.git` directory descriptor and derives the worktree path from the held repository-root descriptor; the ignored reader traverses every path component with `O_DIRECTORY|O_NOFOLLOW`, opens leaves with `O_NOFOLLOW`, and verifies regular files. Each environment file is capped at 1 MiB; scans fail closed above 4,096 files, 32 MiB of scanned object/file/listing bytes, or 20,000 units of per-root scan work. Missing Python, failed descriptor access, or a scan limit fails closed.

Output is JSON with schema version 1. Each finding contains a random per-run `group_id` and `locations`; each location identifies the selected repository by its zero-based `repo_index`, a repository-relative citation path, and line number. Any extracted credential value occurring in a reported path is replaced with a private-use marker absent from scanned credential values; affected locations include `path_redacted: true` to mark the reduced citation. Credential values are never emitted or separately hashed. Internal Git object IDs are used only for integrity checks and are not returned. Scanner diagnostics/source text are not forwarded. Group IDs are intentionally not stable across runs.

This capability owns only `skills/delivery/credentials/`. It does not replace or modify `security-check`, relationship analysis, or red-team workflows. Correlation is evidence of shared literal configuration only; it does not establish credential validity, ownership, or compromise.
