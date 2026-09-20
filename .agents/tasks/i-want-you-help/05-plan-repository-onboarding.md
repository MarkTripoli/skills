---
task: i-want-you-help
type: plan
summary: "Implement `/setup-repository` as a standalone local metadata reconciler in four sequential phases: first-run idempotency, owned-subtree migration, fail-closed reset behavior, and provider-contract proof. The plan updates the live inventory from 43 to 44 canonical skills and from 36 to 37 published plugin skills, while extending the artifact-only eval runner with an opt-in terminal phase contract. Fresh `/implement-plan` sessions advance from the first phase with an unchecked automated-verification item and keep installer ownership, delivery orchestration, Atomic, and provider APIs unchanged."
repo: skills
branch: i-want-you-help
sha: 9fe92b935780ee1d45aa1a63bc8a064a47c2b604
---

# Repository Onboarding Implementation Plan

## Overview

Add `/setup-repository` as a top-level standalone skill that observes, validates, plans, applies, and verifies local `ai-utilities.json` metadata. Its interface is the current Git repository plus an optional exact mode: `reconcile` by default or `reset-managed` when the user invokes `/setup-repository reset-managed`.

The first release writes local metadata only. It preserves user-owned provider choices and unknown top-level fields, changes only the `onboarding` subtree it owns, writes only when planned bytes differ, and prints a terminal receipt with zero provider operations.

## Current State Analysis

The repository has no repository-onboarding skill or schema owner. `resolve-pr-reviews` reads `ticketing.tool` and `vcs.platform` when present, but no existing skill creates, validates, migrates, or resets `ai-utilities.json` (`skills/delivery/resolve-pr-reviews/SKILL.md:18-24`).

The live collection contains 43 canonical skills: 36 published non-worker skills and 7 worker skills. Adding one top-level non-worker skill changes those inventories to 44, 37, and 7 respectively.

### Key Discoveries:

- `scripts/lib/layout.mjs:1-50` already discovers both top-level standalone skills and one-level grouped skills. `/setup-repository` needs no installer discovery change.
- `scripts/validate.mjs:19` fixes the canonical inventory at 43. `scripts/validate.mjs:35-94` also requires every `*answer.md` file in a declared answer inventory.
- `scripts/sync-plugin.mjs:27-39` derives plugin skills from every non-worker canonical skill. `.claude-plugin/plugin.json:21-58` currently lists 36 skills, so running the generator after adding `/setup-repository` must produce 37 entries without editing plugin ownership logic.
- `tests/install.test.mjs:101-116` proves selected skills install independently across all five targets and preserve foreign files. The new skill should follow that pattern and assert its references are copied.
- `evals/run.mjs:163-220` assumes every phase writes one task artifact, commits it, prints a handoff fence, leaves the repository clean, and changes nothing outside `.agents/`. A terminal skill that intentionally writes `ai-utilities.json` cannot be graded until the runner gains an explicit terminal phase type.
- `evals/run.mjs:239-289` runs several phases in one temporary repository, which can prove first-run then rerun behavior. It does not currently record repository snapshots, overlay a fixture before a later phase, or configure declarative Git remotes.
- `docs/testing.md:59-73` separates live OMP evals from credential-free offline checks. Provider behavior therefore remains an offline contract in this release, not claimed live evidence.
- `skills/show-me/SKILL.md:1-6` is the current top-level standalone skill pattern. Its terminal answer is registered at `scripts/validate.mjs:86` and contains no next-skill fence.
- `package.json:18-28` makes `npm test` the aggregate validation, plugin-sync, and Node-test command. New offline tests must join `node --test tests/` rather than add another package script.
- `README.md` and `docs/cheatsheet.md:101-105` currently describe canonical source as delivery skills plus `skills/show-me/`; both need the new standalone path.

## Desired End State

