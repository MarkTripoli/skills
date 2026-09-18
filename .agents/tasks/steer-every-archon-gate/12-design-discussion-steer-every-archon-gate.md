---
task: steer-every-archon-gate
type: design-discussion
summary: "Decides how to close the four gaps research 11 left open after the steward loop shipped in phases 05-09: acceptance (a), (b), (c) are unproved, the loop has no automated coverage, a `get` call that fails is read as a running run and loops silently forever, and abandoned-run worktrees have no owner. Live CLI checks correct research 11's finding 5: `archon workflow get` returns full fields from any git repository, including one unrelated to the run, and fails only outside a git work tree, where it exits 1 and prints an error body `jq` cannot parse, so the fix is an exit-status guard plus `--cwd \"$cwd\"`, not a working-directory requirement. Five design questions are open; the plan phase implements whichever options the review settles."
repo: skills
branch: herdr-plugin-delivery-flow
sha: 4fb301c
---

### Summary of change request

The steward loop that replaced every person-typed `archon` command shipped across phases 05-09, and this round decides what closes the four gaps research 11 found: no end-to-end proof that a steward announces and resolves a gate, no automated test over the loop, a failure mode where the loop waits forever without saying anything, and Archon run worktrees that nothing reclaims.

### Current State

- A person who starts a run with `/deliver` never sees an `archon` command, and a pane or a session claims the run as its steward. Nobody has watched one announce a pause and resolve it from a person's words, inside Herdr or outside it; acceptance items (a), (b), and (c) rest on reading the skill, not on a run.
- A steward started from a directory that is not a git work tree reports nothing and never returns. It waits in silent ten-minute chunks against a run it cannot read, and the person is left with a pane that looks busy forever.
- A review pane opened for such a run opens at the literal path `null`, because the same unreadable response supplies the pane's directory.
- Runs the person abandons leave their worktrees on disk under `~/.archon/workspaces/`. Nothing removes them, and the person is not told they are there.
- Every change to the loop is checked only by `node scripts/validate.mjs` and `npm test`, neither of which exercises a gate. A future edit that breaks the announce-and-respond sequence passes both.

### Desired End State

- A steward that cannot read its run says so in one line, as cause and fix, and stops. No branch of the loop waits on a read that failed.
- A steward reads its run from wherever the person started it, because it names the run's own directory on each call once it knows it.
- One test file fails when the loop's state read branches wrongly or its respond call changes shape, so the next edit to step 6 is checked by `npm test` like everything else.
- The person has a written check for acceptance (a), (b), and (c) that one pass through a real run answers, and the answer is recorded in a verification artifact.
- Whether an abandoned run's worktree is this collection's business is settled, and written down either way.

### What we're not doing

- No new skill and no new `archon` subcommand. `archon workflow cleanup` does not exist in the CLI or in this repository (research 11, finding 6); nothing here invents it.
- No change to the by-hand handoff fence (`/<skill> @<file>`), the Stop hook, or `herd-next`'s handoff mode.
- No test framework, fixture harness, or mock beyond the two patterns `tests/` already uses.
- No re-litigating the loop's shape. Turn-driven pauses, bounded waits, `judge.mjs feedback-intent` mapping, and `deliver` owning the loop are settled in `03-design-discussion-steer-every-archon-gate.md` and implemented; see Resolved Design Questions.
- No reclamation of Archon's own workspace directories unless Design Question 5 decides otherwise.

### Proposed End State Architecture

Four gaps, each with the smallest change that closes it:

| Gap (research 11) | Where it lives | Proposed disposition |
|---|---|---|
| (a), (b), (c) unproved | agent behavior, not code | A written checklist run once against a live run; recorded in a verification artifact (DQ 1) |
| No automated coverage | `tests/` | One `tests/steward.test.mjs` over the loop's fenced bash and a fake `archon` (DQ 2) |
| Unreadable run read as a running run | `deliver/SKILL.md:69-79`, `herd-next/SKILL.md:91-98` | Guard the `get` exit status; carry `--cwd "$cwd"` after the first read (DQ 3, DQ 4) |
| Abandoned-run worktrees | nowhere | Out of scope, stated in prose (DQ 5) |

