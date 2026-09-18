---
date: 2026-09-18T14:34:44Z
git_commit: 6d761cbb64f8e9191e1d496510887a21f774df8a
branch: compose-delivery-chain-jev
repository: skills
topic: "JEV-driven phase composition and the execution-DAG artifact for delivery packs"
type: research
summary: "judge.mjs's four TypeSafe-backed commands share one build-question/call/threshold skeleton with a per-command fallback word for an unsure answer; delivery-start already runs this same route-then-confirm-then-resolve pattern once per task. delivery-full's `gates` bash node turns one `INPUTS_GATES` string into a fixed four-key JSON object consumed by four gated phase nodes chained in a single linear DAG with two `when:`-conditional branches (verify, app-test), each pair proven by `fixtures/*.stubs.yaml` files and a `tests/packs.test.mjs` harness that regex-extracts a node's bash body and runs it under real bash, with or without an in-process TypeSafe HTTP stub. scripts/validate.mjs requires the identical four-heading Human Review footer, exactly once each, across 20 listed templates including tdd_template.md and design_discussion_template.md, with no per-template extra-heading mechanism; scripts/build-packs.mjs discovers native packs by walking `.archon/workflows/delivery/*/*.yaml` with no manifest, so a new pack directory is picked up automatically. No `adaptive/` pack, no `compose` command, and no execution-plan artifact type exist yet anywhere in the repository."
tags: [research, codebase]
status: complete
---

# Research: JEV-driven phase composition and the execution-DAG artifact for delivery packs

**Date**: 2026-09-18T14:34:44Z
**Git Commit**: 6d761cbb64f8e9191e1d496510887a21f774df8a
**Branch**: compose-delivery-chain-jev
**Repository**: skills

## Research Question

1. In `skills/delivery/typed-judgment/judge.mjs`, how do existing commands that call the TypeSafe System One model (`route-workflow`, `autonomy`, `route-question`, `neutral`) structure their input parsing, the `systemOne` call, the `choice`/`score`/`noul` helper usage, confidence thresholds, and plain-vs-`--json` output shapes, and what happens when the helper is unavailable?
2. In `.archon/workflows/delivery/start/delivery-start.yaml`, how do the `route` and `resolve` nodes and the per-pack `when:` branches work end to end, including the `confirm` gate, the fallback to `full` on low confidence, and the `done` join's `trigger_rule`?
3. How is `INPUTS_GATES` parsed and mapped to per-phase gate booleans in an existing pack's `gates` bash node, and how does `delivery-full.yaml` sequence and wire its phase nodes (research, design, prd/tdd, plan, implement, verify, app-test, review, pr) via `depends_on`, `include`, and `when`?
4. What is the full structure of an existing pack's fixture files under `fixtures/*.stubs.yaml` (node-id-to-stub-output pairs, the `fixture:` block's `expect`, `reached`, `inputs`, and `fail-node` fields, and `exec-code`), and how does `archon workflow test <pack>` consume them per `docs/testing.md`?
5. What does `scripts/validate.mjs` currently check for each template type, including which templates, which required headings, and how occurrences are counted, beyond the human-review heading list?
6. What are the current section order and frontmatter fields of `skills/delivery/create-tdd/references/tdd_template.md` and `skills/delivery/create-design-discussion/references/design_discussion_template.md`, and do their `artifact_template.html` files or `*_final_answer.md` replies reference specific sections by name?
7. How does `scripts/build-packs.mjs` discover which native packs to convert into `-omp` flavors, and what does its `--check` mode compare?
8. What is the current text of the phase-name/type list in `shared/CONVENTIONS.md` near line 136, and of the pack list and phase descriptions in `workflows/delivery.md` and `docs/cheatsheet.md`?
9. In `tests/packs.test.mjs`, how do `runTaskNode` and `runGateCheck` extract and execute a node's bash body from pack YAML for testing against the TypeSafe stub and without it, and what existing test cases follow this pattern for a decide-style node?

## Research Methodology

This document records current behavior only. It does not recommend implementation work, refactors, optimizations, or future changes.

Six child workers examined `skills/delivery/typed-judgment/judge.mjs`; `.archon/workflows/delivery/start/delivery-start.yaml` and its fixtures; `.archon/workflows/delivery/full/delivery-full.yaml`, its fixtures, and `tests/packs.test.mjs`'s bash-node harness; `scripts/validate.mjs`; `scripts/build-packs.mjs` and its tests; and the tdd/design-discussion templates plus `shared/CONVENTIONS.md`, `workflows/delivery.md`, and `docs/cheatsheet.md`. Every `path:line` claim below was re-verified against the live file before this document was saved.

### Known limits

- `TYPESAFE_API_KEY` is unset in this environment, so `typed-judgment/judge.mjs` itself is unavailable here; the routing, reranking, citation, and coverage checks the research skill would otherwise run through it were done by direct rereading instead, per the skill's own fallback rule.
- `tests/judge.test.mjs` does not directly drive `route-workflow`, `autonomy`, `route-question`, or `neutral` through the no-key/exit-3 path; that they behave like the two commands that are tested that way (`plan-remaining`, `feedback-intent`) is an inference from the shared `main()`/`systemOne()` code path, not a directly observed test result for these four.
- The fixture `fail-node` field is documented in `docs/testing.md` but not demonstrated in any `delivery-full` or `delivery-start` fixture read for this document; its exact effect on a fixture's expected outcome was not confirmed by an example.
- `scripts/build-packs.mjs`'s `--check` CLI branch (stale/orphan reporting and the `process.exit` code) has no direct test in `tests/build-packs.test.mjs`; it is exercised only indirectly by `npm test` running `node scripts/build-packs.mjs --check` against the already-in-sync committed tree.

## Summary

`judge.mjs` gives every TypeSafe-backed command the same shape: build one or more typed questions (`noul` for yes/no, `choice` for one-of-N, `score` for a graded level), send them in a single `systemOne(state, questions)` call, and threshold the returned confidence against a shared `T` table (`judge.mjs:41`, e.g. `confident: 0.8`, `decisive: 0.9`) or a command-local literal. An unsure answer never surfaces as an error — each command has its own named fallback (`route-workflow` falls back to `"full"`, `autonomy` to `"all"`, `route-question` to `null`/`"undecided"`, `neutral` to `"unclear"`). Any call that cannot complete (`TYPESAFE_API_KEY` unset, HTTP failure after retries, oversized request, timeout) throws `Unavailable`, which `main()`'s single top-level catch turns into `judge: unavailable: <message>` on stderr and exit code 3 for every command uniformly (`judge.mjs:632-636`).

