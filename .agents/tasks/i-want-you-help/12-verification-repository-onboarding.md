---
task: i-want-you-help
type: verification
summary: "Independent verification reran focused regression and provider checks, aggregate repository gates, portable validation, commit validation, inventory assertions, and all nine live setup phases against revision 64ce4fc. Status is passed: A2 now reports current state with no conflict while preserving all 163 bytes and performing zero operations, and T5 rejects the retained false-null conflict shape. No acceptance item failed; authenticated provider behavior remains outside this local-only release and is not claimed."
status: passed
revision: 64ce4fc
target: origin/main
---

# Verification

## Run

- Revision: `64ce4fc` on `i-want-you-help`; clean tree before verification
- Target: `origin/main`; 40 files changed, 3 of them Node test files
- Checks from: `package.json` scripts and `.github/workflows/commits.yml`
- Coverage: 20 acceptance items; 20 claimed by implementation receipts, 0 claimed by none
- Graded by: typed-judgment helper; command rows used model `jev-1.13.0`, tokens 6586 in / 835 out; diff rows used model `jev-1.13.0`, tokens 4843 in / 502 out; helper `unclear` rows were decided by hand
- Supersedes: failed artifact `10-verification-repository-onboarding.md`

## Items

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | Aggregate repository test. | `npm test` | Exits 0 with no failing test. | Exit 0; validation and plugin sync passed; 141 tests passed, 0 failed or skipped. | pass | 1.00 | 0 |
| C2 | Portable runtime build and generated validation. | `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable` | Exits 0 with a valid portable tree. | Exit 0; built 44 portable skills; generated validation reported 44 skills, 58 answer templates, and 0 banned tokens. | pass | 1.00 | 0 |
| C3 | Commit-subject CI check. | `BASE=$(git merge-base HEAD origin/main) && node scripts/check-commits.mjs "$BASE..HEAD"` | Exits 0 for every branch commit. | Exit 0; `ok: 23 subjects`. | pass | 1.00 | 0 |
| T1 | `tests/evals-terminal-phase.test.mjs`. | `git diff origin/main...HEAD -- tests/evals-terminal-phase.test.mjs`, read in this session | The change keeps terminal helper and regression checks strong. | Five tests cover snapshots, exclusions, allowlists, fence absence, and the retained false-null conflict shape; no skips. | pass | 0.85 | 0 |
| T2 | `tests/install.test.mjs`. | `git diff origin/main...HEAD -- tests/install.test.mjs`, read in this session | The change keeps installation checks strong. | Five-target install/uninstall assertions cover references, foreign-state preservation, Atomic absence, and selected-skill removal. | pass | 0.87 | 0 |
| T3 | `tests/setup-repository-contract.test.mjs`. | `git diff origin/main...HEAD -- tests/setup-repository-contract.test.mjs`, read in this session | The change keeps provider contract checks strong. | Five tests cover categories, ownership, drift/reset/Jira, forbidden keys, and documentation; no skips. | pass | 0.83 | 0 |
| T4 | `tests/fixtures/setup-repository/provider-outcomes.json`. | `git diff origin/main...HEAD -- tests/fixtures/setup-repository/provider-outcomes.json`, read in this session | The fixture keeps every required provider outcome. | Seven bounded cases span all five outcomes plus foreign-name, reconcile-drift, reset-drift, and Jira paths. | pass | hand | 0 |
| T5 | `evals/scenarios/setup-repository-basic.mjs`. | Diff inspection plus `node --test tests/evals-terminal-phase.test.mjs` | The basic scenario proves a valid current-state rerun and rejects the retained false-null conflict receipt. | Phase 2 now requires `Observed state: current` and `Conflicts: none`; the focused regression feeds the prior false receipt and confirms both assertions reject it. | pass | hand | 0 |
| T6 | `evals/fixtures/setup-repository-basic/README.md`. | `git diff origin/main...HEAD -- evals/fixtures/setup-repository-basic/README.md`, read in this session | The fixture keeps independent repository context without expected output. | README-only fixture describes absent metadata and local remote inference without embedding expected JSON. | pass | hand | 0 |
| T7 | `evals/scenarios/setup-repository-migration.mjs`. | `git diff origin/main...HEAD -- evals/scenarios/setup-repository-migration.mjs`, read in this session | The migration scenario keeps preservation and stability checks strong. | Two phases assert exact foreign-state preservation, exact managed target, receipt details, zero operations, and byte-stable rerun. | pass | hand | 0 |
| T8 | `evals/fixtures/setup-repository-migration/ai-utilities.json`. | `git diff origin/main...HEAD -- evals/fixtures/setup-repository-migration/ai-utilities.json`, read in this session | The fixture keeps representative foreign and obsolete managed state. | Fixture includes `vcs`, `ticketing`, nested unknown state, schema/revision 0, and obsolete `legacyProfile`. | pass | hand | 0 |
| T9 | `evals/scenarios/setup-repository-safety.mjs`. | `git diff origin/main...HEAD -- evals/scenarios/setup-repository-safety.mjs`, read in this session | The safety scenario keeps fail-closed and reset checks strong. | Five phases assert invalid/newer no-write, redaction, provider identity preservation, exact reset scope, reset idempotency, and zero operations. | pass | 0.83 | 0 |
| T10 | Invalid-JSON safety fixture. | `git diff origin/main...HEAD -- evals/fixtures/setup-repository-safety/invalid-json/ai-utilities.json`, read in this session | The fixture keeps byte-preservation and redaction coverage. | Intentionally malformed JSON includes a secret-shaped value used by unchanged-byte and output-redaction assertions. | pass | hand | 0 |
| T11 | Newer-schema safety fixture. | `git diff origin/main...HEAD -- evals/fixtures/setup-repository-safety/newer-schema/ai-utilities.json`, read in this session | The fixture keeps fail-closed version coverage. | Schema 2 plus foreign `vcs` and custom state drive supported-versus-observed and unchanged-byte assertions. | pass | hand | 0 |
| T12 | Provider-state safety fixture. | `git diff origin/main...HEAD -- evals/fixtures/setup-repository-safety/provider-state/ai-utilities.json`, read in this session | The fixture keeps unsupported-adapter preservation coverage. | Current schema, stable ID, and digest are asserted unchanged in fresh safety phase 3. | pass | hand | 0 |
| T13 | Reset-managed safety fixture. | `git diff origin/main...HEAD -- evals/fixtures/setup-repository-safety/reset-managed/ai-utilities.json`, read in this session | The fixture keeps scoped reset and idempotency coverage. | User, unknown, old managed, obsolete, and provider-owned state are asserted by fresh safety phases 4 and 5. | pass | hand | 0 |
| T14 | `scripts/validate.mjs`. | `git diff origin/main...HEAD -- scripts/validate.mjs`, read in this session | The inventory update keeps existing validation active. | Canonical inventory rises to 44 and only the terminal answer is registered; aggregate validation passed with 0 banned tokens. | pass | hand | 0 |
| A1 | First run creates minimal local metadata (`05-plan-repository-onboarding.md:39`; claimed: yes). | Fresh basic phase 1 under `evals/results/20260920-094724/` | Infer only unambiguous GitHub, omit unresolved ticketing, change only metadata, and perform zero external operations. | Phase passed; receipt reported absent state, GitHub inference, unresolved `ticketing.tool`, only metadata written, exact 163-byte verification, and zero operations. | pass | hand | 0 |
| A2 | Identical rerun is a valid current-state no-op (`05-plan-repository-onboarding.md:40`; claimed: yes). | Fresh basic phase 2 answer and manifests under `evals/results/20260920-094724/` | Preserve valid metadata bytes, change no path, perform zero operations, and accurately report current state with no conflict. | Phase passed with `Observed state: current`, `Conflicts: none`, `Written: none`, and `External operations: 0`; before/after SHA-256 matched for all 163 bytes. | pass | 0.88 | 0 |
| A3 | Migration changes only managed subtree and stabilizes (`05-plan-repository-onboarding.md:41`; claimed: yes). | Fresh migration scenario under `evals/results/20260920-094724/` | Preserve complete user/unknown values, migrate owned state once, then no-op byte-for-byte. | Both phases passed; schema/revision 0 became 1, foreign fields stayed intact, and rerun retained all 380 bytes. | pass | 0.84 | 0 |
| A4 | Invalid JSON fails closed (`05-plan-repository-onboarding.md:42`; claimed: yes). | Fresh safety phase 1 under `evals/results/20260920-094724/` | Exact parse conflict, no write/temp file, unchanged bytes, redacted secret, zero operations. | Phase passed with invalid-JSON conflict, `Written: none`, unchanged bytes, no temporary file, secret exclusion, and zero operations. | pass | 0.80 | 0 |
| A5 | Newer schema fails closed (`05-plan-repository-onboarding.md:42`; claimed: yes). | Fresh safety phase 2 under `evals/results/20260920-094724/` | Report supported 1/observed 2, write nothing, preserve bytes, and perform zero operations. | Phase passed with both versions, no write, unchanged bytes, no downgrade/reset path, and zero operations. | pass | 0.86 | 0 |
| A6 | Unavailable provider preserves ownership and reports unsupported (`05-plan-repository-onboarding.md:43`; claimed: yes). | Fresh safety phases 3-5 | Preserve stable IDs/digests, never adopt by name, report unsupported/partial, zero operations. | All phases passed with identities/digests unchanged, unsupported/partial receipts, and zero operations. | pass | 0.85 | 0 |
| A7 | Explicit reset is scoped and idempotent (`05-plan-repository-onboarding.md:43`; claimed: yes). | Fresh safety phases 4-5 | Change only verified local fields; preserve user, unknown, and provider state; repeated reset byte-stable. | First reset preserved foreign/provider state; second wrote nothing and retained the identical 585-byte SHA-256. | pass | hand | 0 |
| A8 | Provider seam covers exact outcomes and ownership rules (`05-plan-repository-onboarding.md:44`; claimed: yes). | `node --test tests/setup-repository-contract.test.mjs` | Exactly five categories; stable ownership and foreign-name/drift/reset/Jira rules hold. | Exit 0; 5 tests passed and covered every required boundary. | pass | 0.80 | 0 |
| A9 | Release is local-only without generic/network/provider implementation (`05-plan-repository-onboarding.md:47-54`; claimed: yes). | Contract tests plus target diff inspection | No network/provider CLI/SDK/credential/mutation or generic label-upsert implementation. | Forbidden-shape test passed; diff inspection found no provider client or network implementation. | pass | 0.89 | 0 |
| A10 | Selected installation works across supported runtimes (`05-plan-repository-onboarding.md:205-217`; claimed: yes). | `node --test tests/install.test.mjs` | Copy skill and references in five targets, preserve foreign state, omit Atomic, uninstall only skill. | Exit 0; 14 tests passed including all five setup-repository targets. | pass | 0.84 | 0 |
| A11 | Canonical/runtime/plugin inventory is 44/7/37 (`05-plan-repository-onboarding.md:531-543`; claimed: yes). | Exact inventory assertion | 44 canonical skills, 7 workers, 37 plugin skills. | Exit 0; printed `{"skills":44,"workers":7,"pluginSkills":37}`. | pass | 0.83 | 0 |
| A12 | Portable generated runtime validates (`05-plan-repository-onboarding.md:529`; claimed: yes). | Exact portable build command | Build and generated validation exit 0 against canonical inventory. | Built 44 portable skills; generated validation passed. | pass | 0.83 | 0 |
| A13 | Terminal eval adapter retains evidence and preserves artifact defaults (`05-plan-repository-onboarding.md:62,89-125`; claimed: yes). | Focused helper tests, diff inspection, and fresh manifests | Exact allowlists, manifests, unchanged HEAD/task state, no fence, overlays/remotes, unchanged artifact defaults. | Five focused tests and all 9 fresh terminal phases passed; retained reports contain no problems. | pass | hand | 0 |
| A14 | Docs and changeset publish the standalone optional skill (`05-plan-repository-onboarding.md:219-242`; claimed: yes). | Documentation and changeset diff inspection | Both commands, local-only/optional boundary, evidence limits, canonical path, and minor changeset exist. | README and named docs contain required guidance; `.changeset/setup-repository.md` declares a minor release. | pass | hand | 0 |
| A15 | Forbidden ownership/orchestration files remain unchanged (`05-plan-repository-onboarding.md:49,532`; claimed: yes). | Scoped `git diff --name-only origin/main...HEAD` | No installer ownership, delivery workflow, Atomic, phase-table, or provider-client changes. | Scoped diff returned no paths; full branch list contains no provider client. | pass | hand | 0 |
| A16 | Semantic no-ops preserve original bytes (`05-plan-repository-onboarding.md:40-41`; claimed: yes). | Fresh basic, migration, and reset manifests | Current valid metadata is not reformatted or rewritten. | All reruns passed; basic retained the same 163-byte hash, migration retained 380 bytes, and reset retained the same 585-byte hash. | pass | hand | 0 |
| A17 | Authenticated provider behavior remains unclaimed (`05-plan-repository-onboarding.md:567-569`; claimed: yes). | Artifact, docs, source, and command observation | Offline/local evidence only; no authenticated provider claim. | Plan, receipts, provider reference, and testing docs state the limit; no authenticated provider command ran. | pass | 0.83 | 0 |
| A18 | Onboarded repositories get no task artifact, hidden receipt, second metadata file, or commit (`05-plan-repository-onboarding.md:53,62`; claimed: yes). | Fresh aggregate live scenarios | HEAD/task state unchanged and only exact allowed paths mutate. | All 9 terminal phases passed runner checks with no problems. | pass | 0.84 | 0 |
| A19 | Unresolved choices are not guessed and secrets do not enter output (`05-plan-repository-onboarding.md:94,162-166`; claimed: yes). | Fresh basic phase 1, safety phase 1, and contract test | Omit unresolved choices, redact secret values, reject secret-shaped contract keys. | Ticketing remained absent/unresolved; invalid receipt omitted the fixture secret; forbidden-key test passed. | pass | hand | 0 |
| A20 | Invalid owned state and unsupported versions fail before writes while current valid state remains non-conflicting (`05-plan-repository-onboarding.md:42,145-153,327-355,411-430`; claimed: yes). | Focused regression, fresh invalid/newer/current phases, and source contract observation | Exact modes and full validation fail closed; valid current state reports no conflict. | Invalid/newer branches failed closed; focused false-conflict regression passed; fresh valid rerun reported current with no conflicts. | pass | 0.80 | 0 |