The failure the guard closes, observed on this machine at `4fb301c` against run `f9db22fa`:

```console
$ cd /tmp && archon workflow get f9db22fa-... --json; echo "exit=$?"
{ "ok": false, "error": "Error: Not in a git repository.\nThe Archon CLI must be run from within a git repository.\nEither navigate to a git repo or use --cwd to specify one. ..." }
exit=1
$ jq -r '.status' <<<"$run"
jq: parse error: Invalid string: control characters from U+0000 through U+001F must be escaped
```

`jq` fails on the error body's raw newlines, so `$status` is empty, and empty matches none of `completed`, `failed`, `cancelled`, or `paused`. The loop takes its running-run branch and waits.

```diff
 run=$(archon workflow get "$run_id" --json)
+[ $? -eq 0 ] || { report the error as cause and fix; stop }
 status=$(jq -r '.status' <<<"$run")
 cwd=$(jq -r '.working_path' <<<"$run")
```

and every later call in the loop names the directory the first read returned:

```diff
-archon workflow respond "$run_id" "$decision" "$text" --detach
-archon workflow wait "$run_id" --json --timeout 600 || true
+archon workflow respond "$run_id" "$decision" "$text" --detach --cwd "$cwd"
+archon workflow wait "$run_id" --json --timeout 600 --cwd "$cwd" || true
```

The test sits beside the two suites whose patterns it borrows:

```text
tests/
├── dispatch.test.mjs   # extracts a bash body from a pack, runs it under /bin/bash
├── wave.test.mjs       # fake `archon` on PATH logging argv
└── steward.test.mjs    # new: deliver step 6's fenced bash against a fake `archon`
```

### Design Questions

#### How acceptance (a), (b), and (c) get proved

Decide what counts as proof that a steward announces a pause and resolves it from plain language, inside Herdr and outside it.

- Option A: a written checklist in the verification artifact, run once by the person against a real `delivery-start` run forced to pause the way receipt 09 forced one (`09:18-105`). Proves the actual acceptance text; costs one manual pass and cannot be re-run in CI.
- Option B: an automated harness that fakes Herdr's pane primitives and drives a scripted reply through the loop. Re-runnable; proves the bash, not the agent behavior the acceptance items are written about, and `herdr` appears nowhere in `tests/` today (research 11, finding 4).
- Option C: both, split by half: Option A for the announce-and-decide behavior, Option B (as DQ 2) for the CLI sequence underneath it.

Recommendation: Option C. The acceptance items are agent behavior and receipt 09 already concluded they cannot be captured as command output (`09:137`), so the manual pass is unavoidable; the half that is bash is worth catching on every `npm test`.

#### Where the steward loop gets automated coverage

Decide what the new test reads as its source of truth.

- Option A: extract the fenced bash from `deliver/SKILL.md` step 6 by fence, the way `tests/dispatch.test.mjs:14-16` extracts a node body from `delivery-start.yaml`, and run it against a fake `archon` on `PATH` like `tests/wave.test.mjs:125-132`. No new source file; the test is tied to fence positions in prose and breaks when the prose is reordered.
- Option B: move the loop's bash into `skills/delivery/deliver/references/steward.sh` and test that file directly. Stable to test, and `validate.mjs:313-318` already requires every `references/<file>` a SKILL.md names to exist. Splits the loop's logic from the prose that explains it, and the skill then reads as a pointer rather than a procedure.
- Option C: no automated test; the loop stays prose and is checked by the manual pass alone.

Recommendation: Option A. Both halves of the mechanism exist in `tests/` already, no file moves, and a fence-anchored regex fails loudly rather than silently when the prose moves. Option B's split costs more than the fragility it buys back.

#### What the steward does when `archon workflow get` fails

Decide the guard's shape.

