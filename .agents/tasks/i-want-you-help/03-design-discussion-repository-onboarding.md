---
task: i-want-you-help
type: design-discussion
summary: "Add a standalone `/setup-repository` skill that reconciles minimal `ai-utilities.json` metadata without changing installer ownership. First runs initialize user-owned provider choices; reruns preserve those choices and unknown fields while migrating only the skill-owned onboarding subtree. Future Linear, Jira, and GitHub Issues support enters through provider-specific observe/plan/apply adapters with recorded remote identity, never a generic label upsert."
repo: skills
branch: i-want-you-help
sha: eb89e08dd6fde5c8df826480c77e3195d75a71cc
---

### Summary of change request

Add a repository-onboarding skill that safely initializes a repository for this skills collection and can be rerun after collection updates. Keep the first version local and narrow while defining ownership and provider seams that can later support Linear, Jira, and GitHub Issues.

### Current State

- Installing the collection adds selected skills, workers, and optional workflow resources, but it does not configure the target repository for those skills.
- Repository metadata is optional and read by one workflow; no skill creates, validates, versions, or migrates it.
- Tracker-aware workflows detect providers and mutate remote state independently, so authentication, targeting, and failure behavior vary by workflow.
- Repeated installation replaces same-named collection resources and preserves unrelated names, but that behavior does not establish safe ownership for repository metadata or remote tracker resources.

### Desired End State

- A user runs `/setup-repository` once to initialize minimal repository metadata and receives an exact report of detected, written, skipped, and conflicting state.
- Running the same skill again with the same collection and repository produces no file diff and no remote mutation.
- Running it after a collection update migrates only state proven to be owned by the onboarding skill. User choices, unknown metadata, and foreign remote resources remain unchanged.
- Missing credentials or unsupported provider capabilities produce a partial result with a rerun path; they never trigger guessed mutations.
- Linear, Jira, and GitHub Issues can later implement provider-specific behavior without forcing their different label models into one upsert contract.

### What we're not doing

- Changing `scripts/install.mjs`, its name-addressed installation ownership, or its project and user scopes.
- Shipping Linear, Jira, or GitHub Issues mutations in the first repository-onboarding slice.
- Defining one provider-neutral label object or a common `upsertLabel` operation.
- Adopting, renaming, deleting, or overwriting remote resources based only on a matching name.
- Storing provider tokens, creating credentials, or changing user-owned repository settings without an explicit reset request.
- Adding the skill to the delivery phase chain or optional Atomic controller.

### Proposed End State Architecture

`/setup-repository` is a standalone reconciliation module. Its small interface is the current repository plus one optional mode, `reconcile` by default or `reset-managed` when explicitly requested. The implementation performs five ordered steps: observe, validate, plan, apply, and verify.

```text
skills/setup-repository/
├── SKILL.md                              # user-invoked reconciliation flow
└── references/
    ├── repository-metadata.md            # schema and field ownership
    ├── setup-receipt-template.md         # observed plan and result
    └── setup-final-answer.md              # rerun and failure handoff

repository root/
└── ai-utilities.json                     # user choices + onboarding-owned state
```

The skill remains independent of the installer. Installation answers which collection resources exist in an agent runtime; repository onboarding answers how one repository is configured and which repository or provider state this skill may reconcile.

#### Metadata ownership

`ai-utilities.json` becomes the single repository metadata file because `resolve-pr-reviews` already reads `vcs.platform` and `ticketing.tool` from it (`skills/delivery/resolve-pr-reviews/SKILL.md:18-24`). The initial schema adds one namespaced subtree rather than a second lock file:

```json
{
  "vcs": { "platform": "github" },
  "ticketing": { "tool": "github-issues" },
  "onboarding": {
    "schemaVersion": 1,
    "profile": "default",
    "appliedRevision": 1,
    "providers": {}
  }
}
```

- `vcs` and `ticketing` are user-owned choices. First run may seed absent values from unambiguous repository evidence; reruns validate and preserve them. A remote mismatch is a conflict, not permission to rewrite the file.
- `onboarding` is skill-owned state. Reruns may migrate supported older schema versions, update `appliedRevision`, and reconcile recorded provider ownership.
- Unknown top-level keys and unknown keys outside the skill-owned subtree survive every run.
- Invalid JSON or a newer unsupported `onboarding.schemaVersion` stops before any write.
- Credentials and secret-shaped values never enter the file.