`delivery-start` already applies this pattern once, at the top of a run: its `route` bash node calls `judge.mjs route-workflow --json -` (only when no `--input workflow=` was given) and `judge.mjs autonomy -`, computes its own `confident` flag with an `awk` re-check of the same `0.8` bar, and sets `confirm=true` only when unconfident. The `confirm` approval node then fires conditionally (`when: "$route.output.confirm == 'true'"`), and `resolve` merges the route's pick with any human override into a final `{workflow, gates}`, re-validating both against the same fixed pack/gate-name lists `route` used. Exactly one of seven `workflow:`-child nodes then runs, chosen by mutually exclusive `when:` conditions on `$resolve.output.workflow`, and `done` joins with `trigger_rule: none_failed_min_one_success` because six of the seven children are always skipped.

`delivery-full` shows the canonical phase DAG and its gating mechanism: a `gates` bash node parses `INPUTS_GATES` (`all`, `none`, or a comma-separated subset of `design plan phases pr`) into a flat JSON object of string `"true"`/`"false"` values, which four downstream `delivery-gate-phase`/`delivery-implement` includes read via `with: gate: $gates.output.<name>`. The pack chains task → gates → research → research-done → design → design-done → plan → plan-done → implement → implement-done → verify → verify-done → app-test → app-test-done → review → review-done → pr → pr-done as one linear sequence, with `verify` and `app-test` each behind their own `when:` and a join that tolerates either branch being skipped (`trigger_rule: none_failed_min_one_success`). No node in any pack currently asks a "run this phase or not" typed question per phase; the only per-run gating decision is the single up-front `gates` computation, applied identically to every task in that run.

Every pack directory carries `fixtures/*.stubs.yaml` files: one map of node-id (or `alias__node`, or bare for a loop-body node) to the plain-text or JSON string that node would have printed, plus a `fixture:` block (`expect: completed|failed|paused|cancelled`, `reached: [...]`, optional `inputs:`, and a documented-but-unobserved `fail-node`), plus a top-level `exec-code: true|false` toggling whether the pack's own bash nodes run for real in a scratch worktree or are stubbed like everything else. `archon workflow test <pack>` dry-runs each fixture and reports pass/fail plus any `unusedStubs`/`missingStubs`, verified end to end by `tests/packs.test.mjs:539-571`. Separately, `tests/packs.test.mjs` tests individual bash node bodies standalone: `runTaskNode` and `runGateCheck` regex-extract a node's `bash: |` or `until_bash: |` block straight out of the YAML text, strip its block-scalar indentation, and run it under real `/bin/bash`, optionally pointed at an in-process HTTP server (`tests/lib/typesafe-stub.mjs`) that answers `judge.mjs`'s TypeSafe calls; the same test also asserts the no-stub, no-`TYPESAFE_API_KEY` fallback path.

`scripts/validate.mjs` requires the literal headings `## Human Review`, `### Review targets`, `### Verify`, `### Known limits` exactly once each (substring split-count, not a heading-level-aware parse) in 20 listed template files, including `create-tdd/references/tdd_template.md` and `create-design-discussion/references/design_discussion_template.md`; it has no mechanism for one entry in that list to require a different or additional heading than the other 19. Neither template's own text, nor its `artifact_template.html`, nor its `*_final_answer.md` reply, references a specific section heading by name — only `create-tdd/SKILL.md` (not one of the three named files) hardcodes `### Verify`/`### Known limits` by name. `scripts/build-packs.mjs` discovers native packs purely by directory walk (`fs.readdirSync(NATIVE_DIR)` one level deep, filtered to `.yaml` files, no manifest or allow-list), so a new pack directory under `.archon/workflows/delivery/` is picked up with zero code changes; its `--check` mode regenerates every file's content in memory and does a full string-equality diff against disk, exiting 1 on any mismatch or orphan. Three documents each enumerate the delivery packs and the task-artifact phase names (`shared/CONVENTIONS.md:136`, `workflows/delivery.md:26-35,160`, `docs/cheatsheet.md:28-36,74`), with small differences in inclusion/order between them. As of this commit, `.archon/workflows/delivery/` contains 18 subdirectories and no `adaptive/`; `judge.mjs` has no `compose` command; and no `execution-plan` artifact type or template exists anywhere in the repository.

## Detailed Findings

### 1. Every TypeSafe-backed `judge.mjs` command follows one build-question/call/threshold skeleton, with its own fallback word for an unsure answer

`judge.mjs` defines three question builders used by every command (`skills/delivery/typed-judgment/judge.mjs:118-120`):

```js
const noul = (instructions, criteria) => ({ type: "noul", instructions, ...(criteria ? { criteria } : {}) });
const choice = (instructions, criteria) => ({ type: "choice", instructions, criteria });
const score = (instructions, criteria) => ({ type: "score", instructions, criteria });
```

`noul` asks a single yes/no probability, `choice` asks for one of a named set (`criteria` a `{key: description}` map), `score` asks for a graded level (`criteria` an ordered array of level descriptions). A shared threshold table sits above them (`judge.mjs:41`):

```js
const T = { yes: 0.8, no: 0.2, safe: 0.5, confident: 0.8, decisive: 0.9, triage: 0.7 };
```

Every command sends exactly one `systemOne(state, questions)` call (`judge.mjs:80-116`): it requires `TYPESAFE_API_KEY` (throws `Unavailable("TYPESAFE_API_KEY is not set")` at `judge.mjs:81-82` if unset), posts to `${TYPESAFE_BASE_URL:-https://api.typesafe.ai}/v1/systemone` with `{state, model: TYPESAFE_DEFAULT_MODEL || "jev-latest", questions}` (`judge.mjs:90-95`), retries 429/5xx up to `JUDGE_RETRIES` (default 2) times with `retry-after`-aware backoff (`judge.mjs:60,85-87,102`), and returns `body.answers` on success or throws `Unavailable`/`TooLarge` otherwise (`judge.mjs:101-108`).

The four commands named in the research question:

| Command | Input | Question(s) | Threshold rule | Unsure fallback |
|---|---|---|---|---|
| `route-workflow` (`judge.mjs:302-317`) | `textArg(args[0] ?? "-")` — literal, `@file`, or stdin; or `--children <file.json>` for a batch of child tasks | one `choice` over `WORKFLOWS` (`oneshot, bugfix, lean, full, prd, epic`, `judge.mjs:42-49`) per request | `a.confidence >= T.confident` (0.8) | `"full"` (`judge.mjs:315`, and per-child at `judge.mjs:308`) |
| `autonomy` (`judge.mjs:467-481`) | `textArg(text)`, `text` from `rest[0] ?? "-"` | one `choice` over `{none, pr, plan, all, unspecified}` | `none` needs `T.decisive` (0.9); `pr`/`plan` need `T.confident` (0.8) | `"all"` (every other case, `judge.mjs:479`) |
| `route-question` (`judge.mjs:575-580`) | required positional JSON file (`ROLES` = `{locate, analyze, pattern, web, none}`, `judge.mjs:568-574`) — no stdin/`@file` support | one `choice` per input question | `a.confidence >= 0.5` (a literal, not named in `T`) | `null`, printed as the literal word `"undecided"` (`judge.mjs:578-579`) |
| `neutral` (`judge.mjs:582-587`) | same required-JSON-file shape as `route-question` | one `noul` per input question | `p >= 0.6 → "leading"`, `p < 0.4 → "neutral"`, else `"unclear"` (hardcoded band, not in `T`; comment at `judge.mjs:540-541` calibrates 0.6 against a baseline of ~0.3 for plainly neutral text) | explicit third `"unclear"` verdict for the `0.4 ≤ p < 0.6` band |

