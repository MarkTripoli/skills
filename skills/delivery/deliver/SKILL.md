---
name: deliver
description: Run for /deliver requests, for `/deliver --run <run-id>`, or when a person has a request and does not know which delivery pack or skill starts it. Route the request to a pack and an autonomy level, start the `archon workflow run`, and then stay with the run as its steward: announce each pause, take the decision in plain language, and resolve it. Without Archon, open the task directory and hand off to the chain's first skill.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Deliver

One command for a request whose pack is not yet chosen. You read the request, pick the pack and how many human gates it keeps, and hand the work to the engine that runs it: Archon when it is installed, the skills by hand otherwise. This skill implements nothing and writes no artifact; at most it opens the task directory. With Archon it starts the run itself and then stays with it: at every pause it reads the gated artifact, asks for a decision in words, and runs `archon workflow respond` itself. The user never types an `archon` command.

## Steps

1. **Attach or take the request.** When the argument is `--run <run-id>` or a bare Archon run id, skip steps 2 to 5 and go to step 6 with that run id, whatever the run's status: the loop's first act is the `get` read, so a `paused` run is announced at once and a `running` run is waited on first. This is both what `herd-next` submits into a review pane and how a person re-enters a run whose steward was lost.

   Otherwise take the request from the user's message, verbatim; strip a leading `/deliver`. When nothing remains, ask for the request in one sentence and stop until it arrives. The first line of the request is the task title.

2. **Route.** Run the typed-judgment helper twice with the request on stdin, where `<skills dir>` is the directory that contains this skill (in a checkout, `skills/delivery`):

   - `node <skills dir>/typed-judgment/judge.mjs route-workflow --json -` prints `{workflow, suggested, confidence, probabilities}`. `workflow` is already `full` when `confidence` is below 0.8; `suggested` is the raw pick.
   - `node <skills dir>/typed-judgment/judge.mjs autonomy --json -` prints `{autonomy, suggested, confidence}`; `autonomy` is one of `none`, `pr`, `plan`, `all`, already thresholded.

   Program rule: the helper never answers `program`. When `workflow` is `prd` and the request contains `prd` or `requirements` and also `epic`, `children`, `issues`, or `pull requests`, the pack is `program`. A request that names a pack outright (`program`, `bugfix`, ...) takes that pack at confidence 1.

   Autonomy to `gates`: `none` gives `none`, `pr` gives `pr`, `all` gives `all`, and `plan` gives the pack's planning gates: full `design,plan`; prd and program `prd,tdd,plan`; lean `outline`; bugfix `reproduce`; epic `plan`; oneshot `pr` (it has no plan gate).

   Helper unavailable (no `node`, exit 3, or any nonzero exit): pick the pack yourself from the table below, take autonomy `all` unless the request plainly asks for an unattended run or a single review point, record no confidence, and say once in the reply that judgments were skipped.

   | Pack | Use when |
   |---|---|
   | `oneshot` | Small change, stated expected behavior, a way to verify it, no design choice. |
   | `bugfix` | Observed behavior differs from expected and a reproduction is possible. |
   | `lean` | The shape is clear but several files and an ordering are involved. |
   | `full` | Competing approaches, cross-module impact, a migration, an interface others depend on, or a design review is asked for. |
   | `prd` | The requirement itself is open: what it should do, for whom, edge behavior; product-facing; stakeholders beyond the requester. |
   | `epic` | Several independently mergeable deliverables, work for more than one person, or more than about eight plan phases. |
   | `program` | A PRD that then splits into epic children with their own issues and pull requests. |

3. **Confirm when the pick is soft.** When `confidence` is below 0.8, or the two highest `probabilities` are within 0.2 of each other, or your own reading finds two packs that fit, ask the user one question: the top two packs with one clause each on why, and the autonomy level you will use. Continue with the answer; a named pack takes confidence 1. Otherwise ask nothing.

