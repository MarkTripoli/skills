---
name: credentials
description: Explicitly compare tracked environment-file credentials across selected repositories without exposing values.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Shared Credential Correlation

This opt-in local CLI compares environment-file values across at least two explicitly selected Git repositories. It does not upload source or call external services. It reads only tracked `.env` and `.env.*` files by default. A finding requires an equal, non-placeholder value in distinct repositories; repeats within one repository are not findings.

```sh
node <installed-skills-dir>/credentials/scripts/correlate.mjs --repo <repo-one> --repo <repo-two>
```

Ignored env files are excluded unless the operator separately requests `--include-ignored` and affirms owner authorization with `--owner-authorized`. The command rejects identical canonical repository roots and symlinks resolving outside a selected repository. Select only repositories you are authorized to inspect.

Output is JSON with schema version 1. Each finding contains a random per-run `group_id` and `locations`; each location identifies the selected repository by its zero-based `repo_index`, a safe repository-relative path, and line number. Values exist only during comparison. They are never emitted or hashed, and scanner diagnostics/source text are not forwarded. Group IDs are intentionally not stable across runs.

This capability owns only `skills/delivery/credentials/`. It does not replace or modify `security-check`, relationship analysis, or red-team workflows. Correlation is evidence of shared literal configuration only; it does not establish credential validity, ownership, or compromise.