`route-question` and `neutral` are the only two of the four with a `need(1, "<questions.json>")` check in `main()` (`judge.mjs:620-621`) that exits 2 via `usage()` if the file argument is missing; `route-workflow` and `autonomy` have no such check and silently default to reading stdin (`rest[0] ?? "-"`, `judge.mjs:609,615`).

Output shapes (`main()`, `judge.mjs:596-627`): a global `--json` flag is spliced out of `argv` anywhere it appears (`judge.mjs:598`) and decides whether stdout is `JSON.stringify(result.json)` or the plain `result.text`. Plain text is one bare word for `route-workflow`/`autonomy` (e.g. `"bugfix"`, `"plan"`) or one TSV line per input question for `route-question` (`id\trole-or-undecided\tconfidence`) and `neutral` (`id\tverdict\tleading`); `--json` returns the same information as a JSON object or array, always including the model's raw `suggested`/`choice` alongside the thresholded value.

Unavailability is uniform across all four: any `Unavailable` thrown inside `systemOne` (missing key, HTTP error after retries, `TooLarge`, malformed response body, or timeout) propagates uncaught through the command function to `main(...).catch(...)` (`judge.mjs:632-636`), which writes `judge: unavailable: <message>\n` to stderr and calls `process.exit(3)` — nothing is written to stdout in this case, since the stdout write (`judge.mjs:626`) sits after the `await` that throws. A non-`Unavailable` bug instead prints `judge: <stack>` and exits 1 (`judge.mjs:634-635`).

#### Testing patterns

`tests/judge.test.mjs:189-243` covers `route-workflow` (confident pick passes through; `confidence: 0.6` on a `bugfix` pick returns `"full"`, commented "an unsure route is the gated pack"; `--children` batches drop `epic` from child criteria) and `autonomy` (`none`/`0.95` → `"none"`; `none`/`0.85`, below the 0.9 decisive bar, → `"all"`; `plan`/`0.85` ≥ the 0.8 confident bar → `"plan"`; `unspecified`/`1.0` → `"all"`, commented "nothing said means every gate"). `tests/judge.test.mjs:298-323` covers `route-question` (`confidence: 0.9` → the role; `0.45`, below the 0.5 bar → `"undecided"`) and `neutral` (`p=0.65` → `"leading"`; `p=0.35` → `"neutral"`). `tests/judge.test.mjs:27-35` proves the exit-3/no-key and exit-3/dead-endpoint path, but only for `plan-remaining` and `feedback-intent`, not for these four commands directly (see Known limits). `tests/lib/typesafe-stub.mjs:1-46` provides `startStub(decide, options)`, a real `http.createServer` that checks the `Bearer test-key` auth header the same way `systemOne` sends it, can be told to return a queued HTTP status (to simulate retryable/permanent/oversized failures), and otherwise answers each question via a test-supplied `decide(id, question, state)` callback, recording every request body for assertions.

### 2. `delivery-start` runs the route-then-confirm-then-resolve pattern once per task, then hands off to exactly one child pack

`.archon/workflows/delivery/start/delivery-start.yaml`'s `route` node (`delivery-start.yaml:58-141`) is a single `bash:` block. It only calls the judge when no explicit pack was given: `workflow=$(printf '%s' "${INPUTS_WORKFLOW:-auto}" | tr -d ' ')`, and the `node "$judge" route-workflow --json -` call sits inside `if [ "$workflow" = auto ]` (`delivery-start.yaml:68-77`) — an explicit `--input workflow=<pack>` skips the judge entirely and leaves `confident=true` at its initialized value, which later forces `confirm=false`. When the judge does run, `route` parses the JSON with `sed` capture groups for `workflow`, `suggested`, `confidence` and independently re-checks the same `0.8` bar with `awk` (`delivery-start.yaml:75-79`); if the judge produced nothing usable at all (helper missing, `node` missing, non-zero exit — stderr is discarded with `2>/dev/null`), `route` hard-codes `workflow=full` and `confident=false` (`delivery-start.yaml:81`). A second-pass string match can additionally upgrade an already-`prd`-routed request to `program` (`delivery-start.yaml:83-88`) — `program` is never a `judge.mjs route-workflow` output itself, since it is not in `WORKFLOWS`.

Gates are resolved the same way: `INPUTS_GATES=auto` triggers `node "$judge" autonomy -` (plain text, not `--json`), and the returned level (`none|pr|plan|all`) maps to a pack-specific gate-name string, e.g. `full` + `plan` → `gates=design,plan`; `prd`/`program` + `plan` → `gates=prd,tdd,plan` (`delivery-start.yaml:100-113`). `route` emits `{"workflow":"...","gates":"...","suggested":"...","confidence":"...","confirm":"..."}` (`delivery-start.yaml:131-140`), setting `confirm=true` only when `confident=false` (`delivery-start.yaml:129-130`).

`confirm` (`delivery-start.yaml:142-152`) is an `approval:` node gated by `when: "$route.output.confirm == 'true'"`, so it fires exactly when the judge was unavailable or scored below 0.8; it shows the routed pack, confidence, and gates in its message and offers exactly two decisions, `approve`/`reject` ("Request changes").

`resolve` (`delivery-start.yaml:158-204`) depends on both `route` and `confirm` with `trigger_rule: none_failed_min_one_success` (required because `confirm` is conditionally skipped). It reads `$confirm.output` as an opaque string — a real gate answers `{"decision":"...","text":"..."}`; a skipped node's whole output reads as empty — and regex-parses `decision`/`text` out of it rather than accessing fields directly (`delivery-start.yaml:166-174`). A `reject` with free text like `"lean, outline"` splits on the first word as the new `workflow` and the remainder (comma-joined) as the new `gates` (`delivery-start.yaml:175-179`); `resolve` then re-validates both against the identical pack-list and gate-name tables `route` used (`delivery-start.yaml:180-197`), so a typo in the human's override text still fails the run rather than silently mis-routing.

`task` (`delivery-start.yaml:206-214`) includes `delivery-task`, passing `workflow: $resolve.output.workflow` — this is how the task directory's `task.md` frontmatter ends up naming the resolved pack (`delivery-task.yaml:73,78`). Seven `workflow:` child nodes follow (`delivery-start.yaml:216-287`), one per pack (`full, lean, prd, oneshot, bugfix, epic, program`), each gated by a mutually exclusive `when: "$resolve.output.workflow == '<pack>'"` so exactly one runs; the pack's header comment explains these are `workflow:` child runs rather than `include:`s because Archon 0.10.1 drops a `loop_group`'s body inside a doubly-nested include, and every delivery pack loops internally (`delivery-start.yaml:41-48`). `done` (`delivery-start.yaml:289-300`) depends on all seven pack nodes with `trigger_rule: none_failed_min_one_success` — required because six of the seven are always skipped — but reads its printed `{workflow, task_dir}` from `resolve` and `task`, not from whichever child actually ran.