#### First run and rerun behavior

| Observed state | `reconcile` result | `reset-managed` result |
|---|---|---|
| No metadata file | Infer only unambiguous values, create minimal metadata, report unresolved choices | Same; no existing managed state to reset |
| Current valid metadata | Validate, produce no write when unchanged | Rebuild only `onboarding`; preserve user and unknown fields |
| Older supported onboarding schema | Migrate the owned subtree, then reconcile | Replace the owned subtree at the current schema |
| Invalid JSON or newer schema | Stop with no writes | Stop with no writes |
| Provider unavailable or unauthenticated | Save valid local metadata, mark provider work partial | Same; reset does not bypass capability or authentication checks |
| Name match without recorded remote identity | Report conflict, preserve remote resource | Report conflict; reset never adopts by name |
| Recorded resource differs from its last applied digest | Report drift, preserve remote resource | Reapply only after the explicit reset mode confirms the recorded identity |

Writes use parse-and-merge semantics and occur only when the planned document differs. Verification rereads the file and compares it with the plan, making an identical second run observably unchanged.

#### Future provider seam

Provider support enters after local metadata is stable. Each provider adapter owns its authentication, target discovery, desired resource shape, duplicate behavior, and update operations. The onboarding module understands only this outcome vocabulary:

```text
observe(context, priorOwnedState) -> providerSnapshot
plan(snapshot, priorOwnedState, profileRevision) ->
  create | update | no-op | conflict | unsupported
apply(plan) -> applied operations + new owned state
```

For every created remote resource, the adapter records a logical key, provider-stable identifier, and digest of the last applied managed fields under `onboarding.providers.<provider>`. Reruns update by recorded identity only. Current values that differ from the recorded digest are drift and remain untouched in `reconcile` mode.

This seam does not promise label upsert. A GitHub adapter may reconcile repository label objects, a Linear adapter may reconcile workspace or team label objects, and a Jira adapter may report global label provisioning unsupported because Jira exposes labels as issue field values rather than standalone mutable resources (`02-research-repository-onboarding.md:127-145`). The first provider can remain internal to the skill; a shared code interface is extracted only when a second adapter proves shared behavior.

### Design Questions

None. `gates: none` authorizes selecting the strongest researched design without a design-stage question.

### Resolved Design Questions

#### Where repository onboarding lives

Choose a standalone `/setup-repository` skill, separate from the installer and delivery controller. This keeps a deep repository-reconciliation module behind one user action while preserving the installer's existing, tested ownership rules (`scripts/install.mjs:294-349`, `tests/install.test.mjs:58-261`).

Rejected alternatives:

- Extending the installer would mix runtime resource installation with repository semantics, credentials, and provider failures.
- Adding onboarding as a required delivery phase would impose setup on every task and make ordinary portable skills depend on repository mutation.
- Distributing setup across tracker-aware skills would preserve today's inconsistent ownership and rerun behavior.

#### How idempotency proves ownership

Choose explicit local ownership plus recorded remote identity and last-applied digest. A rerun can update state only when the owned path or recorded provider identifier proves authority; a name match alone produces a conflict.

Rejected alternatives:

- Name-addressed overwrite is acceptable for installed collection directories but unsafe for user-created metadata and tracker resources.
- Marker text alone is unavailable for Jira labels and can be edited or removed on other providers.
- Blind create-then-ignore-conflict depends on undocumented duplicate behavior and cannot apply collection updates safely.

#### How repository metadata fits

Formalize `ai-utilities.json` and add a skill-owned `onboarding` subtree. This reuses the existing read contract, gives migrations one versioned location, and avoids a second state file (`skills/delivery/resolve-pr-reviews/SKILL.md:18-24`).

Rejected alternatives:

- Inferring everything on every run cannot distinguish user choices from stale detection.
- A separate onboarding lock file duplicates provider selection and creates synchronization rules between two files.
- Owning the whole metadata file would make unknown future keys and user extensions unsafe.

