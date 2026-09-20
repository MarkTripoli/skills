# Repository metadata

`ai-utilities.json` is one top-level JSON object. Ownership, validation, inference, and serialization are defined here.

## Ownership

- `vcs` and `ticketing` are user-owned. Preserve each complete value when present.
- `onboarding` is owned by `/setup-repository`.
- Preserve every unknown top-level key and value.
- Assign only fields whose owner permits it. Never reconstruct or normalize the top-level document to clean foreign data.

## Current managed state

The current local schema is version 1 and profile revision 1:

```json
{
  "schemaVersion": 1,
  "profile": "default",
  "appliedRevision": 1,
  "providers": {}
}
```

`schemaVersion` and `appliedRevision` are integers. In current schema 1 at revision 1, `profile` is exactly `default`. `providers` is an object, never an array or null.

## Fail-closed validation

Validate all managed state before constructing a plan or temporary file:

- Before any payload read, inspect `ai-utilities.json` with `lstat`. Continue only when it is absent or a regular non-symlink file. A directory, valid or dangling symlink, FIFO, socket, block device, or character device is a path/type conflict. Do not open or follow the entry, read a target, create a temporary file, or perform an external operation.
- The top-level JSON value and any present `onboarding` value must be objects, not arrays or null.
- `schemaVersion` and `appliedRevision` must be present integers in the supported migration table. Report newer schema conflicts as `supported: 1, observed: <version>` in both modes.
- Current schema 1 at revision 1 requires `profile: "default"`. Supported older rows may omit current defaults because their plan replaces the owned subtree.
- `providers` must be an object when present. Validate every nested provider record as data to preserve; its presence never proves an adapter is installed.
- Recursively normalize each key by lowercasing it and removing separators. Reject keys matching `token`, `secret`, `password`, `privatekey`, `apikey`, or `accesskey` forms.

A conflict receipt names the JSON path, observed type or non-secret value class, and supported expectation. It reports `Written: none`, unchanged original bytes, and zero external operations. For invalid JSON, report only the parse conflict class and file path; never quote source bytes. No blocked case may create or retain a temporary sibling file.

## Ordered migration table

Apply the first matching row after parsing and validating the existing `onboarding` object:

| Observed managed state | Plan |
|---|---|
| `onboarding` absent | Initialize the current schema-1 subtree. |
| `schemaVersion: 0`, `appliedRevision: 0` | Replace the owned subtree with current schema 1 and revision 1. Remove obsolete owned fields. |
| `schemaVersion: 1`, `appliedRevision: 0` | Fill current owned defaults and replace the owned subtree at revision 1. |
| `schemaVersion: 1`, `appliedRevision: 1` | Current. Preserve the original document bytes when no other semantic change exists. |

Inside an existing `onboarding` object, both version fields must be present integers from 0 through 1. Missing, non-integer, negative, or greater-than-1 values are conflicts. Only the schema/revision pairs in the table are supported; every other pair conflicts before planning or writing.

Build migration output from the parsed top-level document. Assign only its replacement `onboarding` value. Preserve the complete existing values of `vcs`, `ticketing`, and every unknown top-level key. Do not reconstruct, normalize, sort, or add defaults to those foreign subtrees.

For either supported migration, the replacement owned subtree is exactly:

```json
{
  "schemaVersion": 1,
  "profile": "default",
  "appliedRevision": 1,
  "providers": {}
}
```

When a supported existing managed subtree contains a `providers` object, carry that complete object into the replacement instead of `{}`. Preserve every provider record and its values; migration and reset cannot adopt, remove, normalize, or rewrite provider identities. Provider records never authorize a provider call.

Reject any field under `onboarding` whose normalized key names a token, secret, password, private key, API key, or access key. Report its JSON path, never its value.

## Exact reset-managed behavior

Only the exact `reset-managed` argument selects reset behavior. Aliases, extra words, inferred intent, and automatic reset after a validation conflict are invalid invocations or blocked runs.

`reset-managed` has stronger local intent but no broader authority. After fail-closed validation accepts a supported owned state, construct a replacement `onboarding` subtree with current `schemaVersion`, `profile`, and `appliedRevision`; remove obsolete locally owned fields; and carry the complete existing `providers` object unchanged. Preserve `vcs`, `ticketing`, and every unknown top-level value unchanged. Never delete `ai-utilities.json` or replace the complete top-level object.