#### Testing patterns

Three fixtures under `.archon/workflows/delivery/start/fixtures/`: `confirm-lean.stubs.yaml` (unsure `full` pick at confidence 0.55, `confirm:true`, a `reject` resolving to `lean`/`outline`, reaches `[route, confirm, resolve, task__create]`, fails at the `lean` child node since a dry run cannot execute a reachable `workflow:` child); `explicit-bugfix.stubs.yaml` (`--input workflow=bugfix`, no `confirm` node reached); `unattended-oneshot.stubs.yaml` (`--input gates=none`, confident `oneshot` route, no `confirm`). All three use `exec-code: false`. `tests/packs.test.mjs:539-571` is the only test that runs these three fixtures, via `archon workflow test delivery --cwd <scratch> --json --quiet`, asserting every declared fixture passes with no unused/missing stubs. `delivery-start` is not part of the hand-authored `PACKS` map (`tests/packs.test.mjs:453-460`) used for direct dry-run assertions elsewhere in that file, so its only test coverage is the fixture-driven `archon workflow test` path.

### 3. `delivery-full`'s `gates` node computes one fixed-shape JSON object; the pack itself is a single linear DAG with two conditional branches

The four gate-able phases are hardcoded as `names="design plan phases pr"` inside the `gates` bash node (`.archon/workflows/delivery/full/delivery-full.yaml:54-85`):

```bash
requested=$(printf '%s' "${INPUTS_GATES:-all}" | tr -d ' ')
case "$requested" in
  all|'') on="$names" ;;
  none) on="" ;;
  *)
    on=""
    for g in $(printf '%s' "$requested" | tr ',' ' '); do
      case " $names " in
        *" $g "*) on="$on $g" ;;
        *) printf 'gates: unknown gate "%s"; use all, none, or a comma-separated subset of: %s\n' "$g" "$names" >&2; exit 1 ;;
      esac
    done ;;
esac
out=""
for name in $names; do
  case " $on " in *" $name "*) v=true ;; *) v=false ;; esac
  out="$out${out:+,}\"$name\":\"$v\""
done
printf '{%s}\n' "$out"
```

`INPUTS_GATES` defaults to `all`; `none` turns every gate off; any other value is comma-split and each token validated against `names`, aborting the node with `exit 1` on an unknown token. The output is a flat object of the literal strings `"true"`/`"false"` (not JSON booleans), matching the declared `output_format` schema (`delivery-full.yaml:78-85`). There is no gate for `research`, `verify`, `app-test`, or `review` — only `design`, `plan`, `phases` (the implement loop), and `pr` are gate-able, consistent with the pack's own inputs description "a comma-separated subset of design, plan, phases, pr" (`delivery-full.yaml:29-31`).

The full node sequence, in file order, is a single chain with two conditional side-branches:

```
task → gates → research → research-done
            → design → design-done
            → plan → plan-done
            → implement → implement-done
            → [verify (when: $INPUTS.verify != 'false')] → verify-done
            → [app-test (when: $INPUTS.app_test != 'none')] → app-test-done
            → review → review-done
            → pr → pr-done
```

Every `*-done` join after a gated `design`/`plan`/`implement`/`pr` node uses `trigger_rule: none_failed_min_one_success` (`delivery-full.yaml:115,135,154`, etc.) because each `delivery-gate-phase`/`delivery-implement` include internally branches between a gated `cycle` path and an unattended `once`/`phases-auto` twin, and exactly one of those two is always skipped — the pack's header comment states this rationale directly (`delivery-full.yaml:42-45`). `verify` and `app-test` are the only two pack-level conditionally-skippable phases (`when: "$INPUTS.verify != 'false'"` at `delivery-full.yaml:166`, `when: "$INPUTS.app_test != 'none'"` at `delivery-full.yaml:186`), each followed by a join depending on both the previous join and the conditional node (`verify-done` depends on `[implement-done, verify]`; `app-test-done` on `[verify-done, app-test]`) so the join fires whichever way the branch went. `review` and `pr` are unconditional — every run reaches them. There is no parallel branching anywhere in the pack: every node has exactly one predecessor set, and phases run strictly in sequence.

`gates` output feeds four downstream nodes via `with: gate: $gates.output.<name>`: `design` (`delivery-full.yaml:111`), `plan` (`:131`), `implement` (`:150`), `pr` (`:227`). Inside the included blocks, that `gate` input drives a `when: "$INPUTS.gate == 'true'"` branch (seen directly in `delivery-gate-phase.yaml:44`), which chooses between the gated `cycle` loop (its `until_bash` calls `judge.mjs feedback-intent`, see Finding 5) and an unattended twin that runs without pausing.

#### Testing patterns

`.archon/workflows/delivery/full/fixtures/gated.stubs.yaml` stubs every node output for the fully-gated path (`fixture.reached` lists `gates, research-done, design__cycle, design-done, plan__cycle, plan-done, implement__phases, implement-phase, implement-done, verify-done, review__loop, review-done, pr__cycle, pr-done`, `expect: completed`, `exec-code: false`). `unattended.stubs.yaml` (`inputs: {gates: none}`) stubs the `__once`/`phases-auto` twins instead. `review-blocked.stubs.yaml` (`review-code` stub `"status":"blocked"`) expects `cancelled`. `review-findings.stubs.yaml` (`"status":"findings"`) adds a `fix-review` stub and expects `completed`. `review-each-phase.stubs.yaml` (`inputs: {review_each_phase: "true"}`) adds per-phase `review-phase`/`fix-phase`/`verify-phase` stubs. `tests/packs.test.mjs:525-528` separately asserts the `gates=bogus` error path end to end (`outcome: "failed"`, failing node `gates`, exact stderr message matched).

### 4. A pack fixture stubs every node's output and asserts the dry run's outcome, reached-node list, and stub usage

A representative fixture (`.archon/workflows/delivery/full/fixtures/gated.stubs.yaml:1-27`) has this shape: every top-level key except `fixture` and `exec-code` is `node-id: stub-output-string`. Nodes belonging to an `include` are namespaced `<alias>__<node>` (e.g. `task__create`, `research__questions`); nodes inside a loop body are not namespaced (`implement-phase`, `review-code`, `intent`) — documented directly in `docs/testing.md:46`. Stub values are JSON strings for schema/`output_format` nodes (e.g. `gates: '{"design":"true",...}'`, `review-code: '{"status":"clean",...}'`) and plain text for prompt/skill nodes (e.g. `research__research: "research saved"`).