4. **With Archon** (`command -v archon` succeeds, `git rev-parse --is-inside-work-tree` succeeds, and `git remote get-url origin` prints a remote): compute the branch name and start the run; step 6 stewards it from there.

   - Branch: the request's first line, lower-cased, every character outside `a-z0-9` and space replaced by a space, split into words, the stop words `a an the to of for in on and or with that this add make create please fix bug` dropped, the first four words joined with `-`. When no word survives, take the first four words without dropping any; `task` when the line is empty. `epic` and `program` prefix the result with `epic-`, because `start-epic-delivery` refuses to run on `main`, `master`, or a detached `HEAD`. This is the rule the `delivery-task` node applies, so the branch and the task slug match.
   - Command: `archon workflow run delivery-<pack> --branch <branch> --input gates=<gates> '<request>'`, the request in shell single quotes with every `'` written as `'\''`. Add `--input app_test=<web|ios|android>` when the request asks for the running application to be tested on one of those surfaces, and `--input app_target=<url, bundle id, or package>` when it names one; `epic` and `program` take neither. Omit `--input gates=` only when `gates` is `all`, the default.
   - Run it from the project root as a long-running process that outlives this reply: start it with the runtime's background or supervised long-running-process mechanism and never wait on it. No shell call is held for the length of a phase, here or later; step 6 does every read and every wait, in bounded chunks. Never add `--detach`: Archon refuses it for a workflow that can pause, and nothing here needs it, because the process is ours to leave running. Read the run id from the run list a few seconds after dispatch, taking the run whose `working_path` is the worktree for `<branch>`:

     ```bash
     archon workflow status --json | jq -r '.runs[] | "\(.id)\t\(.workflow_name)\t\(.status)\t\(.working_path)"'
     ```

     A dispatch that never appears in that list is a start failure: report Archon's output as cause and fix, and retry nothing.
   - The command fails before dispatching when the worktree for `<branch>` is in use by an earlier run; its message names that run id. Attach to it by taking that run id into step 6 instead of starting a second run, and report that run. Any other failure is reported as cause and fix, verbatim from Archon's output, and nothing is retried.
   - Pauses: from the pack's gate list (full `design`, `plan`, `phases`, `pr`; lean `outline`, `phases`, `pr`; prd `prd`, `tdd`, `plan`, `phases`, `pr`; oneshot `pr`; bugfix `reproduce`, `pr`; epic `plan`; program `prd`, `tdd`, `plan`) keep the names `gates` leaves on; `none` leaves none. The pause the run stopped at comes first in the reply; the ones still ahead follow.
   - Inside Herdr (`HERDR_ENV` is `1`): run `herd-next`'s Archon gate mode for this run id at once, without waiting for a pause; it opens the review pane at the run's `working_path` and submits `/deliver --run <run-id>` into it. Reply with `references/deliver_archon_answer.md`, its run line reading `is running` while the run has not paused yet and its last line filled with the pane pointer, and stop. The pane's steward owns every pause from here.
   - Outside Herdr: go to step 6 now. The run is `running`, so the loop's running-run branch waits in bounded chunks for the first pause; this reply is `references/deliver_archon_answer.md` printed at that pause, its run line filled from the gated artifact's `summary`, `### Verify`, and `### Known limits` and its last line filled with the ask. Step 6's loop resumes on the user's answer.
   - Either way the reply carries no command fence: the run is already going, so no skill command follows.

5. **Without Archon**: open the task worktree, open the task directory in it, and hand off to the chain's first skill.

   - Open the worktree per the conventions' Task worktree section, with the branch from step 4 and the path `~/.agents/worktrees/<repo>/<slug>`. It is the default here for the same reason Archon uses one: the phases that follow commit code and artifacts on the task branch, and the checkout the user is in stays on its own branch. Ask nothing; the section names the cases that skip it.
   - Create `.agents/tasks/<slug>/task.md` in the worktree per the conventions (slug from the branch rule above, `-2`, `-3` suffix when the directory exists; no `epic-` prefix on a slug), with frontmatter `slug`, `title`, `workflow: <pack>`, `gates: <gates>`, `routed_by: deliver`, `route_confidence: <confidence>` (omit the line when the helper did not run), `created`, and the request as the body. `git add .agents/tasks/<slug>/task.md` and commit as `docs(task): open <slug>`, applying the conventions' `.gitignore` rule. Outside a git work tree, write the file, skip the worktree, and say both are uncommitted.
   - `{next_command}` is the chain's first skill: bugfix `/reproduce-bug`; oneshot `/review-code`; lean, full, and epic `/create-research-questions`; prd and program `/create-research`. For `oneshot` the reply first says the change is small enough to implement in this session: on the user's go, implement, verify, and commit it per the `ci-commit` conventions, then the review runs from the fence.
   - Reply with `references/deliver_hand_answer.md`, every `<...>` slot filled: the pack, its confidence, the autonomy level and gates, the worktree path and branch, the task directory, and the chain as the table in `workflows/delivery.md` lists it. Fill `{run_location}` in the handoff sentence with that same worktree per the conventions' placeholder rule (`` `<worktree path>` on branch `<branch>` ``, or `this checkout` when the worktree was skipped), so the next session opens where the task's commits and each `@<file>` handoff resolve. The gates that stay on are the replies the user reviews before pasting the next command; later phases are the skills the chain names.

