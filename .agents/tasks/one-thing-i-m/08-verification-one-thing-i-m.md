---
task: one-thing-i-m
type: verification
summary: "Re-ran npm validation and all 166 tests, focused routing and installer tests, four runtime builds, shell syntax, diff checks, commit validation, profile precedence, fallback, and integration evidence against 2b19167. All checks and acceptance items passed, including the new configure-model-routing contract, project-only verification under an environment profile, transactional write requirements, credential exclusion, deliver reachability, and Atomic delegation. The only limits are that provider account availability and a native Atomic run were not exercised."
status: passed
revision: 2b19167
target: origin/main
---

# Verification

## Run

- Revision: [`2b19167` on `one-thing-i-m`; clean tree before this artifact revision]
- Target: [`origin/main`; 39 files changed, 4 of them tests]
- Checks from: [`package.json` scripts, `.github/workflows/commits.yml`, the plan, and implementation receipts]
- Coverage: [10 acceptance items; 0 claimed by a receipt, 10 claimed by none]
- Graded by: typed-judgment helper `grade-steps`; model `jev-1.13.0`, tokens 3334 in / 428 out for commands and 1550 in / 144 out for diffs; A1-A6 and A9-A10 were unclear and decided by direct evidence.

## Items

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | Repository test suite | [`npm test`] | Exits 0 with no failing test. | Exit 0; validation reports 45 skills and Node reports 166 passed, 0 failed, 0 skipped. | pass | 0.88 | 0 |
| C2 | Focused routing, Atomic, and installer tests | [`node --test tests/route-model.test.mjs tests/atomic-model-routing.test.mjs tests/atomic-controller.test.mjs tests/install.test.mjs`] | Exits 0 with no failing test. | Exit 0; Node reports 49 passed, 0 failed, 0 skipped. | pass | 0.83 | 0 |
| C3 | Generated Claude Code runtime tree | [`npm run build -- --runtime claude-code --dest <temporary directory>`] | Exits 0 and contains configure-model-routing and route-model. | Exit 0; build reports 45 skills, 7 workers and both routing skills are present. | pass | 0.85 | 0 |
| C4 | Generated Codex runtime tree | [`npm run build -- --runtime codex --dest <temporary directory>`] | Exits 0 and contains configure-model-routing and route-model. | Exit 0; build reports 45 skills, 7 workers and both routing skills are present. | pass | 0.85 | 0 |
| C5 | Generated Oh My Pi runtime tree | [`npm run build -- --runtime oh-my-pi --dest <temporary directory>`] | Exits 0 and contains configure-model-routing and route-model. | Exit 0; build reports 45 skills, 7 workers and both routing skills are present. | pass | 0.85 | 0 |
| C6 | Generated Pi runtime tree | [`npm run build -- --runtime pi --dest <temporary directory>`] | Exits 0 and contains configure-model-routing and route-model. | Exit 0; build reports 45 skills, 0 workers and both routing skills are present. | pass | 0.85 | 0 |
| C7 | Shell syntax and diff whitespace | [`bash -n skills/delivery/herd-next/references/stop_hook.sh && git diff --check origin/main...HEAD`] | Both checks exit 0. | Both commands exited 0 with no output. | pass | 0.91 | 0 |
| C8 | Commit subjects | [`npm run check-commits -- origin/main..HEAD`] | Exits 0 with all subjects valid. | Exit 0; `ok: 35 subjects`. | pass | 0.90 | 0 |
| T1 | `tests/route-model.test.mjs` | [`git diff origin/main...HEAD -- tests/route-model.test.mjs`, read in this session] | The change keeps this check's strength. | New tests cover the one-question contract, profile precedence, policy phases, exact candidates, JEV fallback and fail-closed behavior, Herdr contract, and CLI round-trip; no skips or removals. | pass | 0.87 | 0 |
| T2 | `tests/atomic-model-routing.test.mjs` | [`git diff origin/main...HEAD -- tests/atomic-model-routing.test.mjs`, read in this session] | The change keeps this check's strength. | Existing malformed-response, policy, and choice assertions remain; availability, unavailable economy, empty availability, and fixed-mode rejection were added; no skips or removals. | pass | 0.90 | 0 |
| T3 | `tests/atomic-controller.test.mjs` | [`git diff origin/main...HEAD -- tests/atomic-controller.test.mjs`, read in this session] | The change keeps this check's strength. | Temporary controller fixtures now copy portable route-model; existing recovery and checklist assertions remain. | pass | 0.86 | 0 |
| T4 | `tests/install.test.mjs` | [`git diff origin/main...HEAD -- tests/install.test.mjs`, read in this session] | The change keeps this check's strength. | Added isolated Atomic route-model loading and standalone economic fallback; existing install isolation and preservation assertions remain; no skips or removals. | pass | 0.90 | 0 |
| A1 | Shared helper across generated harnesses (plan:05-plan-one-thing-i-m.md:48, claimed: no) | [`node` CLI round-trip and C3-C6] | All harnesses can invoke the same helper through Node. | CLI round-trip passed; every generated Claude Code, Codex, Oh My Pi, and Pi tree contains configure-model-routing and route-model. | pass | hand | 0 |
| A2 | One-question model-invoked setup (plan:05-plan-one-thing-i-m.md:52, claimed: no) | [`node --test tests/route-model.test.mjs`] | `/configure-model-routing` is model-invoked and asks one question at a time. | Contract test passed; the skill requires asking exactly one question, waiting, and explaining the answer before the next question. | pass | hand | 0 |
| A3 | Project and user profile behavior (plan:05-plan-one-thing-i-m.md:18, claimed: no) | [`route-model` CLI with temporary project and environment profiles] | Project and `SKILLS_MODEL_CANDIDATES_FILE` profiles work, and project-only verification ignores the environment profile. | Project-only returned `profileSource: project` and `project/cheap`; normal lookup returned `profileSource: env` and `env/cheap`. | pass | hand | 0 |
| A4 | Transactional profile writes and rollback (plan:05-plan-one-thing-i-m.md:18, claimed: no) | [`node --test tests/route-model.test.mjs` and direct contract inspection] | Temporary validation, same-directory atomic replacement, backup restore, cleanup, and prior-file retention are required. | Contract test passed; the skill specifies explicit temporary-file validation, atomic rename, same-directory backup, restore or removal after final verification failure, cleanup, and retention on pre-rename failure. | pass | hand | 0 |
| A5 | Discovery boundaries and explicit fallback (plan:05-plan-one-thing-i-m.md:18,36, claimed: no) | [`rg` over configure skill, runtime docs, and model-routing docs] | Pi/OMP use only `pi --list-models` and `omp models --json` when available; unavailable discovery falls back to explicit IDs; Claude/Codex require explicit candidates. | Only those public commands are named; missing, failed, malformed, or empty discovery is documented as unavailable with explicit-ID fallback, and Claude/Codex prohibit private catalog scraping. | pass | hand | 0 |
| A6 | Credential exclusion (plan:05-plan-one-thing-i-m.md:18,24,42, claimed: no) | [`route-model` CLI output and credential-field search] | Credentials never appear in profiles, artifacts, or route records. | CLI output contains model metadata only; the credential-bearing output-field search found no matches in route-model docs or this verification artifact. | pass | hand | 0 |
| A7 | Deliver reachability (plan:05-plan-one-thing-i-m.md:31, claimed: no) | [`rg` over skills/delivery/deliver/SKILL.md] | Manual delivery reaches configure-model-routing when no profile exists and routes the first phase through route-model. | Deliver names both configure-model-routing invocation forms and the portable route-model command, including explicit, environment, then project precedence. | pass | 0.76 | 0 |
| A8 | Atomic route-model ownership (plan:05-plan-one-thing-i-m.md:30-32, claimed: no) | [`node --test` focused suite and product inspection] | Atomic does not own a separate candidate-selection policy and forwards candidate configuration. | Atomic imports route-model, adapts legacy inputs, controller forwards `available_models` and `model_candidates`, and isolated-install tests pass. | pass | 0.79 | 0 |
| A9 | Policy, exact candidates, and expected-loss routing (plan:05-plan-one-thing-i-m.md:22-26,50-51, claimed: no) | [`node --test tests/route-model.test.mjs tests/atomic-model-routing.test.mjs`] | Economy remains default for implementation and unknown phases; eligible routing uses exact candidates and prefers the cheapest adequate choice. | Tests pass policy no-JEV selection, exact identifiers, candidate validation, probability validation, expected-loss selection, standalone fallback, and Atomic fail-closed behavior. | pass | hand | 0 |
| A10 | Herdr enforcement and recommendation behavior (plan:05-plan-one-thing-i-m.md:37,54, claimed: no) | [`node --test tests/route-model.test.mjs` and direct contract inspection] | Herdr passes selected models only when enforceable and otherwise reports recommendations. | Contract test passed; native handoffs use the post-separator `--model` argument while manual handoffs report recommendation-only behavior. | pass | hand | 0 |

