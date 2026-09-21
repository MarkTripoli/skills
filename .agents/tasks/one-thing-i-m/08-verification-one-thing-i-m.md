---
task: one-thing-i-m
type: verification
summary: "Re-ran the full suite, focused routing and installer tests, generated runtime trees, shell syntax, diff checks, and commit validation against the revised implementation. The routing, installation, Atomic loading, profile precedence, fallback, fail-closed, Herdr, and catalog-boundary checks passed, but the package `build` script exits with usage because it omits its required runtime argument. The implementation remains unreviewed until the build check is addressed."
status: failed
revision: 2f83f59
target: origin/main
---

# Verification

## Run

- Revision: [`2f83f59` on `one-thing-i-m`]; clean tree before this artifact.
- Target: [`origin/main`]; 35 files changed, 4 of them tests.
- Checks from: [`package.json` scripts, `.github/workflows/commits.yml`, and the revised plan].
- Coverage: [11 acceptance items; 0 claimed by a receipt, 11 claimed by none].
- Graded by: typed-judgment helper `grade-steps`; model `jev-1.13.0`, tokens 4201 in / 539 out for commands and 1590 in / 144 out for diffs; A6, A7, A9, A10, and A11 were unclear and decided by hand.

## Items

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | Repository test suite | [`npm test`] | Exits 0 with no failing test. | Exit 0; validation reports 44 skills and Atomic entry checked, plugin is in sync, and Node reports 165 passed, 0 failed, 0 skipped. | pass | 0.92 | 0 |
| C2 | Focused routing, Atomic, and installer tests | [`node --test tests/route-model.test.mjs tests/atomic-model-routing.test.mjs tests/atomic-controller.test.mjs tests/install.test.mjs`] | Exits 0 with no failing test. | Exit 0; Node reports 48 passed, 0 failed, 0 skipped. | pass | 0.89 | 0 |
| C3 | Shell syntax and whitespace checks | [`bash -n skills/delivery/herd-next/references/stop_hook.sh && git diff --check origin/main...HEAD`] | Both checks exit 0. | `stop_hook.sh: syntax ok`; `git diff --check: ok`; exit 0. | pass | 0.93 | 0 |
| C4 | Commit subjects | [`npm run check-commits -- origin/main..HEAD`] | Exits 0 with all subjects valid. | Exit 0; `ok: 28 subjects`. | pass | 0.92 | 0 |
| C5 | Package build script | [`npm run build`] | Exits 0 with a generated runtime build. | Exit 1; prints `usage: node scripts/build-runtimes.mjs --runtime <claude-code\|codex\|oh-my-pi\|pi> [--dest <dir>]`. | fail | 1.00 | 2 |
| T1 | `tests/route-model.test.mjs` | [`git diff origin/main...HEAD -- tests/route-model.test.mjs`, read in this session] | The change keeps this check's strength. | New coverage tests profile precedence, policy phases, expected-loss selection, exact IDs, malformed and unavailable JEV, Herdr contract, and CLI round-trip; no skipped or removed checks. | pass | 0.88 | 0 |
| T2 | `tests/atomic-model-routing.test.mjs` | [`git diff origin/main...HEAD -- tests/atomic-model-routing.test.mjs`, read in this session] | The change keeps this check's strength. | Existing malformed-response, unavailable-JEV, policy, and choice assertions remain; availability, unavailable economy, empty availability, and fixed-mode rejection were added; no skips or deletions. | pass | 0.91 | 0 |
| T3 | `tests/atomic-controller.test.mjs` | [`git diff origin/main...HEAD -- tests/atomic-controller.test.mjs`, read in this session] | The change keeps this check's strength. | Temporary controller fixtures now copy the portable route-model module; existing recovery and progress assertions remain. | pass | 0.89 | 0 |
| T4 | `tests/install.test.mjs` | [`git diff origin/main...HEAD -- tests/install.test.mjs`, read in this session] | The change keeps this check's strength. | Existing selective-install, Atomic-preservation, and parser checks remain; installed Atomic route-model loading and standalone fallback tests were added; no skips or weakened assertions. | pass | 0.91 | 0 |
| A1 | All harnesses invoke one Node helper (plan:05-plan-one-thing-i-m.md:46, claimed: no) | [`node` CLI test and four generated runtime builds] | All harnesses can invoke the same helper through Node. | CLI round-trip passed; Claude Code, Codex, Oh My Pi, and Pi generated trees each contain `route-model`; each build reports 44 skills. | pass | 0.85 | 0 |
| A2 | Atomic delegates policy and selective installation remains independent (plan:05-plan-one-thing-i-m.md:28-30, claimed: no) | [`node --test ...tests/install.test.mjs ...tests/atomic-model-routing.test.mjs` and product diff] | Atomic does not own a separate candidate-selection policy; selected skills install independently and Atomic is opt-in. | Isolated Atomic loads installed route-model; installer tests pass selected-skill install/uninstall in every target and reject partial Atomic selection; Atomic adapter imports and delegates to portable helper. | pass | 0.83 | 0 |
| A3 | Installed Atomic loading (plan:05-plan-one-thing-i-m.md:28, claimed: no) | [`node --test tests/install.test.mjs`] | Installed Atomic loads the portable route-model from the installed skills directory. | Isolated install test passes and returns `cheap` with `source: fixed` from the installed module. | pass | 0.83 | 0 |
| A4 | Candidate profile precedence (plan:05-plan-one-thing-i-m.md:19-23, claimed: no) | [`node --test tests/route-model.test.mjs`] | Explicit candidates and economy override environment, which overrides project configuration. | Profile test passes project fallback, environment override, explicit override, and invalid environment profile rejection. | pass | 0.84 | 0 |
| A5 | Herdr and Stop-hook model enforcement (plan:05-plan-one-thing-i-m.md:35, claimed: no) | [`node --test tests/route-model.test.mjs` and direct contract inspection] | Herdr passes selected models only when enforceable and reports recommendations otherwise. | Contract test passes; Herdr documents `-- --model` for supported agents and recommendation-only manual handoffs; Stop hook routes configured profiles with `--require-jev`, appends `-- --model`, and cleans up on failure. | pass | 0.83 | 0 |
| A6 | Standalone economy fallback (plan:05-plan-one-thing-i-m.md:21-24, claimed: no) | [`node --test tests/install.test.mjs`, hand-decided from output] | Standalone portable use falls back to economy when typed-judgment is unavailable. | Installed standalone test returns `cheap` with `source: fallback` and `helper unavailable`; exit 0. | pass | hand | 0 |
| A7 | Atomic fail-closed behavior (plan:05-plan-one-thing-i-m.md:28-30, claimed: no) | [`node --test tests/route-model.test.mjs tests/atomic-model-routing.test.mjs`, hand-decided from output] | Atomic fails closed when JEV is unavailable or malformed. | `requireJev` rejects unavailable or malformed helper responses; Atomic tests reject malformed responses and report unavailable JEV; exit 0. | pass | hand | 0 |
| A8 | Economy policy for implementation and unknown phases (plan:05-plan-one-thing-i-m.md:21, claimed: no) | [`node --test tests/route-model.test.mjs tests/atomic-model-routing.test.mjs`] | Economy remains the default for implementation and unknown phases. | Tests pass without invoking JEV and select economy with policy source. | pass | 0.80 | 0 |
| A9 | Exact candidates and cheapest adequate choice (plan:05-plan-one-thing-i-m.md:20-24, claimed: no) | [`node --test tests/route-model.test.mjs`, hand-decided from output] | Eligible phases choose only exact supplied candidates and prefer the cheapest adequate candidate. | Tests pass exact identifiers, descriptions, expected-loss choice, probability validation, duplicate and invalid candidate rejection, and economy-presence validation. | pass | hand | 0 |
| A10 | Runtime catalog boundaries (plan:05-plan-one-thing-i-m.md:34, claimed: no) | [`grep` over runtime docs, hand-decided from direct inspection] | Pi/OMP discovery is limited to stable public commands; Claude/Codex require explicit candidates. | Runtime docs state stable public catalog use only for Pi/OMP, explicit candidates for Claude/Codex, and no private catalog scraping. | pass | hand | 0 |
| A11 | Credential exclusion (plan:05-plan-one-thing-i-m.md:40, claimed: no) | [`grep` over route-model, model-routing docs, and task artifacts, hand-decided from direct inspection] | Credentials never appear in artifacts or records. | Inspected contract records candidate metadata and optional usage only; no credential values or credential fields appear in the implementation records or documented output. | pass | hand | 0 |