- `/setup-repository` creates minimal schema-v1 local metadata when `ai-utilities.json` is absent, reports unresolved user choices, and performs no network or provider CLI calls.
- An identical `reconcile` rerun leaves the file byte-for-byte unchanged and reports an empty changed-path set plus zero external operations.
- Supported migrations change only `onboarding`; `vcs`, `ticketing`, unknown top-level fields, and their values remain intact.
- Invalid JSON, invalid owned-state types, and `onboarding.schemaVersion > 1` stop before every write.
- `reset-managed` rebuilds only safely owned local state. It never erases unverified provider ownership, adopts resources by name, changes user choices, or bypasses unsupported-provider results.
- Offline provider fixtures define `create`, `update`, `no-op`, `conflict`, and `unsupported` outcomes without a generic label object or `upsertLabel` operation.
- Runtime builds, installer selection, validation, plugin inventory, docs, changeset, offline tests, and three live skill evals include the standalone skill.

## What We're NOT Doing

- No edits to `scripts/install.mjs`, `workflows/delivery.md`, `atomic/workflows/delivery.ts`, delivery phase tables, or installer ownership behavior.
- No Linear, Jira, GitHub Issues, `gh`, `glab`, HTTP, or provider SDK mutation.
- No provider-neutral label schema, generic label upsert, name-only adoption, or deletion of foreign resources.
- No credentials, tokens, secret values, or authenticated-provider claims in `ai-utilities.json`, fixtures, receipts, or docs.
- No second metadata or lock file, task artifact, hidden receipt file, or automatic commit in the repository being onboarded.
- No expansion beyond schema version 1 and profile revision 1 in this release.

## Execution Strategy

Keep the outline dependency order unchanged: basic create/no-op, migration, safety/reset, then provider contract and aggregate release proof. Each phase extends one interface and runs its focused acceptance command before the next phase starts.

Tests lead implementation where the repository can execute them. Phase 1 first locks the eval runner's terminal-phase behavior with offline Node tests, then adds the skill and live basic scenario. Phases 2 and 3 add their live scenarios before changing reconciliation instructions. Phase 4 adds the provider contract fixture and its offline test before final documentation and aggregate checks.

The eval runner extension is a narrow adapter at the existing phase loop. Artifact phases keep their current defaults and checks. Terminal phases opt in with `phaseType: "terminal"`, declare exact allowed changed paths, produce no task artifact or handoff fence, keep `HEAD` unchanged, and retain before/after repository manifests for regrading.

No dependency edge is reordered or merged. Phase 1 supplies the terminal eval seam consumed by Phases 2 and 3; Phase 2 supplies migration behavior consumed by reset; Phase 3 supplies fail-closed local behavior consumed by the provider contract proof.

### Mechanical completion state

| Phase | Starts when | Completes when | Next state |
|---|---|---|---|
| 1 | No earlier phase | Every Phase 1 Automated Verification box is checked from a recorded pass | Phase 2 becomes first incomplete phase |
| 2 | Phase 1 complete | Every Phase 2 Automated Verification box is checked from a recorded pass | Phase 3 becomes first incomplete phase |
| 3 | Phase 2 complete | Every Phase 3 Automated Verification box is checked from a recorded pass | Phase 4 becomes first incomplete phase |
| 4 | Phase 3 complete | Every Phase 4 Automated Verification box is checked from a recorded pass | Implementation is complete and hands off to verification |

Only commands under `#### Automated Verification` use checkboxes. `/implement-plan` updates those boxes after observed green runs, then writes the phase receipt and advances mechanically.

---

## Phase 1: Installable first run and byte-stable rerun

**Depends on:** None.

### Goal

Create the first usable `/setup-repository` slice, including the terminal eval seam, minimal metadata reconciliation, runtime inventory, installation proof, docs, and release metadata. A first run writes one allowed file; the second run changes nothing.

### Required Edits:

#### 1.1 Lock terminal eval behavior before changing the runner

**Files**:
- `tests/evals-terminal-phase.test.mjs` (new)
- `evals/lib.mjs`
- `evals/run.mjs`

**Changes**:

