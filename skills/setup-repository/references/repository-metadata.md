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

`schemaVersion` and `appliedRevision` are integers. `profile` is `default`. `providers` is an object. An existing schema other than version 1 is unsupported in this release. Migration behavior is not inferred.

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
