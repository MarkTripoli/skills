Task: [`steer-every-archon-gate`](.agents/tasks/steer-every-archon-gate/task.md)

## Purpose

Every Archon gate was answered by a person pasting `archon workflow approve|reject|respond|wait`; `deliver` now stays with the run it starts as a steward that announces each pause from the gated artifact, takes the decision in plain language, and runs `archon workflow respond` itself, so no reply in the collection names a command for a person to type.

## Acceptance criteria

- (a) `/deliver` inside Herdr leaves a review pane whose agent announces the first pause: **untested**. Step 4 calls `herd-next`'s gate mode, which now submits `/deliver --run <run-id>` into the pane instead of staging an artifact read, and every primitive it calls exists in the installed `herdr` (verification A14). Opening a pane with a live agent in the person's own workspace was not done in any session of this task (verification A1, A15).
- (b) The same outside Herdr, in the starting session: **untested** for the same reason (verification A2). Its CLI half is decided by A3, A4, A6, and A8; its template half by A10.
- (c) Saying `approve` or describing a change resolves the gate and the steward moves on: **passes** against two live scratch runs. `respond approve --detach --cwd` on run `6bd7f01d` flipped `resolved` to `approved` and dispatched the routed `delivery-full` child; `respond reject "lean, outline"` on run `6d86fa7a` flipped it to `rejected` and the child dispatched was `delivery-lean` (verification A3, A4).
- (d) No line tells a person to run an `archon` command: **passes**. `grep -rn 'archon workflow' skills/` returns 15 lines in 5 files, every one a command a skill runs inside its own fence, plus `deliver_archon_answer.md:7` as past-tense provenance under `Started from the project root:` (verification A10). The criterion's own glob, `skills/*/references skills/*/SKILL.md`, matches no file in this repository, so it passes vacuously; the check that means anything is the recursive grep.
- (e) `npm test` passes: **passes**, `tests 71 / pass 71 / fail 0`, re-run on `92d86b0`.
- (f) Prove (c) against a real paused run and record the JSON and the respond call: **passes**. Two `delivery-start` runs on a scratch repository with a bare remote paused at `confirm`; the observed `get --json` body and both respond calls are in [19-verification](.agents/tasks/steer-every-archon-gate/19-verification-steer-every-archon-gate.md) rows A3, A4, and A6.

## Special things to note

- The steward is skill prose and bash fences, not a program. There is no loop construct: a `wait --timeout 600` chunk that expires is a fresh shell call of the same three lines, so no shell call is ever held for the length of a phase. `tests/steward.test.mjs` extracts the fences from the two skill bodies by marker and runs them against a fake `archon`, so `npm test` proves the argv and the branching, not the CLI's behavior; the CLI's behavior is proved only by one session's live observations.
- Every call after the first read carries `--cwd "$cwd"`, the run's own `working_path`. Without it a steward started from a different directory reads nothing; with it, `get`, `wait`, and `respond` were all run from outside the run's worktree and worked (verification A8).
- `intent: stop` runs `archon workflow cancel` before `abandon`, and the reply is printed only after the step-4 dispatch process is also ended. `abandon` alone marks the run cancelled while the detached continuation the last `respond --detach` created keeps working.

## Change outline

```text
skills/delivery/deliver/SKILL.md            step 1 --run attach; step 4 background dispatch,
                                            hand to the pane or to step 6; step 6 the steward loop
  references/deliver_gate_answer.md         new: pause announced, ends with the ask
  references/deliver_ended_answer.md        new: completed, failed at <node>, was cancelled
  references/deliver_archon_answer.md       run line gained `is running`
skills/delivery/herd-next/SKILL.md          gate mode: no foreground wait, guarded read,
                                            submits /deliver --run; a still-blocked agent
                                            closes its pane and prints the skipped reply
shared/CONVENTIONS.md                       new "Archon gate ask" section, the byte-exact ask
scripts/validate.mjs                        two TERMINAL_ANSWER rows; the ask sentence is read
                                            out of CONVENTIONS.md and required in three replies
workflows/delivery.md                       deliver and herd-next rows; who removes a dead run's worktree
start-epic-delivery/references/epic_delivery_final_answer.md   child start commands are a record, not a to-do
typed-judgment/judge.mjs                    apiKey() reads no file when HOME and XDG_CONFIG_HOME are both unset
tests/steward.test.mjs                      new, 7 cases against a fake archon
```

