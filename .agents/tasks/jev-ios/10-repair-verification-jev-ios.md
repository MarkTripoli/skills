---
task: jev-ios
type: repair-verification
summary: "CR-001 is not accepted: the forbidden goal-rewriting helper was excluded, and unchanged documented helper attempts were retained as non-green because they did not produce the required text-helper JSON contract. Exact Name, Casey replacement, and standalone proof remain pending."
status: complete
revision: 98bf90c
---

# CR-001 evidence repair

## Scope and preservation

This receipt repairs acceptance evidence only. Product commit `b95285c` is unchanged. Before reconciliation, the edited artifacts and review artifact were byte-archived under `evidence/cr001-raw-goal-20260920/pre-edit/`; the rejected `/tmp/jev-ios-text-helper-continuation.py` and all wrapper-backed recordings remain preserved and are not used as accepted proof. No Android device, ADB server, old Atomic run, upload, push, PR, reset, or new worktree was used.

## Provenance decision

The wrapper `/tmp/jev-ios-text-helper-continuation.py` is excluded because it matches and rewrites fixture-specific Name and Casey goal strings. It cannot establish the original-goal contract. No generic adapter was used to manufacture a result.

The documented helper configuration was attempted unchanged. The raw original goal was passed byte-for-byte:

`Confirm the current exact Name value without replacing it`

Commands, with secrets omitted:

- `printf '%s' 'Confirm the current exact Name value without replacing it' | omp -p`
- The configured OMP command from `/tmp/atomic-migration.JBu9Sk/acceptance-environment.json` was also invoked through a byte-preserving generic stdin adapter, with no fixture-word matching or rewriting.

Raw stdout/stderr are retained ignored under `evidence/cr001-raw-goal-20260920/pre-edit/`; hashes are:

- plain `omp -p` stdout `382c1d38773c63ae79e5295c8e39a236b4ea5a195cfa00c5d7ae01a6bd8bac73`
- plain `omp -p` stderr `dfef4c342f986ab93a9e0bb90f2d88c3bf25b2455853253d31ef95c1c55192a7`
- unchanged configured command stdout `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- unchanged configured command stderr `55e29be6790d476e55182f3121a11b66aa2c985ff37f06e9dc8725dfffdf8165`

The plain command returned exit 0 but non-contract prose rather than exactly `{\"text\":...}`. The configured command returned `usage_limit_reached` with exit 1 and no stdout. Neither output was selected for UI input. This diagnoses the prior empty result as an external helper/model protocol failure, not a reason to rewrite the acceptance goal.

## Acceptance verdicts

- Exact label-equal Name: **unproven/pending**. The wrapper-backed `Confirmed Name` recording is retained but rejected. No unchanged-helper green result is claimed.
- Casey-to-Jordan replacement: **unproven/pending**. The wrapper rewrote the Casey seed; its recording is retained but rejected.
- Installed standalone: **unproven/pending**. The wrapper-backed receipt is retained but rejected for the same provenance reason.
- Generic and blocked/failure/cleanup evidence: unchanged and retained where their helper provenance is valid.

The reconciled `02`, `04`, `08`, `final-checks`, and `pr-description` files no longer claim the rejected runs as current acceptance proof. Independent review is complete; this receipt does not self-approve.

## Validation

`npm test` remains 150/150 from `b95285c`; the WAIT and cleanup probes remain passing. No product test or implementation was changed in this evidence-only repair. Authorized simulator and IDB cleanup state must remain checked by the next integration owner before any later proof attempt.