## Findings

- C5: `npm run build`; expected exit 0 with a generated runtime build (package.json `build` script); observed exit 1 with `usage: node scripts/build-runtimes.mjs --runtime <claude-code|codex|oh-my-pi|pi> [--dest <dir>]`; severity 2.

## Missing

None.

## Human Review

### Review targets

- The items table, especially C5 and the hand-decided acceptance items A6, A7, A9, A10, and A11.
- The C5 finding and the revised plan's portable route-model, Atomic delegation, installation, Herdr, and runtime-boundary requirements.

### Verify

- [ ] Run `npm test`; it exits 0 with 165 passing tests.
- [ ] Run `node --test tests/route-model.test.mjs tests/atomic-model-routing.test.mjs tests/atomic-controller.test.mjs tests/install.test.mjs`; it exits 0 with 48 passing tests.
- [ ] Run `bash -n skills/delivery/herd-next/references/stop_hook.sh && git diff --check origin/main...HEAD`; both checks exit 0.
- [ ] Run `npm run check-commits -- origin/main..HEAD`; it exits 0 with 28 valid subjects.
- [ ] Re-decide A6: run `node --test tests/install.test.mjs`; it shows standalone `source: fallback` economy behavior.
- [ ] Re-decide A7: run `node --test tests/route-model.test.mjs tests/atomic-model-routing.test.mjs`; it shows unavailable or malformed JEV fails closed in Atomic mode.
- [ ] Re-decide A9: run `node --test tests/route-model.test.mjs`; it shows exact-candidate and expected-loss behavior.
- [ ] Re-decide A10: inspect `runtimes/pi.md`, `runtimes/oh-my-pi.md`, `runtimes/claude-code.md`, and `runtimes/codex.md`.
- [ ] Re-decide A11: inspect route-model records, `docs/model-routing.md`, and task artifacts for credential values.

### Known limits

- `npm run build` is a failed repository check because the package script invokes `build-runtimes.mjs` without its required `--runtime` argument. Direct per-runtime builds for Claude Code, Codex, Oh My Pi, and Pi passed in temporary directories.
- A6, A7, A9, A10, and A11 were unclear to JEV and were decided by direct evidence with `hand` confidence.
- No provider account availability or native Atomic runtime session was tested; availability is caller-supplied as documented.
