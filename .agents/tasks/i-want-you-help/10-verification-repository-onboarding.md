---
task: i-want-you-help
type: verification
summary: "Independent verification reran all focused checks, aggregate repository gates, portable validation, inventory assertions, and nine live setup phases against revision 444d81a. Status is failed because the fresh basic rerun preserved valid bytes but falsely reported the top-level metadata value as null and conflicted; the basic scenario did not reject that false receipt. The next implementation phase must correct current-state observation/reporting and strengthen the rerun assertion before verification repeats."
status: failed
revision: 444d81a
target: origin/main
---

# Verification

## Run

- Revision: `444d81a` on `i-want-you-help`; clean tree before verification
- Target: `origin/main`; 38 files changed, 3 of them Node test files
- Checks from: `package.json` scripts and `.github/workflows/commits.yml`
- Coverage: 20 acceptance items; 20 claimed by implementation receipts, 0 claimed by none
- Graded by: typed-judgment helper; command rows used model `jev-1.13.0`, tokens 6124 in / 687 out; diff rows used model `jev-1.13.0`, tokens 4966 in / 502 out; helper `unclear` rows were decided by hand

## Items

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | Aggregate repository test. | `npm test` | Exits 0 with no failing test. | Exit 0; validation and plugin sync passed; 140 tests passed, 0 failed or skipped. | pass | 1.00 | 0 |
| C2 | Portable runtime build and generated validation. | `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable` | Exits 0 with a valid portable tree. | Exit 0; built 44 portable skills; generated validation reported 44 skills, 58 answer templates, and 0 banned tokens. | pass | 1.00 | 0 |
| C3 | Commit-subject CI check. | `node scripts/check-commits.mjs "$(git merge-base HEAD origin/main)..HEAD"` | Exits 0 for every branch commit. | Exit 0; `ok: 19 subjects`. | pass | 1.00 | 0 |
| T1 | `tests/evals-terminal-phase.test.mjs`. | `git diff origin/main...HEAD -- tests/evals-terminal-phase.test.mjs`, read in this session | The change keeps this check's strength. | Added four tests for snapshot changes, no-op/exclusions, allowlists, and terminal fence absence; no skips. | pass | 0.88 | 0 |
| T2 | `tests/install.test.mjs`. | `git diff origin/main...HEAD -- tests/install.test.mjs`, read in this session | The change keeps this check's strength. | Added five-target install/uninstall assertions with references, foreign-state preservation, and Atomic absence; existing tests unchanged. | pass | 0.90 | 0 |
| T3 | `tests/setup-repository-contract.test.mjs`. | `git diff origin/main...HEAD -- tests/setup-repository-contract.test.mjs`, read in this session | The change keeps this check's strength. | Added five tests for categories, ownership, drift/reset/Jira, forbidden keys, and documentation; no skips. | pass | 0.89 | 0 |
| T4 | `tests/fixtures/setup-repository/provider-outcomes.json`. | `git diff origin/main...HEAD -- tests/fixtures/setup-repository/provider-outcomes.json`, read in this session | The change keeps this check's strength. | Added seven bounded provider-specific cases spanning all five outcomes and required identity/drift paths. | pass | 0.84 | 0 |
| T5 | `evals/scenarios/setup-repository-basic.mjs`. | `git diff origin/main...HEAD -- evals/scenarios/setup-repository-basic.mjs`, read with fresh retained output | The basic scenario strongly proves a valid current-state rerun and exact receipt. | Rerun checks byte equality/no-write but not current state or conflict absence; false top-level-null conflict passed in fresh phase 2. | fail | 0.14 | 2 |
| T6 | `evals/fixtures/setup-repository-basic/README.md`. | `git diff origin/main...HEAD -- evals/fixtures/setup-repository-basic/README.md`, read in this session | The change keeps this check's strength. | Fixture supplies repository context without expected output that the model could copy. | pass | hand | 0 |
| T7 | `evals/scenarios/setup-repository-migration.mjs`. | `git diff origin/main...HEAD -- evals/scenarios/setup-repository-migration.mjs`, read in this session | The change keeps this check's strength. | Asserts only-metadata change, deep foreign-state equality, exact onboarding target, receipt details, zero operations, and byte-stable rerun. | pass | 0.82 | 0 |
| T8 | `evals/fixtures/setup-repository-migration/ai-utilities.json`. | `git diff origin/main...HEAD -- evals/fixtures/setup-repository-migration/ai-utilities.json`, read in this session | The change keeps this check's strength. | Fixture carries user choices, nested unknown state, schema 0/revision 0, and an obsolete owned field. | pass | 0.80 | 0 |
| T9 | `evals/scenarios/setup-repository-safety.mjs`. | `git diff origin/main...HEAD -- evals/scenarios/setup-repository-safety.mjs`, read in this session | The change keeps this check's strength. | Five phases assert invalid/newer no-write, redaction, provider identity preservation, exact reset scope, reset idempotency, and zero operations. | pass | hand | 0 |
| T10 | Invalid-JSON safety fixture. | `git diff origin/main...HEAD -- evals/fixtures/setup-repository-safety/invalid-json/ai-utilities.json`, read in this session | The change keeps this check's strength. | Intentionally malformed input includes a secret-shaped value for byte-preservation and redaction assertions. | pass | hand | 0 |
| T11 | Newer-schema safety fixture. | `git diff origin/main...HEAD -- evals/fixtures/setup-repository-safety/newer-schema/ai-utilities.json`, read in this session | The change keeps this check's strength. | Supplies schema 2 plus foreign `vcs` and custom state for no-write/version-report checks. | pass | hand | 0 |
| T12 | Provider-state safety fixture. | `git diff origin/main...HEAD -- evals/fixtures/setup-repository-safety/provider-state/ai-utilities.json`, read in this session | The change keeps this check's strength. | Supplies current schema, stable ID, and digest for unsupported-adapter preservation checks. | pass | hand | 0 |
| T13 | Reset-managed safety fixture. | `git diff origin/main...HEAD -- evals/fixtures/setup-repository-safety/reset-managed/ai-utilities.json`, read in this session | The change keeps this check's strength. | Supplies user, unknown, old managed, obsolete, and provider-owned state for scoped reset and rerun checks. | pass | hand | 0 |
| T14 | `scripts/validate.mjs`. | `git diff origin/main...HEAD -- scripts/validate.mjs`, read in this session | The change keeps this check's strength. | Raises inventory to 44 and registers the terminal answer; existing validation remains active and passed. | pass | hand | 0 |
| A1 | First run creates minimal local metadata (`03-design-discussion-repository-onboarding.md:21-27`; `05-plan-repository-onboarding.md:39`; claimed: yes). | `npm run evals -- setup-repository-basic --keep`; retained `evals/results/20260920-092154/setup-repository-basic/1-setup-repository/` | Infer only unambiguous GitHub, omit unresolved ticketing, change only metadata, and perform zero external operations. | Phase 1 passed; receipt reported absent state, GitHub inference, unresolved `ticketing.tool`, only metadata written, exact bytes, and zero operations. | pass | 0.93 | 0 |
| A2 | Identical rerun is a valid current-state no-op with an exact receipt (`03-design-discussion-repository-onboarding.md:23-24,79-91`; `05-plan-repository-onboarding.md:40`; claimed: yes). | Fresh basic phase 2 answer plus before/after manifests at `evals/results/20260920-092154/setup-repository-basic/2-setup-repository/` | Preserve valid metadata bytes, change no path, perform zero operations, and accurately report current state with no conflict. | SHA-256 stayed `fc64728d...8bca` and no path changed, but receipt printed `Observed state: conflict`, `observed null`, and expected object for the valid 163-byte object. | fail | 1.00 | 2 |
| A3 | Migration changes only managed subtree and stabilizes (`03-design-discussion-repository-onboarding.md:25,73-76`; `05-plan-repository-onboarding.md:41`; claimed: yes). | `npm run evals -- setup-repository-migration --keep`; retained `evals/results/20260920-092154/setup-repository-migration/` | Preserve complete user/unknown values, migrate owned state once, then no-op byte-for-byte. | Both phases passed; schema 0 became 1, `vcs`/`ticketing`/`custom` remained equal, and rerun retained all 380 bytes. | pass | 0.86 | 0 |
| A4 | Invalid JSON fails closed (`03-design-discussion-repository-onboarding.md:76`; `05-plan-repository-onboarding.md:42`; claimed: yes). | Fresh safety phase 1 at `evals/results/20260920-092154/setup-repository-safety/1-setup-repository/` | Exact parse conflict, no write/temp file, unchanged bytes, redacted secret, zero operations. | Phase passed with invalid-JSON conflict, `Written: none`, unchanged bytes, no temporary file, secret exclusion, and zero operations. | pass | 0.89 | 0 |
| A5 | Newer schema fails closed (`03-design-discussion-repository-onboarding.md:76,84-87`; `05-plan-repository-onboarding.md:42`; claimed: yes). | Fresh safety phase 2 at `evals/results/20260920-092154/setup-repository-safety/2-setup-repository/` | Report supported 1/observed 2, write nothing in either mode, preserve bytes, zero operations. | Phase passed with both versions, no write, unchanged bytes, no downgrade path, and zero operations. | pass | 0.85 | 0 |
| A6 | Unavailable provider preserves ownership and reports partial/unsupported (`03-design-discussion-repository-onboarding.md:26,87-90`; claimed: yes). | Fresh safety phases 3-5 | Preserve stable IDs/digests, never adopt by name, report unsupported/partial, zero operations. | All phases passed with recorded identities/digests unchanged and unsupported/partial receipts. | pass | 0.89 | 0 |
| A7 | Explicit reset is scoped and idempotent (`03-design-discussion-repository-onboarding.md:154-161`; `05-plan-repository-onboarding.md:43`; claimed: yes). | Fresh safety phases 4-5 | Change only verified local onboarding fields; preserve user, unknown, and provider state; repeated reset byte-stable. | First reset preserved foreign/provider state; second changed no path and reported identical 585-byte output. | pass | 0.86 | 0 |
| A8 | Provider seam covers exact outcomes and ownership rules (`03-design-discussion-repository-onboarding.md:93-106`; `05-plan-repository-onboarding.md:44`; claimed: yes). | `node --test tests/setup-repository-contract.test.mjs` | Exactly five categories; stable ownership only for applied outcomes; foreign name/drift/reset/Jira rules hold. | Exit 0; 5 tests passed and named every required contract boundary. | pass | 0.87 | 0 |
| A9 | Release is local-only without generic/network/provider implementation (`03-design-discussion-repository-onboarding.md:29-36`; `05-plan-repository-onboarding.md:47-54`; claimed: yes). | Contract tests plus target product diff inspection | No network/provider CLI/SDK/credential/mutation or generic label-upsert implementation. | Forbidden-key/no-adapter tests passed; diff inspection found no provider client or network implementation. | pass | 0.86 | 0 |
| A10 | Selected installation works across supported runtimes (`04-structure-outline-repository-onboarding.md:20`; `05-plan-repository-onboarding.md:205-217`; claimed: yes). | `node --test tests/install.test.mjs` | Copy skill and references in five targets, preserve foreign state, omit Atomic, uninstall only skill. | Exit 0; 14 tests passed including the five-target setup-repository test. | pass | hand | 0 |
| A11 | Canonical/runtime/plugin inventory is 44/7/37 (`05-plan-repository-onboarding.md:22,45,531-543`; claimed: yes). | Validation, plugin check, and explicit inventory assertion | 44 canonical skills, 7 workers, 37 plugin skills. | Commands printed `44`, `7`, and `37`; explicit assertion exited 0. | pass | hand | 0 |
| A12 | Portable generated runtime validates (`05-plan-repository-onboarding.md:45,529`; claimed: yes). | Exact portable build command | Build and generated validation exit 0 against canonical inventory. | Built 44 portable skills; generated validation passed. | pass | 0.91 | 0 |
| A13 | Terminal eval adapter retains evidence and preserves artifact defaults (`05-plan-repository-onboarding.md:62,89-125`; claimed: yes). | Terminal helper tests, diff inspection, and retained live manifests | Exact allowlists, manifests, unchanged HEAD/task state, no fence, overlays/remotes, unchanged artifact defaults. | Helper tests passed; all 9 terminal phases retained manifests and reported no runner problems; omitted `phaseType` retains artifact branch. | pass | 0.92 | 0 |
| A14 | Docs and changeset publish the standalone optional skill (`04-structure-outline-repository-onboarding.md:20`; `05-plan-repository-onboarding.md:219-242`; claimed: yes). | Documentation and changeset diff inspection | Both commands, local-only/optional boundary, evidence limits, canonical path, and minor changeset exist. | All named docs contain required guidance and `.changeset/setup-repository.md` is minor. | pass | hand | 0 |
| A15 | Forbidden ownership/orchestration files remain unchanged (`05-plan-repository-onboarding.md:49,252,532`; claimed: yes). | `git diff --name-only origin/main...HEAD -- scripts/install.mjs workflows/delivery.md atomic/workflows/delivery.ts skills/delivery` | No installer ownership, delivery workflow, Atomic, phase-table, or provider-client changes. | Command returned no paths; full change list contains no provider client. | pass | hand | 0 |
| A16 | Semantic no-ops preserve original bytes (`03-design-discussion-repository-onboarding.md:91`; `05-plan-repository-onboarding.md:40-41`; claimed: yes). | Fresh basic/migration/reset manifests | Current valid metadata is not reformatted or rewritten. | Migration and reset reruns retained exact bytes; basic rerun also retained exact bytes despite its separately failed receipt classification. | pass | hand | 0 |
| A17 | Authenticated provider behavior remains unclaimed (`03-design-discussion-repository-onboarding.md:209-213`; `05-plan-repository-onboarding.md:567-569`; claimed: yes). | Artifact/docs/source observation | Offline/local evidence only; no authenticated provider claim. | Plan, receipt, provider reference, and testing docs state the limit; no authenticated command ran. | pass | hand | 0 |
| A18 | Onboarded repositories get no task artifact, hidden receipt, second metadata file, or commit (`05-plan-repository-onboarding.md:53,62`; claimed: yes). | Fresh aggregate live scenarios | HEAD/task state unchanged and only exact allowed paths mutate. | All 9 terminal phases passed these runner checks; retained reports contain no problems. | pass | hand | 0 |
| A19 | Unresolved choices are not guessed and secrets do not enter output (`03-design-discussion-repository-onboarding.md:73-77`; `05-plan-repository-onboarding.md:94,162-166`; claimed: yes). | Basic phase 1, safety phase 1, and contract test | Omit unresolved choices, redact secret values, reject secret-shaped contract keys. | Ticketing stayed absent/unresolved; secret fixture value was excluded from receipt; forbidden-key test passed. | pass | hand | 0 |
| A20 | Invalid owned types/version pairs and invalid modes fail before writes (`05-plan-repository-onboarding.md:42,145-153,327-355,411-430`; claimed: yes). | Skill/metadata contract observation plus `node scripts/validate.mjs` | Exact modes only; full owned-state validation and supported migration pairs; no pre-plan temp file. | Source contract states each rule and canonical validation passed; live invalid/newer branches also failed closed. | pass | hand | 0 |

