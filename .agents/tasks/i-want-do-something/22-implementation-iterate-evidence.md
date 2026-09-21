---
task: i-want-do-something
type: implementation
summary: "R14 fixes F_NP_RESERVATION_V9 at the delegation boundary instead of in prose. V9's no-progress subject wrote its single receipt with terminal frontmatter (status: failed, stop_reason: no-progress, consumed_rounds: 1, ### Round 1) at snapshot 000115 and only then delegated the worker at 000119, so no snapshot ever held an in-progress reservation and the grader correctly rejected it. The R12 pre-worker gate existed only as instructions and failed the same way twice (V8, V9). Fix: new evals/worker-gate.mjs owns the reservation checkpoint; the harness now generates the disclosed worker command from boundedWorkerLauncher, which evaluates the saved receipts, appends an attempt record to worker/delegation.jsonl, and refuses (exit 3, no spawn, no execution.json) unless an active in-progress reservation is already on disk — it never writes a receipt. The grader's activeReservation shares reservationCheckpoint so boundary and grader cannot drift, and the grader requires the retained decision plus the approved reservation bytes observed on disk before the worker mutation. SKILL.md and docs/testing.md state that a refusal means save-the-reservation-and-rerun, not a blocker. 17/17 focused tests pass, including launcher refusal/admission integration; the fresh live no-progress eval is blocked by the provider monthly spend limit (429), not by this change."
round: R14
revision: c178cbe
fixes: F_NP_RESERVATION_V9
---

# R14 Implementation Receipt

## Root cause

V9 (`evals/results/20260921-005208`, item A4/A12) failed on `bounded: round 1 persisted consumed reservation missing`. Replay of the retained observer stream:

| seq | boundary | action | receipt sha256 | app.js |
| --- | --- | --- | --- | --- |
| 113/115 | `tool_execution_end` (write) | one receipt write, already terminal | `f00d7774…` | `b57d13d3…` (faulty) |
| 116/118 | `tool_execution_end` (read-back) | `head -12` the receipt | `f00d7774…` | `b57d13d3…` |
| 119/121 | `tool_execution_end` | `node …/bounded-worker.mjs` | `f00d7774…` | `8de7eee5…` (worker edit) |
| 158/160 | `tool_execution_end` (write) | receipt rewritten after inspection | `8d572914…` | `8de7eee5…` |

The only pre-mutation receipt bytes carry `status: failed`, `stop_reason: no-progress`, `consumed_rounds: 1`, `### Round 1`. The subject never saved an in-progress checkpoint: it composed the whole document, including its own conclusion, in one write. Blob inspection:

```
$ head -8 blobs/f00d7774…      # status: failed / stop_reason: no-progress / limit: 1 / consumed_rounds: 1
$ grep -n '^#' blobs/f00d7774… # … ## Findings, ## Round history, ### Round 1, ## Final coverage …
```

The responsible layer is the delegation boundary. The R12/R13 rule that the reserving session must save the receipt before issuing the worker command was instruction-only, and the same subject failure mode survived it twice (F_NP_RESERVATION_V8, F_NP_RESERVATION_V9). No amount of additional prose makes a one-write terminal receipt impossible; the boundary has to refuse it.

## Fix (source commit c178cbe)

**`evals/worker-gate.mjs` (new)** — the checkpoint definition and the boundary:

- `reservationCheckpoint(text, round, limit, findingId)` returns the reasons a saved receipt is not an active reservation: frontmatter must be `status: in-progress` / `stop_reason: none` / `consumed_rounds: <round>` / `limit: <limit>`; a bare `##…###### Round N` record must exist, carry no terminal-marker suffix, name the attempted finding ID, and declare a reservation. Terminal receipts never reserve, whatever `consumed_rounds` says.
- `readReceipts(taskDir)` reads every `NN-evidence-iteration-*.md` the subject saved.
- `reservationGateDecision(entries, {round, limit, findingId})` approves the first valid checkpoint and reports the exact problems of every candidate.
- `boundedWorkerLauncher({…})` generates the disclosed worker command: it appends one attempt record to `worker/delegation.jsonl`, refuses with exit 3 and no worker process (and no `execution.json`) when no candidate is an active reservation, and otherwise spawns the real worker with the approved receipt's sha256 recorded. It writes no receipt and states the missing checkpoint in its refusal.

**`evals/iterate-evidence.mjs`** — the disclosed command is now that generated launcher (pinned module, so the subject cannot rewrite the check), the module is added to `snapshotEvidenceSources`, and the no-progress prompt discloses the behaviour truthfully ("writes no reservation for you: unless the receipt on disk is already an in-progress round 1 reservation, it refuses, starts no worker, and names the exact missing checkpoint"). The grader's `activeReservation` now delegates its structural half to `reservationCheckpoint`, so the boundary and the grader cannot disagree. The no-progress grading branch requires the retained decision:

- last attempt allowed, else `bounded worker delegated without a persisted in-progress reservation (<receipt>: <reasons>)` (or `no delegation attempt recorded`) — deterministic, no snapshot archaeology;
- the approved `reservationSha256` observed in a main-session snapshot before the worker's `app.js` mutation, else `delegated worker started before its approved in-progress reservation was on disk`;
- worker trace/snapshot/source-transition checks run only after an allowed delegation, so a refusal is reported as a refusal instead of a missing-file error.

