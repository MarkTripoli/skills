---
name: credentials
description: Explicitly compare tracked environment-file credentials across selected repositories without exposing values.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Shared Credential Correlation

This opt-in local CLI compares environment-file values across at least two explicitly selected Git repository roots. A selection must resolve exactly to `git rev-parse --show-toplevel`; subdirectories and duplicate roots are rejected. Distinct linked worktrees sharing `git rev-parse --git-common-dir` are not distinct repositories. It does not upload source or call external services. By default it reads `.env` and `.env.*` paths in the captured `HEAD` tree, using locally available, object-ID-verified Git blobs with lazy fetching disabled. A finding requires an equal, non-placeholder value in distinct repositories; repeats within one repository are not findings.

```sh
node <installed-skills-dir>/credentials/scripts/correlate.mjs --repo <repo-one> --repo <repo-two>
```

Ignored env files are excluded unless the operator separately requests `--include-ignored` and affirms owner authorization with `--owner-authorized`. Tracked symlinks are rejected. Opted-in ignored files are limited to top-level env files; nested paths fail closed. The portable pathname fallback checks root and file device/inode identity before and after opening with no-follow semantics, and rejects detected rebinding. These checks cannot eliminate every concurrent cross-process pathname race; use ignored-file mode only on a trusted local checkout under owner control.

Output is JSON with schema version 1. Each finding contains a random per-run `group_id` and `locations`; each location identifies the selected repository by its zero-based `repo_index`, a safe repository-relative path, and line number. Credential values are never emitted or separately hashed. Internal Git object IDs are used only for integrity checks and are not returned. Scanner diagnostics/source text are not forwarded. Group IDs are intentionally not stable across runs.

This capability owns only `skills/delivery/credentials/`. It does not replace or modify `security-check`, relationship analysis, or red-team workflows. Correlation is evidence of shared literal configuration only; it does not establish credential validity, ownership, or compromise.