1. Add offline tests for repository snapshot comparison before implementing the runner branch. Cover file creation, byte changes, deletion, no-op comparison, excluded harness paths, exact allowlists, and terminal answers containing no command fence.
2. Export three small pure helpers from `evals/lib.mjs`:
   - `snapshotRepository(root)` returns a path-keyed manifest with base64 bytes and SHA-256 digests, excluding `.git/`, `.agents/`, and `.omp/`.
   - `diffRepositorySnapshots(before, after)` returns sorted created, modified, deleted, and combined changed paths.
   - `unexpectedRepositoryChanges(changedPaths, allowedChangedPaths)` returns paths not declared by the terminal phase.
3. Extend `phasePrompt()` in `evals/run.mjs` so `phaseType: "terminal"` tells OMP to run the installed skill in the current repository and print its terminal answer. It must not instruct the skill to create a task artifact.
4. Split `commonChecks()` into its unchanged artifact behavior and a terminal branch. A terminal phase requires:
   - no new or modified task artifact;
   - no fenced `/<skill>` handoff;
   - unchanged Git `HEAD`;
   - changed repository paths contained by `allowedChangedPaths`;
   - no mutation under excluded harness paths.
5. In `runScenario()`, snapshot immediately before and after each terminal phase, save `repository-before.json` and `repository-after.json` beside `answer.md`, and pass `changedPaths`, `beforeRepository`, and `afterRepository` into the scenario check.
6. In `gradeScenario()`, reload those manifests so `--grade` can re-run terminal checks without the original temporary repository. Recordings missing terminal manifests are skipped with an explicit message rather than reported as passing.
7. Add two declarative setup inputs without changing existing scenarios:
   - scenario-level `gitRemotes: [{ name, url }]`, applied after Git initialization and before the fixture SHA;
   - phase-level `fixtureOverlay`, copied before that phase's before-snapshot, for later safety cases.
8. Keep omitted `phaseType` equivalent to the current artifact phase. Existing five scenarios must retain byte-identical prompt and grading behavior.

```js
{
  phaseType: "terminal",
  skill: "setup-repository",
  allowedChangedPaths: ["ai-utilities.json"],
  check: ({ answer, changedPaths, afterRepository }) => [
    // Scenario-specific behavior checks.
  ],
}
```

**Acceptance tests**:

- GIVEN an unchanged repository snapshot, WHEN snapshots are compared, THEN `changedPaths` is empty.
- GIVEN an allowed `ai-utilities.json` creation plus an unexpected `README.md` edit, WHEN terminal checks run, THEN the phase reports only `README.md` as unexpected.
- GIVEN an existing artifact scenario, WHEN the runner loads it without `phaseType`, THEN artifact, commit, handoff, and clean-tree checks remain active.

#### 1.2 Add the standalone reconciliation interface

**Files**:
- `skills/setup-repository/SKILL.md` (new)
- `skills/setup-repository/references/repository-metadata.md` (new)
- `skills/setup-repository/references/setup-receipt-template.md` (new)
- `skills/setup-repository/references/setup-final-answer.md` (new)

**Changes**:

1. Create a top-level skill with exact frontmatter keys `name` and `description`, followed by the required shared-guidance sentence on line 6. The description must identify explicit `/setup-repository` use; the skill stays outside the delivery workflow.
2. Define one ordered flow in `SKILL.md`:
   - resolve the current Git root and stop without writes outside a Git work tree;
   - parse exact mode `reconcile` or `reset-managed`, rejecting any other mode;
   - observe original `ai-utilities.json` bytes and local Git remote URLs;
   - validate JSON, owned-state types, supported schema, and absence of secret-shaped owned fields;
   - compute the complete local plan before mutation;
   - write atomically only when planned bytes differ;
   - reread and compare bytes with the plan;
   - render the terminal receipt and stop without a next-skill fence.
3. State the local-only guard in the skill body: no network requests, provider CLIs, provider SDKs, credential lookup, remote resource discovery, or provider mutation.
4. Make `repository-metadata.md` the single source of truth for ownership and serialization:
   - `vcs` and `ticketing` are user-owned and preserved when present;
   - `onboarding` is skill-owned;
   - unknown top-level keys are preserved;
   - schema version and applied revision are integers;
   - output uses `JSON.stringify(document, null, 2) + "\n"` only after a semantic change;
   - no semantic change retains original bytes, including existing formatting.
