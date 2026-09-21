## Purpose

Add Safety Dance, a repository-native Git push gate and durable validation daemon that reviews, tests, and publishes accepted changes through an authenticated local workflow.

## Special things to note

- Safety Dance trusts the local OS user and repository validation commands; hostile same-user or untrusted-repository isolation requires an external sandbox, broker, or separate OS principal.
- Binary releases target Linux and macOS only. Windows remains unsupported until native gate and service behavior has CI coverage.
- Component tests cover failure and recovery paths, but the built-binary end-to-end suite currently proves only the successful publication flow.

## Change outline

The new product, skill, documentation, and distribution surfaces are separated by ownership.

```text
tools/safety-dance/                 Go CLI, daemon, gate, pipeline, persistence, and tests
skills/delivery/safety-dance/       portable operator skill and safety references
docs/safety-dance.md                product usage and trust model
.github/workflows/                  repository CI and tagged binary releases
scripts/ + tests/                   identity, installer, and release-contract checks
```

Pushes move through an authenticated admission and guarded publication flow.

```text
git push
  -> managed pre-push hook
  -> authenticated daemon admission
  -> durable branch run and owned worktree
  -> intent, review, validation, and test gates
  -> reviewed-head and force-with-lease checks
  -> upstream publication or retained recovery state
```

Repository installation ships Safety Dance as an independent skill; binary installation and release remain separate from skill synchronization.

## Human Review

### Review targets

- Inspect gate admission, IPC authentication, durable recovery, and publication lease checks under `tools/safety-dance/internal/`.
- Confirm the trusted-local-user threat model and Linux/macOS release boundary match intended deployment.
- Confirm installer, identity, and release-contract changes preserve existing skill distribution behavior.

### Verify

- [ ] Run `npm test`; expect repository validation, 137 Node tests, identity checks, Go race tests, vet, public-binary E2E, and release-contract tests to pass.
- [ ] Run `npm run build -- --runtime claude-code --dest <temp>`; expect Safety Dance to install as a skill without a generated worker.
- [ ] Confirm hosted pull-request checks pass and a tagged release remains untested until intentionally exercised.

### Known limits

- Hosted release execution and authorized live-provider behavior are untested.
- Full built-binary validation-failure, supersession, stale-review, lease-rejection, cancellation, and post-write recovery coverage is deferred; component-level coverage exists.
- Planned golden TUI states, every-step wizard cancellation, and explicit database concurrent-reader/crash-classification matrices are not complete.