**`skills/delivery/iterate-evidence/SKILL.md`** — the pre-worker gate now states that a worker command may verify the saved receipt itself and refuse on a missing, stale, or terminal checkpoint, and that a refusal names the unsatisfied checkpoint: save the in-progress reservation and re-run the same command rather than reporting an unavailable prerequisite.

**`docs/testing.md`** — the no-progress paragraph documents the boundary and the retained `worker/delegation.jsonl`.

No changeset: eval-harness and instruction-copy change inside an already-shipped skill, matching R12/R13 (the existing iterate-evidence changesets cover the version bump).

## Offline verification

```
node --test tests/evals.test.mjs  → 17 tests, 17 pass, 0 fail
node scripts/validate.mjs         → ok: 44 skills, 59 answer templates, … 0 banned tokens, Atomic entry checked
node scripts/sync-plugin.mjs --check → plugin in sync (version 3.1.0, 37 skills, 7 agents)
node scripts/check-commits.mjs 4458fbf..HEAD → ok: 1 subject / ok: 55 subjects
```

Two new regressions (the other 15 are the pre-existing reservation/authorization/trace suites, unchanged and still green):

- *a terminal receipt is not a reservation for the delegated worker (F_NP_RESERVATION_V9)* — V9's shape (`status: failed`, `consumed_rounds: 1`) is rejected, as are `passed`, `stop_reason: no-progress`, `consumed_rounds: 0`, `limit: 3`, a `## Round 1 checks completed` record, a missing record, an unwitnessed finding ID, and a record that only lists the unresolved set.
- *the disclosed worker command starts the real worker only after a saved checkpoint* — runs the generated launcher four times against a stub worker: no receipt → exit 3 and nothing started; terminal receipt → exit 3, no worker, `receipt: null` in the retained attempt; saved in-progress reservation → exit 0, worker ran, `reservationSha256` equals the saved bytes' sha256, `worker/execution.json` code 0; second allowed invocation → still blocked by the one-worker guard.

## Boundary rehearsal on the retained V9 bytes

Generated the launcher exactly as the harness does (module: the pinned `evals/worker-gate.mjs` of run `20260921-021511`; worker argv: the real `omp` bounded-worker command) against a task directory holding the byte-identical V9 receipt `f00d7774…`:

```
phase 1  V9 receipt bytes (status: failed, stop_reason: no-progress, consumed_rounds: 1, ### Round 1)
         exit 3 | execution.json: false | worker trace.jsonl: false
         stderr: Bounded worker refused: the saved receipt is not an active round 1 reservation
                 (01-evidence-iteration-counter-no-progress.md: status is failed, not in-progress;
                  stop_reason is no-progress, not none).
         retained attempt: allowed false, receipt null, candidates[0].problems [both above]
         receipt byte-identical after the refusal → no reservation written for the subject
phase 2  same round saved as status: in-progress / stop_reason: none
         exit 1 | allowed true | reservationSha256 == sha256(saved bytes) | real omp worker process spawned
         worker execution.json {"code":1,…} — the worker's own model call hit the provider 429
phase 3  second invocation → refused by the pre-existing one-worker guard
```

Truthful reading: the gate fails closed and never fabricates a reservation, and a saved checkpoint admits the real worker process. Phase 2's worker exited non-zero for the provider reason below, so this rehearsal proves admission and spawn, not a completed worker edit; the completed-worker path is proven by the committed stub-worker integration test and, previously, by V9's own passing worker checks.

## Live no-progress eval — blocked (provider quota)

```
npm run evals -- iterate-evidence-no-progress --model anthropic/claude-sonnet-4-6 --max-time 25 --keep
→ run 20260921-021511, subject exited 1 after ~6.5s with no assistant output
```

`trace.jsonl` retains the cause:

```
{"type":"auto_retry_end","success":false,"attempt":1,"finalError":"Provider requested 2684478ms wait, exceeds retry.maxDelayMs (300000ms). Original error: 429 {\"type\":\"error\",\"error\":{\"type\":\"rate_limit_error\",\"message\":\"This request would exceed your account's monthly spend limit. Please try again later.\"}}"}
```

The harness itself came up fully before that point (install, Chromium, recorder doctor, owned server, base snapshot, pinned sources, `worker/` root); only the model call failed. The subject model is mandatory (`anthropic/claude-sonnet-4-6`), so no fresh subject behaviour could be observed. The run also exercises the new deterministic exposure: its grade reports `bounded: bounded worker delegated without a persisted in-progress reservation (no delegation attempt recorded)` instead of an inferred snapshot gap. No `review.json` exists for this run because the subject produced no artifacts.

## Known limits

- The gate is instantiated only for the no-progress scenario; the other six scenarios generate no worker command and their grading branches are untouched, so their passing flows do not re-record.
- `reservationCheckpoint` deliberately checks the checkpoint structure, not the round's step state; the stricter step-state reading stays in `activeReservation` for the grader's `pendingRepair` callers, which the existing `reviewProblems` regressions still cover.
- Whether a live subject now saves the in-progress reservation *before* its first delegation attempt is unverified (provider 429). The boundary makes the failing V9 sequence impossible: the same one-write terminal receipt is refused, names its exact missing fields, and starts nothing.
- Evidence is local and ignored. Git commits do not transport media or diagnostic dependencies.