5. Limit first-run inference:
   - seed `vcs.platform: "github"` only when all configured supported Git remotes identify GitHub unambiguously;
   - never infer `ticketing.tool` from a GitHub remote alone;
   - report every absent user-owned choice as unresolved instead of asking during the run or guessing.
6. Define the minimal first-run shape. Omit unresolved `vcs` or `ticketing` objects rather than writing null or placeholder values.

```json
{
  "vcs": { "platform": "github" },
  "onboarding": {
    "schemaVersion": 1,
    "profile": "default",
    "appliedRevision": 1,
    "providers": {}
  }
}
```

7. Make `setup-receipt-template.md` require mode, observed state, exact planned paths, written/skipped items, unresolved choices, conflicts, verification result, and `External operations: 0`.
8. Make `setup-final-answer.md` a terminal answer with no fenced block, fresh-session sentence, approval wording, or hidden artifact claim. The receipt is printed, not saved as a second repository file.

**Acceptance tests**:

- WHEN metadata is absent and one GitHub remote is configured, THEN the plan contains `vcs.platform: "github"`, schema-v1 onboarding state, and no `ticketing` object.
- WHEN no supported remote is unambiguous, THEN onboarding state is still created and provider choices are reported unresolved.
- WHEN the planned document equals the observed document, THEN no write occurs and verification reports unchanged bytes.
- IF validation fails before planning completes, THEN no temporary or final metadata file remains.

#### 1.3 Add first-run and rerun live evidence

**Files**:
- `evals/scenarios/setup-repository-basic.mjs` (new)
- `evals/fixtures/setup-repository-basic/README.md` (new)

**Changes**:

1. Configure the scenario with `gitRemotes: [{ name: "origin", url: "https://github.com/acme/setup-repository-fixture.git" }]` so GitHub detection uses real local repository configuration.
2. Run two terminal phases against the same temporary repository:
   - first phase allows only `ai-utilities.json` and checks exact parsed metadata, unresolved `ticketing.tool`, terminal receipt fields, and zero external operations;
   - second phase allows no changed path and checks the before/after bytes for `ai-utilities.json` are identical.
3. Keep the expected JSON object inside the scenario grader, not in the copied fixture, so the model cannot satisfy the check by copying an expected-output file.
4. Verify both phase answers omit handoff fences and neither phase changes `HEAD`, task artifacts, README, Git configuration, or unrelated fixture files.

#### 1.4 Synchronize validation, installation, and plugin inventory

**Files**:
- `scripts/validate.mjs`
- `tests/install.test.mjs`
- `.claude-plugin/plugin.json` (generated by `npm run sync-plugin`)

**Changes**:

1. Change `EXPECTED_SKILL_COUNT` from 43 to 44.
2. Add `setup-repository/references/setup-final-answer.md` to `ANSWER_INVENTORY` with `TERMINAL_ANSWER`. Do not add it to `FENCE_ARTIFACT` or the delivery phase tables.
3. Add an install test using `skillNames: ["setup-repository"]`. Across `claude-code`, `codex`, `oh-my-pi`, `pi`, and `portable`, assert `SKILL.md` and all three references are copied, foreign sibling state survives, Atomic is absent, and uninstall removes only `setup-repository`.
4. Run `npm run sync-plugin` after the canonical skill exists. The generated inventory must report 37 plugin skills and 7 agents; no hand edit to sync logic is allowed.

#### 1.5 Publish discovery and release metadata

**Files**:
- `README.md`
- `docs/getting-started.md`
- `docs/cheatsheet.md`
- `docs/testing.md`
- `.changeset/setup-repository.md` (new)

**Changes**:

1. Add a short standalone setup section to `README.md` with `/setup-repository` and explicit `/setup-repository reset-managed` invocations. State that it manages local metadata and does not install skills or mutate providers.
2. Add an optional pre-task setup step to `docs/getting-started.md`. Keep manual delivery phases valid without it.
3. Add both commands and `skills/setup-repository/` to `docs/cheatsheet.md`; preserve existing install and workflow guidance.
4. Document the terminal eval contract in `docs/testing.md`: live OMP requirement, allowed-path manifests, same-repository reruns, regrading snapshots, and separation from provider evidence.
5. Add a minor changeset for `@marktripoli/skills` describing the new local repository-onboarding skill.

