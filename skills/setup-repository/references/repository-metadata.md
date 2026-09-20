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

`schemaVersion` and `appliedRevision` are integers. `profile` is `default`. `providers` is an object.

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

When a supported existing managed subtree contains a `providers` object, carry that complete object into the replacement instead of `{}`. Preserve every provider record and its values; migration cannot adopt, remove, normalize, or rewrite provider identities. Provider records never authorize a provider call.

Reject any field under `onboarding` whose normalized key names a token, secret, password, private key, API key, or access key. Report its JSON path, never its value.

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

After a semantic change, serialize exactly once with `JSON.stringify(document, null, 2) + "\n"`. The write target is only `ai-utilities.json` at the Git root. Use a temporary sibling and atomic rename; no validation or planning failure may leave either temporary or final metadata behind when the file was originally absent.

This release performs no provider observation or operation. Existing provider ownership records are not authority to call a provider.