The `fixture:` block fields, per `docs/testing.md:47`: `expect` is one of `completed`, `failed`, `paused`, `cancelled`; `reached` is the array of node ids the dry run must have visited; `inputs` supplies workflow inputs to the dry run (e.g. `unattended.stubs.yaml`'s `inputs: {gates: none}`, `review-each-phase.stubs.yaml`'s `inputs: {review_each_phase: "true"}`); `fail-node` is documented as the field that makes one node fail, but no fixture read for this document (across `delivery-full` or `delivery-start`) exercises it. `exec-code` is a boolean outside the `fixture:` block — `true` executes the pack's real deterministic `bash:` nodes (`delivery-task`, `gates`, the `*-done` joins) in a scratch worktree of `HEAD`; `false` requires every one of them to be stubbed instead, which is what every fixture read for this document does (`exec-code: false` throughout).

`archon workflow test <pack>` runs each fixture as a dry run and checks the actual outcome against `fixture.expect`, that every node in `fixture.reached` actually ran, and reports any stub key declared but never consumed (`unusedStubs`) or any node reached with no stub (`missingStubs`) — confirmed via `tests/packs.test.mjs:534-571`:

```js
function fixtureTest(cwd, target) {
  const result = spawnSync(ARCHON, ["workflow", "test", target, "--cwd", cwd, "--json", "--quiet"], { encoding: "utf8", env: ARCHON_ENV, timeout: 600000 });
  return { code: result.status, report: JSON.parse(result.stdout) };
}
```

The JSON report's `results[]` entries carry `{fixture, pass, failureReason, unusedStubs, missingStubs}`; the test asserts exit code 0 when every fixture passes, that `results.map(r => r.fixture)` equals every `*.stubs.yaml` file discovered on disk, that no result has `unusedStubs`/`missingStubs`, and that a fixture with a deliberately wrong `expect:` fails with `failureReason: "expected cancelled, dry-run reported completed"` and exit code 1 (`tests/packs.test.mjs:559-567`). `archon workflow test delivery-bugfix` runs one pack's fixtures; `archon workflow test delivery` runs every fixture under the whole `delivery` tree, "never creates a run or contacts a provider" (`docs/testing.md:50-57`). `docs/testing.md:59-69` counts 29 fixtures total across the tree as of its writing, listing `delivery-full`'s five by name.

#### Testing patterns

Covered above; `tests/packs.test.mjs:556-557` additionally asserts that with `exec-code: false`, the checkout's git history is untouched after a fixture run (`git log` still shows only `init`, and `.agents` does not exist), confirming stubbed `*-done`/`task__create` nodes never actually run `git commit`.

### 5. `tests/packs.test.mjs` extracts a bash node's body by regex out of the raw YAML and runs it under real bash

`runTaskNode` (`tests/packs.test.mjs:165-169`) reads `delivery-task.yaml`'s raw text, regex-matches from `bash: |` up to the following `output_format:` line, strips the block-scalar indentation, and hands the result to a shared `bash()` helper that spawns `bash -c <body>` and captures stdout/stderr/exit code:

```js
function runTaskNode(cwd, env) {
  const yaml = fs.readFileSync(path.join(NATIVE_DIR, "task", "delivery-task.yaml"), "utf8");
  const body = /bash: \|\n((?: {6}.*\n|\n)+?) {4}output_format:/.exec(yaml)[1].replace(/^ {6}/gm, "");
  return bash(body, { cwd, env: { HOME: "/home/t", INPUTS_SKILLS_DIR: SKILLS, ...GIT_ENV, ...env } });
}
```

`runGateCheck` (`tests/packs.test.mjs:374-379`) does the equivalent for a `loop_group`'s `until_bash`, locating it by the enclosing node's `id:` and stripping shell-quoted substitutions for `$gate.output.decision`/`$gate.output.text` the way Archon's own runtime would, then returning only the exit code (since `until_bash` semantics are "0 ends the loop, nonzero continues it"):

```js
async function runGateCheck(block, loopId, decision, text, env) {
  const yaml = fs.readFileSync(path.join(NATIVE_DIR, block, `delivery-${block}.yaml`), "utf8");
  const body = new RegExp(`id: ${loopId}\\n[\\s\\S]*?until_bash: \\|\\n((?: {8}.*\\n)+?) {6}nodes:`).exec(yaml)[1].replace(/^ {8}/gm, "");
  ...
}
```

Both helpers accept the TypeSafe stub the same way: called with no `env.TYPESAFE_*`, the extracted bash body's own `if [ -f "$judge" ] && command -v node ...` guard still finds and runs `judge.mjs`, but `judge.mjs` itself exits non-zero with nothing printed when `TYPESAFE_API_KEY` is unset (`docs/testing.md:83`), so the body's own `|| intent=revise`-style fallback fires; called with `...stub.env` (from `tests/lib/typesafe-stub.mjs:startStub`), `judge.mjs` reaches the in-process stub instead.

The closest existing precedent for a bash node that runs a `judge.mjs` command and branches on it is `delivery-gate-phase.yaml`'s `cycle` loop's `until_bash` (`.archon/workflows/delivery/gate-phase/delivery-gate-phase.yaml:44-58`):

```yaml
until_bash: |
  decision=$gate.output.decision
  test "$decision" = approve && exit 0
  text=$gate.output.text
  skills=$INPUTS.skills_dir
  judge="$skills/typed-judgment/judge.mjs"
  intent=revise
  if [ -n "$(printf '%s' "$text" | tr -d '[:space:]')" ] && [ -f "$judge" ] && command -v node >/dev/null 2>&1; then
    intent=$(printf '%s' "$text" | node "$judge" feedback-intent - 2>/dev/null) || intent=revise
  fi
  test "$intent" = proceed
```

Its test, `tests/packs.test.mjs:381-402`, exercises: the deterministic short-circuit (`decision=approve` exits 0 without calling the judge); the no-stub fallback (every `reject` revises without a key); the stub-backed path (a `decide` callback drives `intent`, and a `reject` whose free text only asks to proceed still ends the loop); a blank-text guard (`"   "` is never judged); and reuse of the identical `until_bash` shape in `delivery-implement.yaml`'s `phases` loop via the same `runGateCheck(block, loopId, ...)` call, noting that loop layers a plan-completion check on top of the same proceed/revise judgment.

#### Testing patterns

Covered inline above. A related pair, `runPlanCheck`/`runNextPhase` (`tests/packs.test.mjs:284-295`), tests `delivery-implement.yaml`'s `phases-auto` `until_bash` (judging `remaining`/`done`) and its `next-phase-auto` node (judging the next phase name) with the same with/without-stub pattern (`tests/packs.test.mjs:337-371`).

### 6. `scripts/validate.mjs` requires the same four headings, exactly once each, across 20 listed templates — with no per-template extra-heading mechanism

The only heading requirement tied to a template list is the `HUMAN_REVIEW_TEMPLATES` array (`scripts/validate.mjs:151-172`), 20 skill-relative paths spanning design-discussion, prd, tdd, structure-outline, plan, epic-plan, implementation (three producing skills sharing per-skill files), pr-description, reproduction, pr-review, epic-delivery, app-test, and verification (create/iterate pairs where both exist). `research` has no entry in this list and no entry in the parallel `HUMAN_GATE_ANSWERS` regex (`scripts/validate.mjs:178-184`), so no heading structure is checked for research output at all.