- Option A: check the exit status, report Archon's output as cause and fix, and stop. Matches step 4's existing rule for a failed dispatch ("reported as cause and fix, verbatim from Archon's output, and nothing is retried", `deliver/SKILL.md:52`). One failed read ends the steward even when the cause is transient.
- Option B: check the exit status and retry once before reporting. Survives a transient failure; the observed failure is a missing git work tree, which a retry from the same directory cannot fix.
- Option C: treat an unparsable body as the error it is, without reading the exit status. Equivalent in effect and harder to state in prose.

Recommendation: Option A, plus `--cwd "$cwd"` on every call after the first successful read. Reporting a broken read matches how the skill already handles a broken start, and `--cwd` removes the only cause the loop can fix on its own once it knows the run's path.

#### Whether `herd-next`'s gate mode shares the guard or repeats it

`herd-next/SKILL.md:91-98` repeats `deliver` step 6's seven-line state read verbatim and has the same defect: an unreadable response gives `$cwd` the literal string `null`, and the pane opens there.

- Option A: state the guard in both files, two lines each. Keeps each skill readable standalone, which is how every other shared step in this collection is written.
- Option B: state the read and the guard once in `shared/CONVENTIONS.md` and have both skills point at it. One place to change; adds a hop for a reader of either skill and puts skill mechanics in a document about conventions.
- Option C: guard only `deliver`, and let `herd-next` open the pane at a bad path.

Recommendation: Option A. Two lines duplicated is cheaper than the indirection, and the two readers differ: `deliver` loops, `herd-next` reads once. Option C is not viable; the pane is what the person sees first.

#### Whether abandoned-run worktrees are this collection's business

`archon workflow abandon` ends a run and leaves its worktree under `~/.archon/workspaces/` (research 11, finding 6). Nothing in this repository reclaims it, and no `cleanup` command exists.

- Option A: out of scope. State in `workflows/delivery.md` that Archon owns its workspace directories and the person removes them, the way `shared/CONVENTIONS.md:47` states it for by-hand task worktrees.
- Option B: the steward removes the worktree after it abandons a run on a stop intent. Tidy, but the steward would delete a directory that may hold the run's only uncommitted work, and it does not cover runs abandoned any other way.
- Option C: a script that lists stale run worktrees for the person to remove. New surface for a problem nobody has reported.

Recommendation: Option A. The task's acceptance items say nothing about worktrees, deleting a run's directory is not reversible, and one sentence closes the gap research 11 actually found, which is that the behavior is undocumented.

### Resolved Design Questions

#### The steward lives inside `deliver`, not in a new skill

Settled in `03-design-discussion-steer-every-archon-gate.md` and implemented in phases 1 to 4. `deliver` starts the run and continues as its steward; `/deliver --run <run-id>` attaches to a run whatever its status (`deliver/SKILL.md:14`); `herd-next`'s Archon gate mode is pane mechanics that submit that command (`herd-next/SKILL.md:107-110`). `EXPECTED_SKILL_COUNT` stays 42, and `npm test` passed 64/64 at every phase.

Alternative rejected there: a separate steward skill, which would have added a skill directory and a second place for the loop to drift from `deliver`'s routing.

#### One turn per gate, with bounded waits

Settled in 03 and implemented at `deliver/SKILL.md:81-109`. The loop announces the pause, ends the turn at the ask, maps the person's reply through `judge.mjs feedback-intent`, calls `archon workflow respond --detach`, and re-issues `archon workflow wait --timeout 600` in chunks. Receipt 09 confirmed the three CLI facts this depends on against live runs, including `wait --timeout` exiting 3 with `"result":"deadline"` on expiry.

#### `archon workflow get` is not constrained to the run's own worktree

Research 11's finding 5 carries receipt 09's claim that `get` "returns `null` fields when run from a directory outside the run's codebase" (`09:161`). That did not reproduce at `4fb301c`: the same run read correctly from a different worktree of this repository and from `~/Development/adt_mustr`, an unrelated git repository, returning `status`, `working_path`, and `metadata.approval.nodeId` in full. The boundary is a git work tree, not the run's codebase, and the CLI states its own fix in the error text: `--cwd` accepts any repository path and returns the same full response from `/tmp`.

