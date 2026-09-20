---
name: setup-repository
description: Set up or reconcile local repository metadata when the user explicitly runs /setup-repository or /setup-repository reset-managed.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Setup repository

Reconcile the current repository's local `ai-utilities.json`. This skill runs outside the delivery workflow and saves no task artifact.

## Local-only boundary

Use local filesystem and Git configuration only. Make no network requests. Run no provider CLI or SDK. Look up no credentials. Discover and mutate no remote provider resource. Every receipt reports `External operations: 0`.

## Flow

1. Resolve the repository root with `git rev-parse --show-toplevel`. Outside a Git work tree, stop with a conflict receipt and write nothing.
2. Parse the invocation after `/setup-repository`. No argument defaults to `reconcile`; exact `reconcile` and exact `reset-managed` are the two accepted modes. Reject aliases, extra words, and every other mode before reading or writing metadata.
3. Read [repository metadata](references/repository-metadata.md) completely. Observe the original bytes of `<root>/ai-utilities.json` when present and local remote URLs from Git configuration. Do not contact those remotes.
4. Parse and validate the complete owned subtree before planning. Require a top-level object; require `onboarding`, when present, to be an object; validate its supported integer versions, current profile, provider-object shape, and every nested key against the secret-key rules in the metadata reference. Invalid JSON, an invalid owned-state type, an invalid version field, an unsupported owned schema or revision, or a secret-shaped field under `onboarding` produces a conflict receipt and zero writes. Report the JSON path, observed type or value class, and supported expectation without exposing a secret value or source excerpt.
5. Compute the complete document and receipt plan in memory from the parsed top-level document and the ordered migration table. Preserve each existing top-level value except `onboarding` without reconstructing, normalizing, sorting, or defaulting it. Assign only the planned replacement `onboarding` value.
   - In `reconcile`, initialize absent managed state, migrate supported older managed state, or retain current valid managed state. Never infer reset intent or continue with reset after a conflict.
   - In exact `reset-managed`, rebuild only the verified local fields `schemaVersion`, `profile`, and `appliedRevision` at current values. Preserve every user-owned or unknown top-level field and every provider ownership record that this release cannot verify. Mark those records `unsupported` and the reset partial; do not adopt, normalize, reapply, or delete them.
   - In either mode, provider ownership with no installed adapter authorizes no provider observation or operation. Include each preserved record's logical key, stable ID, and last-applied digest in the receipt without changing it.
6. Compare semantic documents before serialization. When no semantic change exists, retain the original bytes exactly and skip the write. When the plan changes semantics, serialize only as specified in the metadata reference, write a temporary sibling file, and atomically rename it to `ai-utilities.json`. Create the temporary file only after validation and planning succeed; remove it if the rename fails.
7. Reread `ai-utilities.json`. For a write, require exact equality with the planned bytes. For a no-op, require exact equality with the observed bytes. A mismatch is a failed verification.
8. Render [the setup receipt](references/setup-receipt-template.md), then answer with [the terminal format](references/setup-final-answer.md). Blocked and reset receipts include one safe inline rerun command when a rerun is useful. Print the receipt; save no second file and print no next-skill fence.

Completion means the receipt names every planned path, reports the verified byte result, and records zero external operations.