The check itself (`scripts/validate.mjs:405-417`), identical for every one of the 20 files including `tdd_template.md` and `design_discussion_template.md`:

```js
for (const file of HUMAN_REVIEW_TEMPLATES) {
  const full = skillFile(file);
  if (!fs.existsSync(full)) { fail(rel(skillFile(file)), 0, "human-review template missing"); continue; }
  const content = read(full);
  for (const heading of ["## Human Review", "### Review targets", "### Verify", "### Known limits"]) {
    const count = content.split(`\n${heading}\n`).length - 1;
    if (count !== 1) fail(rel(skillFile(file)), 0, `must contain exactly one "${heading}" heading (found ${count})`);
  }
}
```

This is substring split-count (`content.split(\`\n${heading}\n\`).length - 1`), not a regex anchored to line start and not a markdown-AST parse; it requires the heading text preceded and followed by a newline, and the rule is exactly one occurrence — both zero and more than one fail. There is no per-file heading list; the four-item array at line 413 is shared verbatim by all 20 entries, so nothing in the current script lets one entry (e.g. tdd) require a heading the others don't. Confirmed against the live files: `tdd_template.md:65,67,71,75` and `design_discussion_template.md:68,70,74,78` each carry the four headings once, after their own template-specific sections (tdd's `### System Design`, `### Program Design`, `### Type Definitions`, `### Configuration`, `### Error Handling`, `### What We're Not Doing`, `### Local Patterns`; design-discussion's `### Summary of change request`, `### Current State`, `### Desired End State`, `### Proposed End State Architecture`, `### Design Questions`, `### Resolved Design Questions`, `### Patterns to follow`) — none of which are checked by `validate.mjs` at all.

Other sections of `validate.mjs` check unrelated things: §2-4 (`scripts/validate.mjs:280-316`) validate every `SKILL.md`'s frontmatter shape, a fixed line-6 sentence, and `references/` file existence; §5 (`:318-398`) validates the `*_final_answer.md` handoff templates (fenced command block shape, `Open a new session in...`/`Next action:` lines, all via the same split-count idiom) — this is a different file from the design-document templates; §7 (`:419-427`) checks the three `implementation_template.md` frontmatter placeholders; §8 (`:429-449`) checks `HUMAN_GATE_ANSWERS`/`PHASE_ANSWERS` reply-template content. None of these vary per-artifact-type beyond which fixed list a file belongs to.

`npm test` (`package.json:20`) runs `node scripts/validate.mjs && node scripts/sync-plugin.mjs --check && node scripts/build-packs.mjs --check && node --test tests/` — `validate.mjs` is the first of four steps, with its own dedicated `npm run validate` (`package.json:21`).

#### Testing patterns

No dedicated test file exists for `scripts/validate.mjs` — `grep -rn "validate" tests/*.mjs` returns nothing. It has no unit-test seam of its own; its only "test" is being run against the live repository tree as part of `npm test`, which currently passes (implying the tdd and design-discussion templates already satisfy the four-heading check).

### 7. Neither the tdd/design-discussion templates nor their reply files reference a section by name in code; `create-tdd/SKILL.md` does

`skills/delivery/create-tdd/references/tdd_template.md` frontmatter: `task`, `type: design-tdd`, `summary`, `repo`, `branch`, `sha`. Section order: `# [TDD Title]` (10), `### System Design` (12) → `#### [System takeaway title]` (16), `### Program Design` (30) → `#### [Program takeaway title]` (34), `### Type Definitions` (45), `### Configuration` (49), `### Error Handling` (53), `### What We're Not Doing` (57), `### Local Patterns` (61), `## Human Review` (65) → `### Review targets` (67), `### Verify` (71), `### Known limits` (75).

`skills/delivery/create-design-discussion/references/design_discussion_template.md` frontmatter is the identical field set (`task`, `type: design-discussion`, `summary`, `repo`, `branch`, `sha`) — only the `type` value differs. Section order: `### Summary of change request` (10), `### Current State` (14), `### Desired End State` (20), `### What we're not doing` (26), `### Proposed End State Architecture` (30), `### Design Questions` (34) → `#### [Open decision title]` (36), `### Resolved Design Questions` (46) → `#### [Resolved decision title]` (48), `### Patterns to follow` (54) → `#### [Pattern title]` (56), `## Human Review` (68) → `### Review targets` (70), `### Verify` (74), `### Known limits` (78). Unlike the tdd template, it has no top-level `# [Title]` heading.

Each skill has a matching `references/artifact_template.html` (a generic HTML shell with a `{Artifact title}` placeholder and shared dark-theme CSS, no content-specific markup) and a `references/*_final_answer.md` reply template:

```
The TDD is ready for review.

Review artifact: {artifact_link}

Check:
- {review_check}
- Known limits: {known_limits}

Reply with the changes you want, or run `/iterate-tdd @{artifact_file}`.
```

(`tdd_final_answer.md:1-9`; `design_discussion_final_answer.md` is identical apart from the skill name.) Neither reply template, nor either `artifact_template.html`, contains a markdown heading (`##`/`###`) anywhere — the only heading-adjacent text is the plain-English label `Known limits:` paired with a `{known_limits}` placeholder, not the literal heading `### Known limits`.

`create-tdd/SKILL.md` does hardcode section names by string, twice: "`### Known limits` item and one `### Verify` box naming the decision the reader must make" (`create-tdd/SKILL.md:40`) and "fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists" (`create-tdd/SKILL.md:81`). `create-design-discussion/SKILL.md` has no equivalent hardcoded reference to `### Verify`/`### Known limits`.

#### Testing patterns

Covered by Finding 6's `validate.mjs` heading check (the only automated check against either template's content) and by the answer-handoff check in `scripts/validate.mjs` §5 for the two `_final_answer.md` files. No dedicated test file targets either template or its skill directly.

### 8. `scripts/build-packs.mjs` discovers native packs by directory walk with no manifest; `--check` is a full content diff, not a hash

Discovery is the entire `listNative()` function (`scripts/build-packs.mjs:37-43`):

```js
export function listNative() {
  return fs
    .readdirSync(NATIVE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => fs.readdirSync(path.join(NATIVE_DIR, d.name)).filter((f) => f.endsWith(".yaml")).map((f) => ({ dir: d.name, file: f })))
    .sort((a, b) => a.dir.localeCompare(b.dir));
}
```