Verdicts: `pass`, `fail`, or `untested` (nothing in this environment could decide it). Confidence is the helper's probability for the verdict, or `hand` when decided without it; deterministic verdicts (an exit code, an exact string) record `1.00`. Severity: 0 none, 1 cosmetic, 2 functional, 3 blocking.

## Findings

- A2: fresh basic phase 2; expected valid current metadata to produce an accurate no-conflict no-op receipt (`03-design-discussion-repository-onboarding.md:23-24,79-91`; `05-plan-repository-onboarding.md:40`); observed `Observed state: conflict`, `observed null`, and `expected a top-level JSON object` while retained before/after manifests contain the same valid 163-byte JSON object with SHA-256 `fc64728de01bbd3ea3b5f941c92e19f24e02881f5cb199d882d14d7cfc9a8bca`; severity 2.
- T5: `git diff origin/main...HEAD -- evals/scenarios/setup-repository-basic.mjs`; expected the live rerun scenario to reject an inaccurate current-state receipt; observed that it checks no-write/byte equality/zero operations but not `Observed state: current` or `Conflicts: none`, so the A2 defect passed the scenario; severity 2.

## Missing

None.

## Human Review

### Review targets

- The items table, especially failed A2 and T5.
- The retained phase-2 answer and manifests under `evals/results/20260920-092154/setup-repository-basic/2-setup-repository/`.
- The findings above.

### Verify

- [ ] Run `npm test`; it exits 0 with 140 passing tests and no failures or skips.
- [ ] Run `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`; it builds and validates 44 skills.
- [ ] Run `node scripts/check-commits.mjs "$(git merge-base HEAD origin/main)..HEAD"`; every branch subject passes.
- [ ] Re-decide A2: run the basic scenario and inspect phase 2; valid schema-1 metadata must report current/no conflict, preserve bytes, and perform zero operations.
- [ ] Re-decide T5: the basic phase-2 grader must fail a false validation conflict for valid metadata.
- [ ] Re-decide A10, A11, and A14-A20 from their commands or observations in the items table; the helper returned `unclear` and they were decided by hand.
- [ ] Re-decide T6 and T9-T14 from their diffs; the helper returned `unclear` and they were decided by hand.

### Known limits

- Typed judgment returned `unclear` for A10, A11, A14-A20, T6, and T9-T14; these rows were decided by hand from command output and inspected diffs.
- Authenticated Linear, Jira, GitHub Issues, and GitHub resource behavior remains outside this release and is not claimed.
- Live evals exercise an instruction-driven skill through a configured model. The fresh false-conflict receipt demonstrates that byte-level safety can pass while reported semantic state is wrong.