This replaces the working-directory requirement DQ 3 would otherwise have had to write. Receipt 09's observation stands as what that phase saw; the version of the CLI it saw is not recorded, so the discrepancy is not resolved further here.

### Patterns to follow

#### Bash body extracted from a document and run under `/bin/bash`

`tests/dispatch.test.mjs` reads a pack file, pulls one node's bash body by regex, strips Archon's indentation, and runs it as a script with a controlled environment - `tests/dispatch.test.mjs:11-33`.

```javascript
function body(id) {
  return new RegExp(`  - id: ${id}\\n(?: {4}.*\\n)*? {4}bash: \\|\\n((?: {6}.*\\n|\\n)+?) {4}output_format:`).exec(PACK)[1].replace(/^ {6}/gm, "");
}
```

Target shape for the steward test, anchored on the fence instead of a node id:

```javascript
const SKILL = fs.readFileSync(path.join(REPO, "skills", "delivery", "deliver", "SKILL.md"), "utf8");
const fence = (marker) => SKILL.split("```bash").find((b) => b.includes(marker)).split("```")[0];
```

#### Fake `archon` on `PATH` that logs its argv

`tests/wave.test.mjs:125-150` writes a shell script named `archon` into a temp `bin`, prepends it to `PATH`, and asserts on the argv it logged. The same fake answers `get` with a fixture JSON body and records the `respond` call the loop makes.

#### Terminal reply templates are registered before they are named

`scripts/validate.mjs:37` holds `ANSWER_INVENTORY`; `deliver_gate_answer.md` and `deliver_ended_answer.md` are registered as `TERMINAL_ANSWER` there, and `validate.mjs:313-318` fails any SKILL.md naming a `references/<file>` that does not exist. Any new reference file added by the plan lands in both places in the same phase.

#### A failed Archon call is reported as cause and fix, never retried

`deliver/SKILL.md:52`: "Any other failure is reported as cause and fix, verbatim from Archon's output, and nothing is retried." DQ 3's guard follows the same sentence rather than inventing a second failure convention.

## Human Review

### Review targets

- Design Question 1: whether a manual checklist is acceptable proof for acceptance (a), (b), and (c), or whether this task stays open until a live Herdr pass runs.
- Design Question 2: Option A keeps the loop as prose in `deliver/SKILL.md` and tests it by fence extraction; Option B would move it to a `references/steward.sh` the skill points at.
- Design Question 5: whether abandoned-run worktrees stay out of scope with one documentation sentence.
- Resolved Design Questions, third entry: the correction to research 11's finding 5, and whether the discrepancy with receipt 09 needs chasing before the plan is written.

### Verify

- [ ] `cd /tmp && archon workflow get <a live run id> --json; echo $?` prints an `ok: false` body and exit 1, confirming the failure DQ 3 guards.
- [ ] The same command from any git repository, and from `/tmp` with `--cwd <any repo path>`, returns `status` and `working_path` in full.
- [ ] `grep -n 'archon workflow get' skills/delivery/deliver/SKILL.md skills/delivery/herd-next/SKILL.md` shows both call sites unguarded today, so DQ 4 has two places to change.
- [ ] `npm test` passes at `4fb301c` before any change from this design lands.

### Known limits

- Acceptance items (a), (b), and (c) stay unproved by this document; it decides how they get proved, not that they are.
- The correction in the third Resolved Design Question was observed against one `archon` build on one machine. Receipt 09 recorded the opposite behavior and did not record the CLI version it ran, so which build changed is unknown.
- No live paused run was available while this was written, so the `--cwd` flag was exercised against a `running` run only; its behavior on `respond` at a live gate is unverified.
- `judge.mjs` was not called for any routing or coverage judgment here: `TYPESAFE_API_KEY` is unset in this environment. Judgments were skipped and the readings above are this session's own.