`NATIVE_DIR` is `.archon/workflows/delivery` (`scripts/build-packs.mjs:19`). Every subdirectory one level deep is listed, and within each, every file ending in `.yaml` is picked up — no name pattern, no registry, no content sniffing. As of this commit `.archon/workflows/delivery/` has exactly 18 subdirectories (`app-test, bugfix, epic, epic-wave, full, gate-phase, implement, lean, oneshot, prd, program, research, resolve-reviews, review, start, task, verify, wave`) and no `adaptive/`. A new `.archon/workflows/delivery/adaptive/delivery-adaptive.yaml` would be discovered by this same walk with zero code changes in `build-packs.mjs`. `build()` separately globs each discovered pack's `fixtures/*.stubs.yaml` files and copies them verbatim into the `-omp` tree (`scripts/build-packs.mjs:313-318`).

`convert(source)` (`:184-295`) is a line-level, indentation-aware text rewrite (not a YAML parse) that renames `name:`/`include:`/`workflow:` targets to append `-omp`, rewrites a `flavor` input's empty default to `"-omp"`, appends an Oh-My-Pi note to the description block, and — its main job — turns every `prompt: |` node into a `bash:` node that shells out to the `omp` CLI, folding any `model:`/`effort:` fields into `omp` flags and any `output_format:` schema into a `judge.mjs extract-json` call with an `awk`-filter fallback.

`--check` uses the identical comparison primitive as a normal write (`scripts/build-packs.mjs:299-306`):

```js
function generated(target, content, results, write) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  results.push({ target, stale: current !== content });
  if (write && current !== content) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
}
```

`build({write})` always recomputes the full generated content in memory via `convert(source)` and compares it against what's on disk with plain string inequality (`current !== content`) — a full content diff, not a stored hash or mtime check. When `write` is false (`--check`), nothing is written; `results` (an array of `{target, stale, orphan?}`) is returned for the CLI to report. The CLI branch (`scripts/build-packs.mjs:340-349`) prints one stderr line per stale/orphaned target (`"<path>: stale; run node scripts/build-packs.mjs"` or `"<path>: no native source"`) and exits `stale.length ? 1 : 0` in check mode. `build()` also sweeps the `-omp` tree for files whose native source no longer exists and marks/removes them as orphans (`:320-336`). A newly-added native pack with no generated `-omp` counterpart yet reads as `stale` (its on-disk `current` is `null`, never equal to the generated `content`) and fails `--check` with exit 1 until `node scripts/build-packs.mjs` (no `--check`) is run once to write it. `npm test` runs `node scripts/build-packs.mjs --check` (`package.json:20`); `npm run build-packs`/`npm run check-packs` (`package.json:25-26`) run the two modes directly.

#### Testing patterns

`tests/build-packs.test.mjs:47-129` covers `convert()`'s prompt-to-bash transformation in detail (judge/awk fallback recovery, task-dir hoisting into `--dir`, generator errors on a malformed enum shape or non-tier `model:` value, a live `/bin/bash 3.2` spawn of the generated script against a fake `omp` binary and the real `typed-judgment` skill exercising the with-stub, no-key, and no-helper paths, and the `flavor`/`workflow` target-suffix rewrite). No test in this file directly exercises `listNative()`, `build()`'s orphan sweep, or the `--check` CLI's exit code — those are exercised only indirectly, at whole-repo granularity, by `npm test` confirming the two trees are already in sync.

### 9. Three documents each enumerate the delivery packs and task-artifact phase names, with small differences between them