Verdicts: `pass`, `fail`, or `untested` (nothing in this environment could decide it). Confidence is the helper's probability for the verdict, or `hand` when decided without it; deterministic verdicts record `1.00`. Severity: 0 none, 1 cosmetic, 2 functional, 3 blocking.

## Findings

None.

## Missing

None.

## Human Review

### Review targets

- The items table, especially repaired A2 and T5.
- Fresh retained answers and manifests under `evals/results/20260920-094724/`.
- The no-failure findings and missing sections above.

### Verify

- [ ] Run `npm test`; it exits 0 with 141 passing tests and no failures or skips.
- [ ] Run `npm run build -- --runtime portable && node scripts/validate.mjs --root dist/portable`; it builds and validates 44 skills.
- [ ] Run `BASE=$(git merge-base HEAD origin/main) && node scripts/check-commits.mjs "$BASE..HEAD"`; every branch subject passes.
- [ ] Re-decide A1 from fresh basic phase 1; it writes only schema-1 metadata, leaves ticketing unresolved, and performs zero external operations.
- [ ] Re-decide A7 from fresh safety phases 4-5; reset preserves foreign/provider state and its rerun is byte-stable.
- [ ] Re-decide A13 from focused tests and fresh manifests; terminal behavior remains opt-in and artifact defaults remain active.
- [ ] Re-decide A14 from the documentation and changeset diff; commands, boundaries, canonical path, and minor release remain present.
- [ ] Re-decide A15 from the scoped diff; forbidden ownership and orchestration paths remain unchanged.
- [ ] Re-decide A16 from fresh manifests; all three semantic reruns preserve exact bytes.
- [ ] Re-decide A19 from fresh basic/safety receipts and contract tests; unresolved choices are not guessed and secrets are excluded.
- [ ] Re-decide T4 from the provider fixture diff; seven cases retain all five outcomes and required identity/drift paths.
- [ ] Re-decide T5 from the basic scenario diff and focused regression; the retained false-null receipt is rejected twice.
- [ ] Re-decide T6 from the basic fixture diff; it contains context but no expected output.
- [ ] Re-decide T7 from the migration scenario diff; exact preservation and rerun assertions remain active.
- [ ] Re-decide T8 from the migration fixture diff; foreign and obsolete managed state remain represented.
- [ ] Re-decide T10 from the invalid fixture diff; malformed secret-shaped input remains covered.
- [ ] Re-decide T11 from the newer-schema fixture diff; schema 2 and foreign state remain covered.
- [ ] Re-decide T12 from the provider fixture diff; stable identity and digest remain covered.
- [ ] Re-decide T13 from the reset fixture diff; foreign, obsolete, and provider-owned state remain covered.
- [ ] Re-decide T14 from the validation diff; only inventory and terminal-answer registration changed.

### Known limits

- Typed judgment returned `unclear` for A1, A7, A13-A16, A19, T4-T8, and T10-T14; these rows were decided by hand from fresh command output, retained manifests, receipts, and inspected diffs.
- Workspace-scoped `lsp_diagnostics` rejected this external task worktree path; the only new file is this Markdown verification artifact, while all changed JavaScript passed the aggregate Node suite.
- Authenticated Linear, Jira, GitHub Issues, and GitHub resource behavior remains outside this release and is not claimed.
- Live evals exercise an instruction-driven skill through a configured model; retained manifests and strict receipt assertions bound this verification to the observed run.