6. **Steward the run** until it completes, fails, or is cancelled. Entered from step 1's attach branch, or from step 4 outside Herdr. Right after step 4 the run is `running` and has not paused yet, so the loop takes the running-run branch below: bounded `wait` chunks until the first pause. No shell call is held for the length of a phase, the first one included.

   Read the state; never guess a path or a decision id:

   ```bash
   run=$(archon workflow get "$run_id" --json)
   status=$(jq -r '.status' <<<"$run")
   cwd=$(jq -r '.working_path' <<<"$run")
   node=$(jq -r '.metadata.approval.nodeId // empty' <<<"$run")
   msg=$(jq -r '.metadata.approval.message // empty' <<<"$run")
   decisions=$(jq -r '.metadata.approval.decisions[].id' <<<"$run")
   resolved=$(jq -r '.metadata.approval.resolved // empty' <<<"$run")
   ```

   A gate is live only when `status` is `paused` and `resolved` is empty. `completed`, `failed`, and `cancelled` print `references/deliver_ended_answer.md` and stop. The running-run branch, taken on `running` or on `paused` with a non-empty `resolved`, waits in chunks (below) and reads again; it is the branch taken on the first read after step 4 and after every respond.

   Announce the pause. `$phase` is `$node` with a trailing `__cycle` stripped. The gated artifact is the newest artifact of the phase's type in the task directory `$msg` names, resolved against `$cwd`; read its frontmatter `summary`, its `### Verify` list, and its `### Known limits` list. Inside Herdr, raise the notification first:

   ```bash
   herdr notification show "Gate: $slug/$phase" --body "$msg" --sound request
   ```

   Print `references/deliver_gate_answer.md` with every `<...>` slot filled and end the turn. The turn ends with the ask; the person's reply starts the next turn.

   Map the reply. A reply that is exactly one word matching an id in `decisions` is that id, with no judgment call. Otherwise:

   ```bash
   a=$(node "$judge" feedback-intent --json - <<<"$reply") || a=''
   intent=$(jq -r '.intent // "revise"' <<<"${a:-{\}}")
   suggested=$(jq -r '.suggested // "unclear"' <<<"${a:-{\}}")
   ```

   `intent: proceed` is `approve`. `intent: revise` with `suggested: revise` is `reject`, with the person's words as the text. `suggested: unclear`, or a `suggested` of `proceed` or `stop` that the helper did not clear its own bar for, is one clarifying question naming the available ids, and no decision is sent; the bare word clamps below the bar to `revise`, which would reject a gate because the person asked what a phase does. `intent: stop` has no decision id: confirm once, in one sentence, and only on a repeated statement run `archon workflow abandon "$run_id"` and print the ended reply. A reply matching no declared id gets the clarifying question, never a guess.

   Helper unavailable (no `node`, exit 3, any nonzero exit): read the reply yourself and say once in the reply that judgments were skipped.

   Resolve and wait. The decision returns at once and the wait is bounded, so no shell call is held for the length of a phase:

   ```bash
   archon workflow respond "$run_id" "$decision" "$text" --detach
   while :; do
     archon workflow wait "$run_id" --json --timeout 600 || true
     status=$(archon workflow get "$run_id" --json | jq -r '.status')
     case "$status" in paused|completed|failed|cancelled) break ;; esac
   done
   ```

   A chunk that expires is not a failure; the loop re-reads and re-issues. `--detach` is accepted here because Archon refuses it only on a fresh launch of an interactive pack, not on a decision that continues one. Then loop back to the state read.

## Rules

- Never start a pack's phases by hand when Archon is present; the run is the whole deliverable. Start it once; a second start on the same branch is refused by Archon and is never attempted.
- The by-hand path opens a worktree every time, without asking. Only the cases the conventions' Task worktree section lists skip it.
- Route on the request alone: the helper receives the request text and nothing else. Do not read the repository to decide the pack.
- One question at most (step 3), and only when the pick is soft. A named pack or gate list in the request is final.
- `epic` stays `epic` and `prd` stays `prd`; `program` needs both a PRD word and a children word in the request, or the name itself.
- No emojis, no em dashes; the reply carries no tooling narration beyond the routing line.
- No reply ever names an `archon` command for the person to run. The steward runs every command itself; the only `archon` line a reply carries is the started command in past tense, as the run's provenance.
- One run per steward. `--run` takes one run id and the loop watches that run only.

## References

Read from this skill directory: `references/deliver_archon_answer.md`, `references/deliver_gate_answer.md`, `references/deliver_ended_answer.md`, `references/deliver_hand_answer.md`.