The loop in step 6, entered from the `--run` attach, from step 4 outside Herdr, or from step 4 inside Herdr when no pane opened:

```text
get --json                      || report Archon's output and stop
  run_status, cwd, node, msg, decisions, resolved      never guessed
paused and resolved empty?
  no  -> completed|failed|cancelled -> deliver_ended_answer.md, stop
         running                    -> wait chunk, read again
  yes -> read the newest artifact of $node's type under $msg, resolved against $cwd
         notification show (inside Herdr)
         deliver_gate_answer.md: summary, ### Verify, ### Known limits, the decisions
         end the turn on the ask
one word matching a decision id    -> that id
otherwise judge.mjs feedback-intent
  proceed -> approve        revise -> reject, the person's words as the text
  unclear -> one clarifying question, nothing sent
  stop    -> confirm twice, cancel then abandon, end the dispatch process
respond --detach --cwd          || report and stop, before the wait
wait --timeout 600 --cwd; get; run_status                loop back
```

What changed at the handoff between the two skills:

```diff
 herd-next --run <run-id>
-  archon workflow wait <run-id> --json        foreground, holds the caller's pane
-  pane send-text "Read <artifact> and report whether it is ready to approve."
-  reply reports `archon workflow respond ...` for the person to run
+  archon workflow get <run-id> --json         one read, guarded; the pane is never held
+  agent prompt "/deliver --run <run-id>"      submitted: it records no approval
+  the pane's deliver owns every pause from here
```

`herd-next` is called right after dispatch, before any pause, so the pane's `deliver` waits for the first gate itself. When its reply opens with `No pane was opened`, `deliver` stewards inline in the starting session instead; that fallback is why a still-blocked agent now closes its pane rather than reporting a submission that never happened.

## Human Review

### Review targets

- `skills/delivery/deliver/SKILL.md` step 6: the guards. A `get`, a `respond`, a `cancel`, or an `abandon` that exits nonzero must end the steward. Outside a git work tree `get --json` prints a well-formed `ok: false` body, `jq` parses it, and `$run_status` becomes the string `null`, so an unguarded read waits forever on a run it cannot read.
- The two state reads in `deliver/SKILL.md:70-76` and `herd-next/SKILL.md:92-98`: they are duplicated on purpose and must stay identical apart from list indentation.
- `scripts/validate.mjs`: the gate-ask check reads the sentence out of `shared/CONVENTIONS.md`'s own fence rather than holding a copy, and its fence lookup is bounded by the next `## ` heading so a dropped fence fails instead of adopting the next one in the file.

### Verify

- [x] `npm test` exits 0 with `tests 71 / pass 71 / fail 0` (re-run on `92d86b0`).
- [x] `node scripts/validate.mjs` exits 0 with `ok: 42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens` (`28-code-review-fixes`).
- [x] `grep -rn 'archon workflow' skills/` shows no line addressing a person (verification A10, re-checked in `28-code-review-fixes`).
- [ ] Acceptance (a), (b), and plan 13's checklist steps 3 and 4: start a real run with `/deliver` inside a Herdr workspace and confirm the review pane opens at the run's `working_path`, labelled `<slug>/<phase> gate`, with its agent announcing the pause unprompted and no `archon` command in any reply.
- [ ] The same run outside Herdr: the starting session prints `deliver_gate_answer.md` and ends on the ask.

### Known limits

- Acceptance (a) and (b) are untested, and this is the one item four review rounds left open (ADV-402 in `28-code-review-fixes`). Deciding them means opening a pane with a live agent in the person's own workspace, which this collection's conventions require confirming first.
- The steward's recovery from a lost session is the person re-running `/deliver --run <run-id>`; nothing restarts it on its own, and a run whose steward died stays paused until someone attaches.
- `deliver/SKILL.md:79` states the cause of the failure its guard prevents; the behavior is right and the guard fires on the nonzero exit, but the sentence describes the parse, not the exit (verification Review targets).
- The branch carries three earlier tasks as well as this one. Their descriptions stay on the branch: [herdr-plugin-delivery-flow](.agents/tasks/herdr-plugin-delivery-flow/pr-description.md) (the `herd-next` skill and its Stop hook), [i-m-curious-what](.agents/tasks/i-m-curious-what/pr-description.md) (review-loop judgments), and [describe-pr-title-rule](.agents/tasks/describe-pr-title-rule/pr-description.md).
- `.gitignore` gained `.backups/` and `/.ignore`, two local scratch paths an earlier review flagged as untracked at the repository root.