An unsupported newer schema remains blocked in `reset-managed`; explicit mode does not authorize a downgrade. A second reset of current state is a semantic no-op and preserves the original bytes.

## Provider ownership safety

Provider ownership depends on recorded stable identity, not display name:

- A name match without a recorded stable ID is foreign and conflicts. Never adopt it by name.
- A recorded stable ID with a different observed digest is drift and conflicts in `reconcile`.
- Explicit reset may reapply drift only after an installed provider adapter observes that same recorded identity.
- This release has no provider adapter. Every existing provider record is `unsupported`, remains byte-equivalent in the planned object, and causes zero provider operations in both modes.

For each unsupported record, the receipt reports its logical key, stable ID, and last-applied digest as preserved. A reset containing such records is partial because only verified local fields can be rebuilt.

## Provider-specific future behavior

This document freezes behavior, not a shared adapter interface. The first release has no provider adapters and no second implementation from which to derive a common code abstraction.

Each future adapter keeps its provider-specific resource model behind five shared result categories:

- `create` means no prior owned identity or foreign match exists, the adapter creates its provider-specific resource, and success records `logicalKey`, `stableId`, and `lastAppliedDigest`.
- `update` means the adapter observed the same recorded stable identity and may apply its provider-specific change. Success records the same three ownership fields with the applied digest.
- `no-op` means the recorded stable identity and observed digest already match the desired provider-specific state. Existing ownership remains unchanged.
- `conflict` means ownership cannot be established safely. A foreign name match or reconcile drift performs no operation and creates no ownership record.
- `unsupported` means the provider or requested provider-specific operation has no adapter. It performs no operation and creates no ownership record.

The behavioral flow is:

```text
observe(context, priorOwnedState) -> providerSnapshot
plan(snapshot, priorOwnedState, profileRevision, mode)
  -> create | update | no-op | conflict | unsupported
apply(plan)
  -> operations + { logicalKey, stableId, lastAppliedDigest }
```

Ownership always follows recorded stable identity. A matching display name without prior recorded stable identity is foreign and returns `conflict`. When the same recorded identity has a different observed digest, `reconcile` returns `conflict`; `reset-managed` may return `update` only after the adapter observes that same recorded identity.

GitHub adapters may manage repository label resources. Linear adapters may manage team or workspace resources. Jira provisioning may return `unsupported`. Each adapter defines its own desired resource shape; there is no provider-neutral label object or generic provider operation.

## First run

When `ai-utilities.json` is absent, create a new top-level object. Seed `vcs.platform: "github"` only when at least one remote exists and every configured remote URL unambiguously identifies `github.com` through an HTTPS, SSH, or Git URL. A missing remote, unsupported host, malformed URL, or mixed host set leaves `vcs.platform` unresolved.

A GitHub remote never implies `ticketing.tool`. Omit unresolved `vcs` and `ticketing` objects instead of writing nulls, empty objects, placeholders, or guesses. Report every absent user-owned choice as unresolved.

With unambiguous GitHub remotes, the first-run document is:

```json
{
  "vcs": {
    "platform": "github"
  },
  "onboarding": {
    "schemaVersion": 1,
    "profile": "default",
    "appliedRevision": 1,
    "providers": {}
  }
}
```

Without unambiguous inference, omit `vcs` and begin with `onboarding`.

## Planning and bytes

Compare parsed documents for semantic equality before serialization. A semantic no-op preserves the exact observed bytes, including indentation, key order, and final newline state.

After a semantic change, serialize exactly once with `JSON.stringify(document, null, 2) + "\n"`. The write target is only `ai-utilities.json` at the Git root. Use a regular temporary sibling and atomic rename. Before rename, apply the existing regular metadata file's permission bits to the temporary file. For first creation, request mode `0600`; where POSIX modes apply, require the result to remain owner-writable and not world-writable after the platform umask. Do not copy ownership or dereference an entry. No validation, planning, permission, or rename failure may leave a temporary sibling or a new final file when metadata was originally absent.

This release performs no provider observation or operation. Existing provider ownership records are not authority to call a provider.