```markdown
---
"@marktripoli/skills": minor
---

Add `/setup-repository` for idempotent local repository metadata setup and managed resets.
```

### Commit Boundaries:

1. `test(evals): support terminal repository phases`
   - `tests/evals-terminal-phase.test.mjs`
   - `evals/lib.mjs`
   - `evals/run.mjs`
2. `feat(setup-repository): add local metadata reconciliation`
   - `skills/setup-repository/**`
   - `evals/scenarios/setup-repository-basic.mjs`
   - `evals/fixtures/setup-repository-basic/**`
   - `scripts/validate.mjs`
   - `tests/install.test.mjs`
   - `.claude-plugin/plugin.json`
3. `docs(setup-repository): document repository onboarding`
   - `README.md`
   - `docs/getting-started.md`
   - `docs/cheatsheet.md`
   - `docs/testing.md`
   - `.changeset/setup-repository.md`

### Success Criteria:

#### Automated Verification:

- [ ] `node --test tests/evals-terminal-phase.test.mjs`
- [ ] `node --test tests/install.test.mjs`
- [ ] `node scripts/validate.mjs`
- [ ] `node scripts/sync-plugin.mjs --check`
- [ ] `npm run evals -- setup-repository-basic --keep`

human-gated: false

---

## Phase 2: Owned-subtree migration with foreign-state preservation

**Depends on:** Phase 1.

### Goal

Migrate supported older onboarding state and profile revisions while preserving every user-owned and unknown top-level value. A second reconciliation after migration must be byte-stable.

### Required Edits:

#### 2.1 Add migration acceptance first

**Files**:
- `evals/scenarios/setup-repository-migration.mjs` (new)
- `evals/fixtures/setup-repository-migration/ai-utilities.json` (new)

**Changes**:

1. Start with a fixture containing:
   - user-owned `vcs` and `ticketing` values;
   - nested unknown top-level data;
   - `onboarding.schemaVersion: 0` and `appliedRevision: 0`;
   - an obsolete owned field that schema 1 removes.
2. Run one terminal migration phase allowing only `ai-utilities.json`, then an identical terminal rerun allowing no changed path.
3. In the scenario grader, compare parsed top-level non-onboarding values to their pre-run values and compare the complete onboarding subtree to the schema-v1 target.
4. Compare second-run bytes to first-run output bytes. Require zero external operations in both receipts.

```json
{
  "vcs": { "platform": "github" },
  "ticketing": { "tool": "linear" },
  "custom": { "nested": { "keep": true } },
  "onboarding": {
    "schemaVersion": 0,
    "appliedRevision": 0,
    "legacyProfile": "default"
  }
}
```

#### 2.2 Implement the owned migration table

**Files**:
- `skills/setup-repository/SKILL.md`
- `skills/setup-repository/references/repository-metadata.md`
- `skills/setup-repository/references/setup-receipt-template.md`

**Changes**:

1. Add an ordered migration table to `repository-metadata.md`:
   - absent `onboarding` initializes schema 1;
   - exact schema 0 transforms to schema 1;
   - schema 1 with `appliedRevision < 1` fills current owned defaults and advances to revision 1;
   - schema 1 at revision 1 is current;
   - missing, non-integer, negative, or greater-than-1 versions inside an existing onboarding object are conflicts.
2. Build migrations from the parsed top-level document and assign only the replacement `onboarding` value. Do not reconstruct, normalize, sort, or default `vcs`, `ticketing`, or unknown top-level keys.
3. Replace the owned subtree with this exact current shape when no provider records exist:

```json
{
  "schemaVersion": 1,
  "profile": "default",
  "appliedRevision": 1,
  "providers": {}
}
```

