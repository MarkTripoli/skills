## Purpose

Add an idempotent `/setup-repository` skill that safely reconciles local repository metadata while preserving user-owned state and leaving future provider integrations explicit.

## Special things to note

- First release is intentionally local-only: it performs no provider discovery, credential lookup, network request, or remote mutation.
- `/setup-repository` and `/setup-repository reconcile` preserve unknown top-level fields and original bytes on semantic no-op; `reset-managed` replaces only verified skill-owned state.
- Terminal eval support now retains typed repository, excluded-root, Git configuration, semantic-index, process-status, and completion evidence for live and offline regrading.

## Change outline

The new metadata boundary keeps ownership explicit.

```diff
 ai-utilities.json
+  vcs / ticketing    user-owned; preserved when present
+  onboarding         skill-owned schema and provider outcomes
+  unknown fields     preserved
```

Runtime flow:

```text
/setup-repository [reconcile | reset-managed]
  resolve Git root and validate exact mode
  observe metadata bytes and local remotes
  reject unsafe entries, invalid state, secrets, or future schema
  compute complete local plan before mutation
  atomically write only changed bytes
  reread and verify exact result
  print terminal receipt with External operations: 0
```

Supporting ownership:

```text
skills/setup-repository/       skill contract, metadata rules, receipt templates
evals/                         terminal execution and retained evidence boundaries
tests/                         setup, installer, manifest, Git, and regrade regressions
scripts/lib/build.mjs          shared portable builder for CLI and installer parity
docs/                          discovery and release-proof commands
```

The central review boundary is `skills/setup-repository/references/repository-metadata.md`; it defines validation, migration, ownership, serialization, reset, and provider-result rules used by the skill.

## Human Review

### Review targets

- Confirm local metadata ownership and fail-closed behavior in `skills/setup-repository/`.
- Confirm terminal eval capture cannot silently pass missing, malformed, redirected, or externally aliased retained evidence.
- Confirm installer and portable CLI outputs remain byte-identical for selected skills.

### Verify

- [ ] Run `npm test` and confirm all 249 tests pass.
- [ ] Run `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`.
- [ ] Regrade the retained five-scenario setup run or run the five documented setup scenarios live when OMP credentials are available.

### Known limits

- Authenticated Linear, Jira, GitHub Issues, and GitHub resource behavior is deferred to provider-specific adapters with separate credentials and evidence.
- Retained evidence is a local static recording, not cryptographically authenticated or protected against a concurrent malicious filesystem writer.