#### How provider differences remain extensible

Document an observe/plan/apply seam with provider-specific desired state and shared result categories, then ship no provider implementation in the first slice. This preserves a place for Linear, Jira, and GitHub Issues while avoiding an invented common label model unsupported by current provider contracts.

Rejected alternatives:

- A common `upsertLabel` interface hides incompatible scopes, identities, and mutation capabilities.
- Three adapters in the initial slice would multiply authentication and live-test requirements before the local lifecycle is proven.
- Inline provider branches in `SKILL.md` would repeat discovery and conflict policy and make later ownership fixes non-local.

#### What reset means

`reset-managed` resets only the `onboarding` subtree and remote resources already recorded by stable identity. It preserves top-level user choices, unknown fields, credentials, and foreign resources. Reset is therefore a stronger reconciliation mode, not a claim over the whole repository.

Rejected alternatives:

- Recreating the whole metadata file would discard user state.
- Deleting and recreating remote resources would break references and exceed the requested non-destructive onboarding scope.

### Patterns to follow

#### Preserve state outside an explicit managed seam

The Codex configuration updater replaces one marked block while retaining surrounding user text. Repository onboarding should use the same ownership principle at JSON subtree and recorded-resource seams, not copy the text-marker implementation (`scripts/install.mjs:245-291`).

```js
const updated = step.complete !== false
  ? updateConfigBlock(existing, uninstall ? null : block)
  : selectedConfigBlock(existing, block, step.names, uninstall);
```

```text
parse metadata -> preserve user keys -> replace/migrate onboarding subtree -> write only on diff
```

#### Plan before mutation and test in temporary repositories

The installer computes operations before applying them, and its tests isolate homes and projects while checking repeat runs and foreign-state preservation (`scripts/install.mjs:180-216`, `tests/install.test.mjs:58-261`). The onboarding skill should expose the observed plan in its receipt, stop before writes on validation errors, and test first run plus rerun in temporary repositories.

#### Keep provider failure local and explicit

Existing tracker workflows already distinguish missing authentication, ambiguous targets, and per-item failures, but each does so independently (`skills/delivery/start-epic-delivery/SKILL.md:22-32`, `skills/delivery/resolve-pr-reviews/SKILL.md:18-24`). The onboarding skill should normalize these into `partial`, `conflict`, or `unsupported` results without claiming completion.

### Execution DAG

The task uses the fixed `full` workflow and `gates: none`. After this design discussion, `create-structure-outline`, `create-plan`, `implement-plan`, `verify-implementation`, the review and repair loop, and `describe-pr` run in order without human UI gates. Repository checks and promised acceptance items still run during verification; code review still repeats until clean, blocked, or bounded by the workflow.

## Human Review

### Review targets

- The standalone skill owns repository reconciliation, while the installer retains runtime installation ownership.
- Top-level provider choices remain user-owned; only the `onboarding` subtree and recorded remote identifiers are managed.
- Default reruns preserve drift and foreign resources; `reset-managed` remains scoped to proven ownership.
- Provider-specific adapters do not expose a common label-upsert interface.

### Verify

- [ ] A first-run fixture creates the minimal metadata shape without credentials or unrelated files.
- [ ] An identical second run is byte-for-byte unchanged and plans zero external operations.
- [ ] A collection-revision fixture migrates only the `onboarding` subtree and preserves user choices plus unknown keys.
- [ ] Invalid JSON, a newer schema, a foreign name match, and manually drifted managed state each stop the unsafe mutation and report the exact conflict.
- [ ] Offline provider-contract fixtures cover `create`, `update`, `no-op`, `conflict`, and `unsupported`; live credentials remain separate evidence when an adapter is added.
- [ ] Repository validation, runtime generation checks, and `npm test` pass after implementation.

### Known limits

- The first slice does not mutate Linear, Jira, or GitHub Issues; it establishes local lifecycle and the adapter contract.
- A lost metadata file also loses remote ownership records. Matching remote names remain foreign until a later explicit adoption design is approved.
- Provider integration readiness requires separate authenticated evidence because offline tests cannot prove live API behavior.
