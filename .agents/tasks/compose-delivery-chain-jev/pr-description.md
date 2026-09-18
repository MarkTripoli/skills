Task: `compose-delivery-chain-jev`

## Purpose

`delivery-start` judged one pack from the request text and then ran that fixed chain whatever the research or design later showed; this replaces the single choice with a judgment at every phase boundary and writes the chain it composed into the task directory as a Mermaid execution plan.

## Acceptance criteria

- (a) `npm test` passes. Exit 0 at the branch head, `tests 72 / suites 3 / pass 72 / fail 0`, including `validate.mjs`, `sync-plugin --check`, and `build-packs --check`.
- (b) `archon workflow test delivery-adaptive` passes its fixtures. 4 passed, 0 failed over `all-phases`, `skipped`, `prd-path`, `helper-unavailable`; `npm test` runs every declared fixture, so this is covered by (a) as well.
- (c) A dry run with stubs shows the skipped phases' nodes skipped and the execution-plan artifact written by the decide node. `archon workflow run delivery-adaptive --dry-run --exec-code` with the decide nodes answering a local TypeSafe stub: `research__questions`, `design__cycle/once`, `prd__cycle/once`, `tdd__cycle/once`, `outline__cycle/once`, `app-test__test` all report `when_condition_false`, and the same run wrote `01-execution-plan-fixture.md` with `class research skipped` through `class app_test skipped` and rows reading `| research | no | - | 0.05 | <= 0.20 |` ([15-verification](.agents/tasks/compose-delivery-chain-jev/15-verification-compose-delivery-chain.md) A3, A10).
- (d) With the key present, `compose` skips research and design on a oneshot-shaped request and keeps them on a full-shaped one. "Set the request timeout in config/http.json from 5s to 30s" scored research 0.07 and design 0.07, both skip; "Add multi-tenant support" scored 0.72 and 0.94, both run; model `jev-1.13.0` (A4). Recorded at `5cd8a09`; no `TYPESAFE_API_KEY` was present in the review sessions, so it has not been re-run since.
- (e) The `create-tdd` and `create-design-discussion` templates render the section and validate. `scripts/validate.mjs` check 6b requires exactly one `### Execution DAG` with a mermaid fence in four templates and one `### Engineering Work Breakdown` with a fence, a `Critical path:` line, and the exact table header in the two TDD templates; validate exits 0 reporting `4 execution-DAG templates, 2 work-breakdown templates`. Renaming either heading in a throwaway worktree makes it exit 1 (A11).
- Live probe runs are abandoned, detached children too. `archon workflow status --json` lists only the pre-existing runs before and after; the scratch repositories and temporary worktrees were removed (A6, and again in [22-code-review](.agents/tasks/compose-delivery-chain-jev/22-code-review-compose-delivery-chain.md)).

## Special things to note

- Every failure path adds phases rather than removing them. A phase is skipped only at `p <= 0.20`; a missing key, a missing `node`, any nonzero exit, an oversized request, or a JSON field the helper did not return all produce the canonical full chain, and `planning` is floored to `plan` so `implement`'s `until_bash` always has an artifact to read.
- Two of the four oneshot-shaped samples still score research or design above the bar on a live probe (`flag-stated-behavior` 0.43 / 0.59, `one-function-fix` 0.70). Acceptance (d) is met by copy-change- and config-edit-shaped requests, not by every oneshot shape; on the (d) request `prd` (0.44) and `tdd` (0.43) also ran, and no sample measures the six phases other than research and design.
- Two verification items stay untested: whether the eight committed samples in `tests/fixtures/compose-samples.json` are the right eight (a judgment about request shapes), and a live default-input run reaching the installed helper, which needs `node scripts/install.mjs` to overwrite the user's `~/.agents/skills`. Separately, `archon workflow test delivery` still exits 1 on `delivery/bugfix/fixtures/reproduced.stubs.yaml`; it fails the same way at the merge base with none of this branch present, and `npm test` does not run that command.

## Change outline

New and changed ownership, 74 files of which 23 are task artifacts and 11 are the generated `-omp` flavor:

```text
skills/delivery/typed-judgment/judge.mjs      compose: one call, 8 phase nouls + reasons + autonomy
evals/compose-probe.mjs                       live probe over the committed samples
.archon/workflows/delivery/
  decide/delivery-decide.yaml                 new block: one bash node, runs compose, writes the artifact
  adaptive/delivery-adaptive.yaml             new pack: 31 nodes, 4 decide boundaries
  start/delivery-start.yaml                   judged oneshot/lean/full/prd -> delivery-adaptive
skills/delivery/create-tdd, iterate-tdd,
  create-design-discussion,
  iterate-design-discussion                   ### Execution DAG (+ ### Engineering Work Breakdown in TDD)
scripts/validate.mjs                          check 6b enforces both sections
```

What one decide node does at a boundary:

```text
decide(boundary)
  state = task.md + {type, summary} of every artifact so far   # execution-plan artifacts excluded
  judged = judge.mjs compose --json <task_dir>                 # one HTTP round trip
  on any failure -> judged = "" -> every optional phase true
  for each phase: verdict = p <= 0.20 ? skip : run             # missing field -> run
  planning = p(plan) >= p(outline) ? plan : outline            # floored to plan on a double no
  write or rewrite NN-execution-plan-<slug>.md                 # flowchart + table, skips dimmed
  return {research, design, prd, tdd, planning, implement_skill, app_test, review_each_phase, autonomy, available}
```

The chain itself is unchanged in order; inclusion is what moved:

```diff
 delivery-start: route -> confirm -> resolve
-  -> delivery-<judged pack>                     # one shape, fixed at the start
+  -> delivery-adaptive                          # judged oneshot|lean|full|prd
+                                                # --input workflow=<pack> still pins a fixed pack
 delivery-adaptive:
+  decide-task    -> research?
+  decide-research-> design? prd? tdd?
+  decide-design  -> plan | outline
+  decide-plan    -> app-test? review after each implementation phase?
   research -> design|prd+tdd -> plan|outline -> implement -> verify -> app-test -> review -> pr
```

Each optional node carries `when:` on the nearest preceding decide node's field, and every join after a guarded node carries `trigger_rule: none_failed_min_one_success`, so a skipped branch does not fail the join. `bugfix` and `epic` stay separate packs; gates are unchanged and still chosen by `autonomy`.

## Human Review

### Review targets

- `.archon/workflows/delivery/decide/delivery-decide.yaml`: a 160-line bash body that parses the helper's JSON with `sed`. The key order it depends on is pinned by `tests/judge.test.mjs:312-314`; the body itself is executed by `tests/packs.test.mjs:289-405` in five configurations.
- `.archon/workflows/delivery/start/delivery-start.yaml:99-165`: `route` now validates a translated copy of a caller-supplied `--input gates=` against `delivery-adaptive` (the pack the run enters) while `route.output.gates` stays in the judged pack's vocabulary for the confirm message.
- `skills/delivery/typed-judgment/judge.mjs` `PHASES` and `composeState`: the question wording decides what gets skipped, and the state that leaves the machine is `task.md` plus each artifact's `type` and `summary`, never a body, a diff, or repository code.
- The four advisories in [22-code-review](.agents/tasks/compose-delivery-chain-jev/22-code-review-compose-delivery-chain.md); none blocks, and the app-test row's contradictory probability column (ADV-001) is the one a reader of a generated artifact will meet first.

### Verify

- [ ] `npm test` exits 0 with `tests 72 / pass 72 / fail 0`.
- [ ] `node scripts/build-packs.mjs --check` is clean, so the `-omp` flavor is not stale.
- [ ] `archon workflow test delivery-adaptive` reports 4 passed, 0 failed.
- [ ] With `TYPESAFE_API_KEY` set, `node skills/delivery/typed-judgment/judge.mjs compose --json .agents/tasks/compose-delivery-chain-jev` prints eight phases with probabilities; research and design stay above the bar with this task's artifacts in the state.

### Known limits

- Whether the eight committed samples are the right eight to tune the phase wording against is undecided; two of them still score above the bar on a live probe.
- The tilde expansion in `skills_dir` is proven by a unit test, not end to end: a live default-input run would need `node scripts/install.mjs` over the user's `~/.agents/skills`.
- `resolve`'s bash body is executed by no committed Archon fixture (all three `delivery-start` fixtures stub it with `exec-code: false`); the one engine behavior it depends on, substitution of the `gates_plan` ref beside the shorter `gates`, was probed against Archon 0.10.1 by hand.