4. If current schema-1 provider ownership records already exist, preserve them byte-equivalently in the planned object. Migration cannot adopt, remove, or rewrite provider identities.
5. Include old version, new version, changed owned fields, preserved user fields, and verification bytes in the receipt.
6. Keep the no-diff rule before serialization. Current valid metadata must not be reformatted merely because the skill ran.

**Acceptance tests**:

- WHEN schema 0 is observed, THEN only `onboarding` changes to schema 1 and applied revision 1.
- WHEN user-owned and unknown top-level objects exist, THEN deep equality against their pre-run values holds after migration.
- WHEN schema 1 has a lower supported applied revision, THEN the owned subtree advances once and the next run is unchanged.
- IF an existing onboarding object has no valid schema version, THEN migration stops before writing.

### Commit Boundaries:

1. `feat(setup-repository): migrate managed metadata`
   - migration scenario and fixture
   - `SKILL.md` and metadata/receipt references

### Success Criteria:

#### Automated Verification:

- [ ] `node scripts/validate.mjs`
- [ ] `npm run evals -- setup-repository-migration --keep`

human-gated: false

---

## Phase 3: Fail closed and reset only proven local ownership

**Depends on:** Phase 2.

### Goal

Stop every unsafe local write, make `reset-managed` explicit and scoped, and preserve provider ownership records when no adapter can verify or reapply them.

### Required Edits:

#### 3.1 Add the safety matrix before changing reconciliation

**Files**:
- `evals/scenarios/setup-repository-safety.mjs` (new)
- `evals/fixtures/setup-repository-safety/invalid-json/ai-utilities.json` (new)
- `evals/fixtures/setup-repository-safety/newer-schema/ai-utilities.json` (new)
- `evals/fixtures/setup-repository-safety/reset-managed/ai-utilities.json` (new)
- `evals/fixtures/setup-repository-safety/provider-state/ai-utilities.json` (new)

**Changes**:

1. Use Phase 1's `fixtureOverlay` support to run independent cases in one scenario. Apply each overlay before the phase's before-snapshot.
2. Invalid JSON: run `reconcile`, allow no changed path, and require an exact parse conflict plus unchanged original bytes.
3. Newer schema: run `reconcile`, allow no changed path, and require `supported: 1, observed: 2` plus unchanged bytes.
4. Provider state without an installed adapter: run both modes with no provider operation. Require preserved stable IDs and digests, `unsupported` provider status, and no name-based adoption.
5. Reset-managed: allow only `ai-utilities.json`, require top-level `vcs`, `ticketing`, and unknown values to remain deep-equal, and require the local owned fields to return to schema 1, profile `default`, and revision 1.
6. Run a final `reset-managed` rerun with no allowed changed path to prove stable reset output.

#### 3.2 Implement fail-closed validation and reset

**Files**:
- `skills/setup-repository/SKILL.md`
- `skills/setup-repository/references/repository-metadata.md`
- `skills/setup-repository/references/setup-receipt-template.md`
- `skills/setup-repository/references/setup-final-answer.md`

**Changes**:

1. Validate the full owned subtree before planning:
   - `onboarding` must be an object;
   - `schemaVersion` and `appliedRevision` must be supported integers;
   - `profile` must be `default` in version 1;
   - `providers` must be an object;
   - owned state must not contain keys matching token, secret, password, private-key, API-key, or access-key forms.
2. Return a conflict receipt with the JSON path, observed type/value class, supported expectation, and `Written: none`. Do not include secret values in the receipt.
3. Define `reset-managed` as a stronger local plan, not broader authority:
   - reset `schemaVersion`, `profile`, and `appliedRevision` to current values;
   - preserve user-owned and unknown top-level fields;
   - preserve any existing provider ownership record when no provider adapter can validate its stable identity;
   - report preserved provider records as partial/unsupported;
   - never delete the whole metadata file or replace the entire top-level object.
4. Reject mode aliases, inferred reset intent, and automatic reset after validation failure. Only the exact `reset-managed` argument selects reset behavior.
5. Keep provider safety rules in the metadata reference for future adapters:
   - name match without recorded stable ID is foreign and conflicts;
   - digest mismatch at a recorded stable ID is drift and conflicts in `reconcile`;
   - explicit reset may reapply only that recorded identity after an adapter observes it;
   - this release has no adapter, so it records `unsupported` and performs zero remote operations.