## Findings

None.

## Missing

None.

## Human Review

### Review targets

- The items table and the hand-decided contract, profile, transactional, discovery, credential, policy, and Herdr items A1-A6 and A9-A10.
- The implementation diff, especially `skills/delivery/configure-model-routing/SKILL.md`, `skills/delivery/route-model/route-model.mjs`, Atomic delegation, and the four generated runtime builds.

### Verify

- [ ] Run `npm test`; it exits 0 with 166 passing tests.
- [ ] Run `node --test tests/route-model.test.mjs tests/atomic-model-routing.test.mjs tests/atomic-controller.test.mjs tests/install.test.mjs`; it exits 0 with 49 passing tests.
- [ ] Run each runtime build for `claude-code`, `codex`, `oh-my-pi`, and `pi`; each generates configure-model-routing and route-model.
- [ ] Run `bash -n skills/delivery/herd-next/references/stop_hook.sh && git diff --check origin/main...HEAD`; both checks exit 0.
- [ ] Run `npm run check-commits -- origin/main..HEAD`; it exits 0 with 35 valid subjects.
- [ ] Re-decide A3: run project-only route-model verification while `SKILLS_MODEL_CANDIDATES_FILE` points to a different environment profile; it returns the project profile.
- [ ] Re-decide A4: inspect the configure-model-routing transactional write and rollback contract.
- [ ] Re-decide A5 and A6: inspect discovery/fallback documentation and route records for credential exclusion.

### Known limits

- A1-A6 and A9-A10 were unclear to typed judgment and were decided by direct evidence with `hand` confidence.
- No provider account availability or native Atomic runtime session was tested; candidate availability remains caller-supplied as documented.