`shared/CONVENTIONS.md:136` states the phase list used in join-node commit messages: `research`, `design`, `prd`, `tdd`, `plan`, `outline`, `implement`, `review`, `reproduce`, `fix`, `pr`, `review-round`. `workflows/delivery.md:160` gives a near-duplicate list — `research`, `design`, `outline`, `prd`, `tdd`, `plan`, `implement`, `review`, `reproduce`, `pr`, `review-round` — omitting `fix` as a standalone item (it calls out `fix-bug`'s own commit, `docs(task): fix artifacts`, separately in the same sentence). `docs/cheatsheet.md:74` gives a third near-duplicate: `research`, `design`, `outline`, `prd`, `tdd`, `plan`, `implement`, `review`, `reproduce`, `fix`, `pr`, `review-round` (fix included here).

`workflows/delivery.md:24-35` lists 10 packs in its main table: `delivery-full` (26), `delivery-lean` (27), `delivery-prd` (28), `delivery-oneshot` (29), `delivery-bugfix` (30), `delivery-start` (31), `delivery-epic` (32), `delivery-program` (33), `delivery-epic-wave` (34), `delivery-resolve-reviews` (35). The `delivery-full` row quotes its chain exactly: "create-research-questions, create-research, create-design-discussion (gate), create-plan (gate), implement-plan per phase (gate after each), verify-implementation, review loop, describe-pr (gate)" with gates "`design`, `plan`, `phases`, `pr`". A second table (`:43-52`) separately lists the composable blocks packs `include:` (`delivery-task`, `delivery-research`, `delivery-gate-phase`, `delivery-implement`, `delivery-review`, `delivery-verify`, `delivery-app-test`, `delivery-wave`) — these are not packs themselves.

`docs/cheatsheet.md:26-36` lists 9 packs (all of `workflows/delivery.md`'s 10 except `delivery-start`, which the cheatsheet documents separately under "One command", `docs/cheatsheet.md:15-22`), each with its "when"/"gates"/"start command" columns, e.g. `delivery-full`: "competing approaches, cross-module impact, a shared interface" / `design, plan, phases, pr` / `archon workflow run delivery-full --branch plugin-formatters "Add a plugin system for output formatters"`.

#### Testing patterns

Not applicable — these are documentation files with no automated test coverage found in this research pass; `scripts/validate.mjs` §11 (workflow-doc coverage, `scripts/validate.mjs:469-489`, noted by a child worker but outside this document's read scope) is the only script-level check touching `workflows/delivery.md`.

## Code References

### `typed-judgment` command and threshold pattern
- `skills/delivery/typed-judgment/judge.mjs:38-54` - shared `T` threshold table, `WORKFLOWS` label set, `Unavailable`/`TooLarge` error classes.
- `skills/delivery/typed-judgment/judge.mjs:80-116` - `systemOne()`, the single shared HTTP call every command uses.
- `skills/delivery/typed-judgment/judge.mjs:118-120` - `noul`/`choice`/`score` question builders.
- `skills/delivery/typed-judgment/judge.mjs:302-317` - `routeWorkflow()`.
- `skills/delivery/typed-judgment/judge.mjs:467-481` - `autonomy()`.
- `skills/delivery/typed-judgment/judge.mjs:575-580` - `routeQuestion()`.
- `skills/delivery/typed-judgment/judge.mjs:582-587` - `neutral()`.
- `skills/delivery/typed-judgment/judge.mjs:596-627` - `main()` dispatch, `--json` handling, stdout/stderr write.
- `skills/delivery/typed-judgment/judge.mjs:630-637` - top-level invocation guard and the shared `Unavailable`→exit-3 / other→exit-1 catch.
- `tests/judge.test.mjs` - unit coverage for every command's threshold behavior and the shared unavailable-path exit codes (representative, not exhaustive of every command × every threshold band).
- `tests/lib/typesafe-stub.mjs:1-46` - the in-process TypeSafe HTTP stub shared by `judge.test.mjs`, `packs.test.mjs`, and `build-packs.test.mjs`.

### `delivery-start` routing pack
- `.archon/workflows/delivery/start/delivery-start.yaml:58-141` - `route` node.
- `.archon/workflows/delivery/start/delivery-start.yaml:142-152` - `confirm` approval node.
- `.archon/workflows/delivery/start/delivery-start.yaml:158-204` - `resolve` node.
- `.archon/workflows/delivery/start/delivery-start.yaml:206-214` - `task` node (includes `delivery-task`).
- `.archon/workflows/delivery/start/delivery-start.yaml:216-287` - the seven mutually-exclusive `workflow:` child nodes.
- `.archon/workflows/delivery/start/delivery-start.yaml:289-300` - `done` join.
- `.archon/workflows/delivery/start/fixtures/` - `confirm-lean.stubs.yaml`, `explicit-bugfix.stubs.yaml`, `unattended-oneshot.stubs.yaml`.
- `.archon/workflows/delivery/task/delivery-task.yaml` - the included task-creation node `route`'s `task` node runs.

### `delivery-full` phase DAG and gating
- `.archon/workflows/delivery/full/delivery-full.yaml:19-40` - pack inputs (`gates`, `verify`, `app_test`, etc.).
- `.archon/workflows/delivery/full/delivery-full.yaml:54-85` - `gates` bash node.
- `.archon/workflows/delivery/full/delivery-full.yaml:87-241` - the full node chain, task through pr-done (exhaustive for this pack; representative of the same shape in `delivery-lean.yaml`/`delivery-bugfix.yaml`, not read in full for this document).
- `.archon/workflows/delivery/gate-phase/delivery-gate-phase.yaml:44-58` - the `cycle` loop's `until_bash`, the closest existing "decide"-style precedent.
- `.archon/workflows/delivery/full/fixtures/` - `gated.stubs.yaml`, `unattended.stubs.yaml`, `review-blocked.stubs.yaml`, `review-findings.stubs.yaml`, `review-each-phase.stubs.yaml` (exhaustive for this pack).

### Pack test harness
- `tests/packs.test.mjs:149-158` - `bash()`, the shared spawn/capture helper.
- `tests/packs.test.mjs:160-169` - `runTaskNode()`.
- `tests/packs.test.mjs:284-295` - `runPlanCheck()`/`runNextPhase()`.
- `tests/packs.test.mjs:373-379` - `runGateCheck()`.
- `tests/packs.test.mjs:381-402` - the gate-phase/implement `until_bash` precedent test.
- `tests/packs.test.mjs:534-571` - `fixtureTest()` and the `archon workflow test` end-to-end assertion.
- `docs/testing.md:29-77` - the written fixture-format and `archon workflow test` contract.

### Validator and template checks
- `scripts/validate.mjs:151-172` - `HUMAN_REVIEW_TEMPLATES` (the 20-file list; exhaustive for this check).
- `scripts/validate.mjs:405-417` - the four-heading, exactly-once check.
- `scripts/validate.mjs:318-398` - the separate `*_final_answer.md` handoff-template check (§5), a different file family from the design-document templates.
- `skills/delivery/create-tdd/references/tdd_template.md` - full section list in Finding 7.
- `skills/delivery/create-design-discussion/references/design_discussion_template.md` - full section list in Finding 7.
- `skills/delivery/create-tdd/references/tdd_final_answer.md`, `skills/delivery/create-design-discussion/references/design_discussion_final_answer.md` - reply templates, neither hardcoding a heading name.
- `skills/delivery/create-tdd/SKILL.md:40,81` - the only hardcoded `### Verify`/`### Known limits` references among the files this research read.

### Build-packs generator
- `scripts/build-packs.mjs:19-26` - `NATIVE_DIR`, `OMP_DIR`, `OMP_SUFFIX`, `NODE_TIMEOUT_MS` constants.
- `scripts/build-packs.mjs:37-43` - `listNative()`.
- `scripts/build-packs.mjs:184-295` - `convert()`.
- `scripts/build-packs.mjs:299-338` - `generated()` and `build()`.
- `scripts/build-packs.mjs:340-349` - the `--check` CLI branch.
- `tests/build-packs.test.mjs` - `convert()` unit and integration coverage (exhaustive for that function; no coverage of `listNative()`/`build()`'s check-mode CLI behavior).

### Documentation lists
- `shared/CONVENTIONS.md:136` - phase-name list.
- `workflows/delivery.md:24-52,160` - pack table, block table, phase-name list.
- `docs/cheatsheet.md:15-22,26-36,74` - `delivery-start` "one command" section, pack table, phase-name list.

## Architecture Documentation

Every currently-existing "decide" point in a delivery pack lives at exactly one place per run: `delivery-start`'s `route`/`autonomy` calls choose the pack and gate level once, before any task directory exists, and `delivery-full`'s `gates` node turns the resulting gate string into one fixed JSON object consumed unconditionally by four gate-phase/implement includes for the rest of that run. Neither call is re-asked as new artifacts appear; the only other conditional branching in a pack's own DAG is the pack-level `when:` on `verify`/`app-test`, which reads a plain workflow input (`$INPUTS.verify`, `$INPUTS.app_test`) rather than a per-run typed judgment.

The three verification surfaces that any new pack or template content must satisfy today are independent of each other: `scripts/build-packs.mjs` only cares that a pack directory exists under `.archon/workflows/delivery/` and contains `.yaml` files (Finding 8); `archon workflow test <pack>` only cares that a pack's `fixtures/*.stubs.yaml` files declare stubs matching every node the dry run reaches (Finding 4); and `scripts/validate.mjs` only cares that files already listed in its fixed arrays (e.g. `HUMAN_REVIEW_TEMPLATES`) contain their required headings the required number of times (Finding 6) — none of the three inspects the others' targets.

`tests/packs.test.mjs`'s bash-node harness (Finding 5) works by locating a node's raw YAML text with a regex anchored on the surrounding syntax (`bash: |` ... `output_format:`, or `until_bash: |` ... `nodes:`), which is why `runTaskNode` and `runGateCheck` are two separate functions rather than one general one — each expects a different closing marker matching the node shape it targets.

## Open Questions

- The exact effect of a fixture's `fail-node` field (which node it fails, whether `fixture.expect` must then be `failed`) is documented in `docs/testing.md:47` in one sentence but not demonstrated by any fixture read in this pass.
- Whether `judge.mjs route-workflow`'s underlying TypeSafe model can return a `workflow` value outside the six documented `WORKFLOWS` keys was not traced past `judge.mjs`'s own code and the stub's mirrored behavior.
- `scripts/build-packs.mjs`'s `--check` CLI exit-code/reporting path (`scripts/build-packs.mjs:340-349`) has no direct unit test; its correctness is inferred from reading the code and from `npm test` currently passing against the committed tree, not from a test that exercises a deliberately stale or orphaned file.