6. Make blocked and reset receipts include one inline rerun command when safe. Keep the terminal answer free of a next-skill fence.

```text
invalid JSON or unsupported schema
  -> conflict -> zero local writes -> zero external operations

provider ownership present, adapter absent
  -> unsupported -> preserve ownership record -> zero external operations

reset-managed
  -> rebuild verified local owned fields -> preserve user fields and unverifiable provider records
```

**Acceptance tests**:

- IF JSON is invalid, THEN the exact original bytes remain and no temporary file survives.
- IF `schemaVersion` is newer than 1, THEN the receipt names both versions and no write occurs in either mode.
- WHEN provider records exist without an adapter, THEN both modes preserve stable IDs and last-applied digests and report zero external operations.
- WHEN `reset-managed` is explicit, THEN only verified local owned fields change and a second reset is byte-stable.

### Commit Boundaries:

1. `feat(setup-repository): fail closed on unsafe metadata`
   - safety scenario and fixture overlays
   - skill and safety/receipt references

### Success Criteria:

#### Automated Verification:

- [ ] `node scripts/validate.mjs`
- [ ] `npm run evals -- setup-repository-safety --keep`

human-gated: false

---

## Phase 4: Freeze the provider seam and prove release readiness

**Depends on:** Phase 3.

### Goal

Define provider-specific future adapter outcomes without implementing an adapter, prove foreign-name and drift rules offline, and run the complete repository, runtime, inventory, and live-eval checks.

### Required Edits:

#### 4.1 Add the provider contract test before finalizing the reference

**Files**:
- `tests/setup-repository-contract.test.mjs` (new)
- `tests/fixtures/setup-repository/provider-outcomes.json` (new)

**Changes**:

1. Add provider-specific fixture cases whose shared fields stop at `provider`, `case`, `mode`, `priorOwnedState`, `observedIdentity`, `observedDigest`, `expectedCategory`, and `expectedOwnedState`.
2. Include at least these cases:
   - create with no prior identity and no foreign match;
   - update by recorded stable identity with matching last-applied digest;
   - no-op by recorded identity and equal digest;
   - conflict for a matching name without a recorded stable ID;
   - conflict for drift in `reconcile` when observed digest differs from `lastAppliedDigest`;
   - update for the same drift in explicit `reset-managed` by recorded identity;
   - unsupported Jira provisioning with no new ownership state.
3. Validate every case has exactly one category from `create`, `update`, `no-op`, `conflict`, or `unsupported`.
4. Validate new ownership records contain `logicalKey`, `stableId`, and `lastAppliedDigest` only after an owned create/update result. A no-op may retain prior ownership; conflict and unsupported cases cannot create ownership.
5. Recursively reject fixture keys named `upsertLabel`, generic provider-neutral label objects, endpoint URLs, tokens, secrets, passwords, or credentials.
6. Read `repository-metadata.md` in the test and assert it documents the five categories, stable-identity rule, drift rule, and no-adapter first-release limit.

#### 4.2 Finalize the provider-specific seam

**Files**:
- `skills/setup-repository/references/repository-metadata.md`
- `docs/testing.md`

**Changes**:

1. Document behavior, not a shared code interface, because this release has zero adapters and therefore no proven second implementation.
2. Keep the future flow provider-specific behind shared result categories:

```text
observe(context, priorOwnedState) -> providerSnapshot
plan(snapshot, priorOwnedState, profileRevision, mode)
  -> create | update | no-op | conflict | unsupported
apply(plan)
  -> operations + { logicalKey, stableId, lastAppliedDigest }
```

3. State that GitHub may own repository label resources, Linear may own team/workspace resources, and Jira may return `unsupported`. Do not define one desired label shape.
4. Add the final command inventory and evidence limits to `docs/testing.md`. Offline fixtures prove classification and ownership shape only; authenticated behavior requires a later provider adapter and separate evidence.

#### 4.3 Run aggregate inventory and portability proof

**Files**: No new files. Fix only failures caused by planned files; stop and report unrelated failures.

**Changes**:

1. Run the contract test before the aggregate suite.
2. Run `npm test`, which covers validation, plugin sync, and every offline Node test.
3. Build the portable runtime into `dist/portable` and validate that generated tree against the 44-skill canonical inventory.
4. Run all three setup scenarios in one command. Retain recordings with `--keep`.
5. Run an explicit inventory assertion for 44 canonical skills, 7 workers, and 37 plugin skills.
6. Confirm the diff contains no changes to installer ownership, workflow docs, Atomic source, delivery phase tables, or provider clients.

```sh
node --input-type=module -e '
  import fs from "node:fs";
  import { scanSkills } from "./scripts/lib/layout.mjs";
  const skills = scanSkills("./skills").skills;
  const plugin = JSON.parse(fs.readFileSync("./.claude-plugin/plugin.json", "utf8"));
  if (skills.length !== 44) throw new Error(`canonical skills: ${skills.length}`);
  if (skills.filter(({ name }) => name.startsWith("agent-")).length !== 7) throw new Error("worker inventory changed");
  if (plugin.skills.length !== 37) throw new Error(`plugin skills: ${plugin.skills.length}`);
'
```

### Commit Boundaries:

1. `test(setup-repository): lock provider outcome contract`
   - provider fixture
   - contract test
   - provider seam reference
2. `docs(testing): record repository setup evidence limits`
   - final `docs/testing.md` command inventory and provider-evidence limits, if not already complete in Phase 1

### Success Criteria:

#### Automated Verification:

- [ ] `node --test tests/setup-repository-contract.test.mjs`
- [ ] `npm test`
- [ ] `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`
- [ ] `npm run evals -- setup-repository-basic setup-repository-migration setup-repository-safety --keep`
- [ ] `node --input-type=module -e 'import fs from "node:fs"; import { scanSkills } from "./scripts/lib/layout.mjs"; const skills = scanSkills("./skills").skills; const plugin = JSON.parse(fs.readFileSync("./.claude-plugin/plugin.json", "utf8")); if (skills.length !== 44 || skills.filter(({ name }) => name.startsWith("agent-")).length !== 7 || plugin.skills.length !== 37) process.exit(1);'`

human-gated: false

#### Deferred human evidence (recorded, not a gate):

- Authenticated Linear, Jira, and GitHub Issues behavior remains unclaimed until a later provider-specific adapter records live evidence in that adapter's task artifacts.

---

## Human Review

### Review targets

- Phase order matches the approved outline: create/no-op, migration, safety/reset, then provider contract and aggregate proof.
- The eval runner extension is opt-in; existing artifact scenarios keep their current prompts and grading contract.
- `vcs`, `ticketing`, and unknown top-level fields remain user-owned; only `onboarding` is managed.
- No planned edit changes `scripts/install.mjs`, delivery orchestration, Atomic, provider APIs, or provider credentials.
- Commit boundaries keep runner infrastructure, the user-facing skill, docs/release metadata, migrations, safety, and provider contract independently reviewable.

### Verify

- [ ] Each phase has exact files, ordered edits, behavior acceptance tests, runnable commands, commit boundaries, and `human-gated: false`.
- [ ] The first unchecked Automated Verification box mechanically identifies the next implementation phase.
- [ ] Live inventory is reconciled from 43 to 44 canonical skills and from 36 to 37 plugin skills, with 7 workers unchanged.
- [ ] The plan accounts for the current eval runner's artifact-only contract before asking live evals to mutate `ai-utilities.json`.
- [ ] First-release scope remains local-only and claims no authenticated provider evidence.

### Known limits

- Live skill evals require OMP and a configured model; they are not part of credential-free `npm test`.
- Provider-contract fixtures prove classification and ownership shapes only, not authenticated Linear, Jira, or GitHub behavior.
- Deleting `ai-utilities.json` deletes recorded provider ownership. Matching remote names remain foreign until a separate adoption design is approved.
