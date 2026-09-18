---
task: steer-every-archon-gate
type: plan
summary: "Implements the steward loop inside `deliver` in five phases: reply templates and their validator registration first, then `deliver/SKILL.md` gaining the `--run` attach mode, a step 4 that starts the run as a long-running process it never waits on and reads the run id from `archon workflow status --json`, and the turn-driven pause loop that waits in bounded chunks from the first phase on, then `herd-next`'s gate mode shrinking to pane mechanics plus `herdr agent prompt \"/deliver --run <id>\"`, then the `workflows/delivery.md` rows and the narrowed stage-not-submit rule, then a live scratch `delivery-start` run that records the paused JSON, the `respond --detach` call, and `wait --timeout`'s expiry exit code. Phases 1 to 4 are proved by `npm test` plus the acceptance (d) grep; phase 5 is the only one that needs a real Archon run, and it is where the three unconfirmed CLI facts in the design's Verify list are answered. No skill directory is added, so `EXPECTED_SKILL_COUNT` stays 42."
repo: herdr-plugin-delivery-flow
branch: herdr-plugin-delivery-flow
sha: e0676603fea48dae71c08855d1738ccd26ab3997
---

# Steer every Archon gate through prompts Implementation Plan

## Overview

A person steering an Archon delivery run never types an `archon` command. `deliver` becomes the steward: after it starts a run it stays with that run, announcing each pause in prose and mapping the person's plain-language answer to `archon workflow respond` itself. `herd-next` keeps only the pane mechanics and hands the pane to `/deliver --run <run-id>`.

## Current State Analysis

Three surfaces print a command for a person to run, and nothing watches for the second pause.

### Key Discoveries:

- `deliver_archon_answer.md:14` names `approve`, `reject`, and `wait` as the person's next steps; `deliver/SKILL.md:46` calls that reply terminal, so `deliver` stops working there.
- `herd_next_gate_answer.md:5` names `archon workflow respond <run-id> approve|reject` and states the watch ended at this pause.
- `herd-next/SKILL.md:86-90` blocks the caller's pane on `archon workflow wait "$run_id" --json` for the length of a phase; `:119-125` reports the respond command instead of staging it.
- `herd-next/SKILL.md:92-104` already reads the six `metadata.approval` fields the steward needs. No document declares that JSON shape, so phase 5's recorded output is the only confirmation.
- `judge.mjs:436-437` clamps anything below the decisive threshold to `revise`, so the bare word rejects a gate when the person asked a question. `--json` exposes `intent`, `suggested`, `confidence`, `probabilities`; the steward branches on `suggested`.
- `validate.mjs:322-327` discovers every `*answer.md` under a skill directory and requires it in `ANSWER_INVENTORY`; `:379-382` forbids a `TERMINAL_ANSWER` entry from carrying a fenced block, the `Next action:` label, or `Open a new session in `, and forbids it from `FENCE_ARTIFACT`.
- `validate.mjs:181-187` keeps `HUMAN_GATE_ANSWERS` to `create-*`/`iterate-*`, the implementation skills, `describe-pr`, `resolve-pr-reviews`, and `reproduce-bug`. A `deliver/references/*` file matches none of those, so the `{artifact_link}` and `Check:` checks do not reach the new templates.
- `validate.mjs:311-318` fails a `SKILL.md` that names a `references/<file>` that does not exist, so phase 2 must land after phase 1.
- `archon --version` on this machine is 0.10.1 and `--timeout <seconds>` is documented in its options as "For 'workflow wait': give up after N seconds (default: wait indefinitely)". The exit code on expiry is still unobserved.
- `.archon/workflows/delivery/start/delivery-start.yaml:80,129-130` sets `workflow=full; confident=false` when the routing helper does not answer, and `confirm=true` when `confident` is false and `gates` is not `none`. An unsure request with no key pauses at `confirm`.
- `tests/wave.test.mjs:54-73` is the scratch-repository pattern: `fs.mkdtempSync`, `git init -q -b main`, a commit, and a fixed `GIT_ENV`. Archon additionally needs a bare remote, because it cuts the run's worktree from the remote's base branch.

## Desired End State

`/deliver` inside Herdr leaves the person in a review pane whose agent has read the gated artifact and asked for a decision; outside Herdr the starting session does the same. `approve` or a sentence describing a change resolves the gate and the steward announces the next pause or the run's end. `grep -rn 'archon workflow' skills/*/references skills/*/SKILL.md` shows no line that tells a person to run a command. `npm test` passes.

## What We're NOT Doing

- No new skill, no new skill directory, and no change to `EXPECTED_SKILL_COUNT`, `.claude-plugin/plugin.json`, `README.md`, or `docs/getting-started.md`.
- No change to `judge.mjs`, the pack YAML, the gate nodes, or where a pause happens.
- No change to the by-hand handoff fence, which the Stop hook and `herd-next`'s handoff mode keep staging without submitting.
- No daemon. The run itself is a long-running process the agent starts and leaves running; nothing supervises it beyond the steward's own reads.

## Execution Strategy

Templates first, because `validate.mjs` fails a `SKILL.md` naming a reference file that does not exist. Then `deliver`, which is the only owner of the loop. Then `herd-next`, which can only lose its wait block once something else does the waiting. Then the documents. Phase 5 is last and is the only phase that needs a live Archon run; it answers the three CLI facts the design could not confirm from documents.

One plan-level decision the design left implicit: outside Herdr the first pause is announced by `deliver_archon_answer.md`, whose line 9 already carries a slot for "what that gate reviews and the artifact it points at". That slot is filled with the artifact's frontmatter `summary`, its `### Verify` list, and its `### Known limits` list, so the first pause reads the same as every later one. The template's line count does not change.

---

## Phase 1: Reply templates and their registration

### Goal

Every human-directed reply in the collection asks for words instead of a command, and `npm test` passes with the two new terminal templates registered.

### Required Edits:

#### 1.1 The ask sentence, stated once

**File**: `shared/CONVENTIONS.md`
**Changes**: Add a section after `## Human gate reply` (after line 90) so the two templates that carry the ask cannot drift.

```diff
+## Archon gate ask
+
+A reply that announces a paused Archon gate ends with this sentence, byte-exact:
+
+`Say `approve`, or say what should change.`
+
+The agent that printed it resolves the gate itself with `archon workflow respond`; the person never
+runs that command. A gate that declares a decision beyond `approve` and `reject` names it in the line
+above the ask.
```

#### 1.2 The pause announcement

**File**: `skills/delivery/deliver/references/deliver_gate_answer.md` (new)
**Changes**: Terminal template: no fenced block, no `Next action:` label, no `Open a new session in `.

```diff
+Run `<run-id>` paused at `<gate>`. <One sentence when a notification was raised inside Herdr; otherwise omit.>
+
+Gated artifact: `<path relative to the run's working_path>` - <its frontmatter `summary`>.
+
+Check:
+- <one line per item in the artifact's `### Verify` list>
+
+Known limits:
+- <one line per item in the artifact's `### Known limits` list>
+
+<One line naming any decision this gate declares beyond `approve` and `reject`, with one clause on what it does; otherwise omit.>
+
+Say `approve`, or say what should change. <One sentence when judgments were skipped; otherwise omit.>
```

#### 1.3 The ended states

**File**: `skills/delivery/deliver/references/deliver_ended_answer.md` (new)
**Changes**: One `<reason>` slot covering completed, failed, cancelled, and no paused gate.

```diff
+Run `<run-id>` <`completed`, `failed at <node>`, `was cancelled`, or `has no gate waiting`>: <Archon's own reason or end state, verbatim>.
+
+Branch `<branch>`, worktree `<the run's working_path>`. <One line naming the pull request or the last artifact the run left, when Archon printed one; otherwise omit.>
+
+Nothing is waiting on you here. <One sentence naming the one thing left, when there is one: the pull request to merge, or `/deliver --run <run-id>` after the run is resumed; otherwise omit.>
```

#### 1.4 The routing reply stops naming commands

**File**: `skills/delivery/deliver/references/deliver_archon_answer.md`
**Changes**: Line 9's artifact clause names the three things the person decides from; line 14 becomes the ask or the pane pointer.

```diff
-Run `<run-id>` on branch `<branch>`, worktree `<path Archon printed>`: <`paused at <gate>`, followed by what that gate reviews and the artifact it points at; or `completed`, ...>.
+Run `<run-id>` on branch `<branch>`, worktree `<path Archon printed>`: <`paused at <gate>`, followed by what that gate reviews, the gated artifact's path and its frontmatter `summary`, its `### Verify` list, and its `### Known limits` list; or `completed`, ...>.
```

```diff
-`archon workflow approve <run-id>` continues, `archon workflow reject <run-id> "<what should change>"` revises the artifact it paused on, `archon workflow wait <run-id>` blocks until the next pause or the end. <One sentence when judgments were skipped and the pack was picked by hand; otherwise omit.>
+<Outside Herdr, the ask, byte-exact: "Say `approve`, or say what should change." Inside Herdr, the pane pointer instead: "Review pane `<pane id>`, labelled `<slug>/<phase> gate`, working directory `<the run's working_path>`, is asking there; answer in that pane." Never both.> <One sentence when judgments were skipped and the pack was picked by hand; otherwise omit.>
```

Line 7 is left as it is: the started command in past tense is the run's provenance and instructs no one to type anything.

#### 1.5 The Herdr gate reply points at the pane

**File**: `skills/delivery/herd-next/references/herd_next_gate_answer.md`
**Changes**: Line 5 loses both respond commands and the "watch ended" sentence; line 3 loses the staged read, which the submitted attach command replaces.

```diff
-Review pane `<pane id>`, labelled `<slug>/<phase> gate`, working directory `<the run's working_path>`, running `<kind>` as `<agent name>`. Staged, not submitted: the read of `<artifact path>`.
-
-Decide from any pane once you have read it: `archon workflow respond <run-id> approve`, or `archon workflow respond <run-id> reject "<what should change>"`. <One line naming any decision beyond approve and reject that this gate declares; otherwise omit.> Rejecting reopens the gate after the iterate skill revises the artifact. This watch ended at this pause; a later gate in the same run needs `/herd-next --run <run-id>` again.
+Review pane `<pane id>`, labelled `<slug>/<phase> gate`, working directory `<the run's working_path>`, running `<kind>` as `<agent name>`. Submitted there: `/deliver --run <run-id>`, which reads the gated artifact and asks for your decision.
+
+Answer in that pane: say `approve`, or say what should change. Rejecting reopens the gate after the iterate skill revises the artifact. The agent in that pane stays with the run, so every later pause is announced there too.
```

Line 1 keeps `paused at <nodeId>`; when the run is running rather than paused it reads `is running` and the notification sentence is omitted (phase 3).

#### 1.6 The epic reply asks for words

**File**: `skills/delivery/start-epic-delivery/references/epic_delivery_final_answer.md`
**Changes**: Line 14 stops pointing at the printed commands as the person's path.

```diff
-Use the child commands above only in the manual cases described.
+With `children: manual`, or to start one child by hand, ask your agent to start that child; it runs the command above for you. The commands are printed as the record of what runs, not as something for you to type.
```

#### 1.7 Register the two new templates

**File**: `scripts/validate.mjs`
**Changes**: Two `TERMINAL_ANSWER` entries in `ANSWER_INVENTORY`, in the existing alphabetical order beside `deliver_archon_answer.md` (line 51). Nothing is added to `FENCE_ARTIFACT`; `:381` fails a terminal answer that appears there. `EXPECTED_SKILL_COUNT` stays 42.

```diff
   "deliver/references/deliver_archon_answer.md": TERMINAL_ANSWER,
+  "deliver/references/deliver_ended_answer.md": TERMINAL_ANSWER,
+  "deliver/references/deliver_gate_answer.md": TERMINAL_ANSWER,
   "deliver/references/deliver_hand_answer.md": DELIVER_VARIANTS,
```

### Success Criteria:

#### Automated Verification:

- [ ] `node scripts/validate.mjs`
- [ ] `npm test`
- [ ] `grep -rn 'archon workflow' skills/*/references` returns only `deliver_archon_answer.md:7`, the provenance line
- [ ] `grep -c 'Open a new session in \|Next action:' skills/delivery/deliver/references/deliver_gate_answer.md skills/delivery/deliver/references/deliver_ended_answer.md` reports `0` for both
- [ ] `grep -n 'Say `approve`, or say what should change\.' shared/CONVENTIONS.md skills/delivery/deliver/references/deliver_gate_answer.md skills/delivery/deliver/references/deliver_archon_answer.md skills/delivery/herd-next/references/herd_next_gate_answer.md` matches in all four files

human-gated: false

---

## Phase 2: `deliver` becomes the steward

### Goal

`deliver` attaches to a run with `--run <run-id>`, and after starting or attaching it stays with the run until it completes, fails, or is cancelled, one agent turn per gate.

### Required Edits:

#### 2.1 The description names the new behavior

**File**: `skills/delivery/deliver/SKILL.md`
**Changes**: Frontmatter `description` (line 3) and the intent paragraph (line 10).

```diff
-description: Run for /deliver requests, or when a person has a request and does not know which delivery pack or skill starts it. Route the request to a pack and an autonomy level, then start the `archon workflow run` and report its first pause or, without Archon, open the task directory and hand off to the chain's first skill.
+description: Run for /deliver requests, for `/deliver --run <run-id>`, or when a person has a request and does not know which delivery pack or skill starts it. Route the request to a pack and an autonomy level, start the `archon workflow run`, and then stay with the run as its steward: announce each pause, take the decision in plain language, and resolve it. Without Archon, open the task directory and hand off to the chain's first skill.
```

```diff
-With Archon it starts the run itself and waits for the first pause, so the user's next action is a gate decision, not a command to paste.
+With Archon it starts the run itself and then stays with it: at every pause it reads the gated artifact, asks for a decision in words, and runs `archon workflow respond` itself. The user never types an `archon` command.
```

#### 2.2 Step 1 splits on `--run`

**File**: `skills/delivery/deliver/SKILL.md`, step 1 (line 14)
**Changes**: Prepend the attach branch. Routing is skipped entirely.

```diff
+1. **Attach or take the request.** When the argument is `--run <run-id>` or a bare Archon run id, skip steps 2 to 5 and go to step 6 with that run id, whatever the run's status: the loop's first act is the `get` read, so a `paused` run is announced at once and a `running` run is waited on first. This is both what `herd-next` submits into a review pane and how a person re-enters a run whose steward was lost.
+
+   Otherwise take the request from the user's message, verbatim; strip a leading `/deliver`. ...
```

#### 2.3 Step 4's run outlives the reply

**File**: `skills/delivery/deliver/SKILL.md`, step 4's third bullet (line 44)
**Changes**: The start stops being a held foreground call. Nothing waits on the process, so the run id comes from the run list rather than from that process's output.

```diff
-   - Run it from the project root, in the foreground, with no shell timeout under an hour: the run works for minutes per phase and exits when it pauses at a gate or ends. Use the runtime's supervised long-running-process mechanism when it has one; otherwise the plain shell with the timeout raised. Never add `--detach`: Archon refuses it for a workflow that can pause. Archon prints the run id when it dispatches and "Workflow paused" with the gate name at a pause.
+   - Run it from the project root as a long-running process that outlives this reply: start it with the runtime's background or supervised long-running-process mechanism and never wait on it. No shell call is held for the length of a phase, here or later; step 6 does every read and every wait, in bounded chunks. Never add `--detach`: Archon refuses it for a workflow that can pause, and nothing here needs it, because the process is ours to leave running. Read the run id from the run list a few seconds after dispatch, taking the run whose `working_path` is the worktree for `<branch>`:
+
+     ```bash
+     archon workflow status --json | jq -r '.runs[] | "\(.id)\t\(.workflow_name)\t\(.status)\t\(.working_path)"'
+     ```
+
+     A dispatch that never appears in that list is a start failure: report Archon's output as cause and fix, and retry nothing.
```

#### 2.4 Step 4 hands to the steward instead of printing commands

**File**: `skills/delivery/deliver/SKILL.md`, step 4's last bullet (line 46)
**Changes**: Replace the terminal-reply bullet with two branches.

```diff
-   - Reply with `references/deliver_archon_answer.md`, every `<...>` slot filled: the run id, where the run stands ..., and the remaining pauses. The reply is terminal: the run is already going, so no skill command follows.
+   - Inside Herdr (`HERDR_ENV` is `1`): run `herd-next`'s Archon gate mode for this run id at once, without waiting for a pause; it opens the review pane at the run's `working_path` and submits `/deliver --run <run-id>` into it. Reply with `references/deliver_archon_answer.md`, its run line reading `is running` while the run has not paused yet and its last line filled with the pane pointer, and stop. The pane's steward owns every pause from here.
+   - Outside Herdr: go to step 6 now. The run is `running`, so the loop's running-run branch waits in bounded chunks for the first pause; this reply is `references/deliver_archon_answer.md` printed at that pause, its run line filled from the gated artifact's `summary`, `### Verify`, and `### Known limits` and its last line filled with the ask. Step 6's loop resumes on the user's answer.
+   - Either way the reply carries no command fence: the run is already going, so no skill command follows.
```

#### 2.5 Step 6, the steward loop

**File**: `skills/delivery/deliver/SKILL.md`, new step 6 after step 5
**Changes**: The whole loop, in one place. One agent turn per decision; the loop never reads the person's answer from inside a shell call.

````diff
+6. **Steward the run** until it completes, fails, or is cancelled. Entered from step 1's attach branch, or from step 4 outside Herdr. Right after step 4 the run is `running` and has not paused yet, so the loop takes the running-run branch below: bounded `wait` chunks until the first pause. No shell call is held for the length of a phase, the first one included.
+
+   Read the state; never guess a path or a decision id:
+
+   ```bash
+   run=$(archon workflow get "$run_id" --json)
+   status=$(jq -r '.status' <<<"$run")
+   cwd=$(jq -r '.working_path' <<<"$run")
+   node=$(jq -r '.metadata.approval.nodeId // empty' <<<"$run")
+   msg=$(jq -r '.metadata.approval.message // empty' <<<"$run")
+   decisions=$(jq -r '.metadata.approval.decisions[].id' <<<"$run")
+   resolved=$(jq -r '.metadata.approval.resolved // empty' <<<"$run")
+   ```
+
+   A gate is live only when `status` is `paused` and `resolved` is empty. `completed`, `failed`, and
+   `cancelled` print `references/deliver_ended_answer.md` and stop. The running-run branch, taken on
+   `running` or on `paused` with a non-empty `resolved`, waits in chunks (below) and reads again; it is
+   the branch taken on the first read after step 4 and after every respond.
+
+   Announce the pause. `$phase` is `$node` with a trailing `__cycle` stripped. The gated artifact is
+   the newest artifact of the phase's type in the task directory `$msg` names, resolved against `$cwd`;
+   read its frontmatter `summary`, its `### Verify` list, and its `### Known limits` list. Inside Herdr,
+   raise the notification first:
+
+   ```bash
+   herdr notification show "Gate: $slug/$phase" --body "$msg" --sound request
+   ```
+
+   Print `references/deliver_gate_answer.md` with every `<...>` slot filled and end the turn. The turn
+   ends with the ask; the person's reply starts the next turn.
+
+   Map the reply. A reply that is exactly one word matching an id in `decisions` is that id, with no
+   judgment call. Otherwise:
+
+   ```bash
+   a=$(node "$judge" feedback-intent --json - <<<"$reply") || a=''
+   intent=$(jq -r '.intent // "revise"' <<<"${a:-{\}}")
+   suggested=$(jq -r '.suggested // "unclear"' <<<"${a:-{\}}")
+   ```
+
+   `intent: proceed` is `approve`. `intent: revise` with `suggested: revise` is `reject`, with the
+   person's words as the text. `suggested: unclear`, or a `suggested` of `proceed` or `stop` that the
+   helper did not clear its own bar for, is one clarifying question naming the available ids, and no
+   decision is sent; the bare word clamps below the bar to `revise`, which would reject a gate because
+   the person asked what a phase does. `intent: stop` has no decision id: confirm once, in one
+   sentence, and only on a repeated statement run `archon workflow abandon "$run_id"` and print the
+   ended reply. A reply matching no declared id gets the clarifying question, never a guess.
+
+   Helper unavailable (no `node`, exit 3, any nonzero exit): read the reply yourself and say once in
+   the reply that judgments were skipped.
+
+   Resolve and wait. The decision returns at once and the wait is bounded, so no shell call is held
+   for the length of a phase:
+
+   ```bash
+   archon workflow respond "$run_id" "$decision" "$text" --detach
+   while :; do
+     archon workflow wait "$run_id" --json --timeout 600 || true
+     status=$(archon workflow get "$run_id" --json | jq -r '.status')
+     case "$status" in paused|completed|failed|cancelled) break ;; esac
+   done
+   ```
+
+   A chunk that expires is not a failure; the loop re-reads and re-issues. `--detach` is accepted here
+   because Archon refuses it only on a fresh launch of an interactive pack, not on a decision that
+   continues one. Then loop back to the state read.
````

#### 2.6 Rules and References

**File**: `skills/delivery/deliver/SKILL.md`, the `## Rules` and `## References` sections
**Changes**: Two rules, and both new reference files named so `validate.mjs:311-318` sees them.

```diff
+- No reply ever names an `archon` command for the person to run. The steward runs every command itself; the only `archon` line a reply carries is the started command in past tense, as the run's provenance.
+- One run per steward. `--run` takes one run id and the loop watches that run only.
```

```diff
-Read from this skill directory: `references/deliver_archon_answer.md`, `references/deliver_hand_answer.md`.
+Read from this skill directory: `references/deliver_archon_answer.md`, `references/deliver_gate_answer.md`, `references/deliver_ended_answer.md`, `references/deliver_hand_answer.md`.
```

### Success Criteria:

#### Automated Verification:

- [ ] `node scripts/validate.mjs`
- [ ] `npm test`
- [ ] `grep -n 'archon workflow' skills/delivery/deliver/SKILL.md` shows only the agent's own commands (`run`, `get`, `respond`, `wait`, `abandon`), none addressed to a person
- [ ] `grep -c 'deliver_gate_answer.md\|deliver_ended_answer.md' skills/delivery/deliver/SKILL.md` is at least 2
- [ ] `grep -n 'long-running process\|outlives' skills/delivery/deliver/SKILL.md` matches in step 4's run bullet
- [ ] `grep -n 'in the foreground' skills/delivery/deliver/SKILL.md` returns nothing
- [ ] `grep -n 'running-run branch' skills/delivery/deliver/SKILL.md` matches in step 6, naming it as the branch taken right after step 4

human-gated: false

---

## Phase 3: `herd-next`'s gate mode shrinks to pane mechanics

### Goal

The gate mode reads the run once, opens the pane at the run's `working_path`, and submits `/deliver --run <run-id>`. It holds no blocking wait and reports no decision command.

### Required Edits:

#### 3.1 The blocking wait goes

**File**: `skills/delivery/herd-next/SKILL.md`, lines 86-90
**Changes**: Delete the paragraph and its fence. Waiting belongs to the pane's steward.

```diff
-Block on the run in this pane. `--detach` is refused on a fresh launch of an interactive pack ... so `wait` is a foreground process and this pane is held while it runs:
-
-```bash
-archon workflow wait "$run_id" --json
-```
+Read the run once. This pane is never held: the steward in the review pane does the waiting.
```

#### 3.2 A run that is not paused opens a pane anyway

**File**: `skills/delivery/herd-next/SKILL.md`, line 104
**Changes**: A non-paused run is no longer a skipped reply.

```diff
-Any other `status`, or a non-empty `resolved`, means the run moved on: print the skipped reply with the reason `the run is not paused at a gate` and stop.
+`status` of `completed`, `failed`, or `cancelled` means the run is over: print the skipped reply with the reason `the run has ended` and stop. `running`, or `paused` with a non-empty `resolved`, still opens the pane: `$phase` is `run`, the notification is skipped because there is no gate to name, and the steward in the pane announces the pause when it arrives.
```

#### 3.3 Submit the attach command instead of staging a read

**File**: `skills/delivery/herd-next/SKILL.md`, lines 108-125
**Changes**: The `send-text` of the read becomes an `agent prompt` of the attach command, and the reported respond command goes.

```diff
 herdr notification show "Gate: $slug/$phase" --body "$msg" --sound request
 herdr agent start "$name" --kind "$kind" --pane "$pane"
 herdr pane rename "$pane" "$slug/$phase gate"
-herdr pane send-text "$pane" "Read $artifact and report whether it is ready to approve."
+herdr agent prompt "$name" "/deliver --run $run_id"
```

```diff
-The decision command is reported in the reply rather than staged in the same input line, because a pane holds one staged line at a time:
-
-```text
-archon workflow respond <run-id> <decision> "<what should change>"
-```
-
-`respond` is the general form and covers every id in `decisions[]`, including any a pack authored beyond `approve` and `reject`. The stage-not-submit rule is the one already stated for the handoff mode; the gate mode does not restate it.
+`agent prompt` without `--wait` returns on submission, so the gate mode does not block for the length of the run. The pane's `deliver` reads the gated artifact, announces the pause, and resolves every decision itself, including any id a pack authored beyond `approve` and `reject`. Submitting here records no approval, so the stage-not-submit rule does not reach this line.
```

#### 3.4 The stage-not-submit rule states its boundary

**File**: `skills/delivery/herd-next/SKILL.md`, step 8 (line 70)
**Changes**: Narrow the rule to what it protects.

```diff
-Step 8, stage or submit. `send-text` is the default and stages without Enter, which is what keeps "running the next command records approval" true.
+Step 8, stage or submit. `send-text` is the default and stages without Enter: a command that records approval is staged, never submitted, which is what keeps "running the next command records approval" true. A command that records no approval, such as the gate mode's `/deliver --run <run-id>`, may be submitted.
```

### Success Criteria:

#### Automated Verification:

- [ ] `node scripts/validate.mjs`
- [ ] `npm test`
- [ ] `grep -n 'archon workflow respond\|archon workflow wait' skills/delivery/herd-next/SKILL.md` returns nothing
- [ ] `grep -rn 'archon workflow' skills/*/references skills/*/SKILL.md skills/*/*/references skills/*/*/SKILL.md` shows no line that tells a person to run a command (acceptance (d))

human-gated: false

---

## Phase 4: The delivery document matches the skills

### Goal

`workflows/delivery.md` describes the steward loop, the `--run` attach mode, and the narrowed stage-not-submit rule.

### Required Edits:

#### 4.1 The `deliver` row

**File**: `workflows/delivery.md`, line 239
**Changes**: The row gains the steward loop and the attach mode; the phase table's four columns are unchanged.

```diff
-| deliver | none | no | by hand: routes a request to a pack and an autonomy level (`judge.mjs route-workflow`, `autonomy`), then starts `archon workflow run delivery-<pack>` in the foreground, waits for its first pause or its end, and reports the run id and the gate it stopped at; without Archon, opens the task worktree and the task directory in it and hands off to the chain's first skill |
+| deliver | none | no | by hand: routes a request to a pack and an autonomy level (`judge.mjs route-workflow`, `autonomy`), starts `archon workflow run delivery-<pack>` as a long-running process it never waits on and reads the run id from `archon workflow status --json`, then stays with the run as its steward: it announces each pause with the gated artifact's summary, Verify, and Known limits, maps the person's plain-language answer with `judge.mjs feedback-intent`, runs `archon workflow respond --detach` itself, and waits in bounded `wait --timeout` chunks until the next pause or the end. `/deliver --run <run-id>` attaches to an existing run and steers it from there; inside Herdr `herd-next` opens the review pane and submits that command. Without Archon, opens the task worktree and the task directory in it and hands off to the chain's first skill |
```

#### 4.2 The `herd-next` row

**File**: `workflows/delivery.md`, line 240
**Changes**: The gate mode no longer waits and no longer stages a read.

```diff
-...; with `--run <run-id>` it waits on an Archon run, notifies at the pause, and opens a review pane at the run's `working_path` with the gated artifact staged |
+...; with `--run <run-id>` it reads the run once, notifies when it is paused at a gate, opens a review pane at the run's `working_path`, and submits `/deliver --run <run-id>` into it, which steers every pause from there |
```

#### 4.3 The stage-not-submit rule

**File**: `workflows/delivery.md`, the "Running skills by hand" paragraph that states the rule (found with `grep -n 'records approval' workflows/delivery.md`)
**Changes**: Same narrowing as `herd-next/SKILL.md:70`: "a command that records approval is staged, never submitted".

### Success Criteria:

#### Automated Verification:

- [ ] `node scripts/validate.mjs` (check 10 still finds every delivery skill named, and the phase table's column header is unchanged)
- [ ] `npm test`
- [ ] `grep -n 'records approval is staged' workflows/delivery.md skills/delivery/herd-next/SKILL.md` matches in both

human-gated: false

---

## Phase 5: Prove the loop against a real paused run

### Goal

A real `delivery-start` run pauses at `confirm`, `respond --detach` resolves it and returns before the next pause, and the observed JSON, the respond call, and `wait --timeout`'s expiry behavior are recorded. This answers the three CLI facts no document declares.

### Required Edits:

#### 5.1 The scratch repository

**File**: none; run from a temporary directory following `tests/wave.test.mjs:54-73`, with the bare remote Archon needs to cut the run's worktree from.

```bash
set -eu
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null DO_NOT_TRACK=1
unset TYPESAFE_API_KEY || true
remote=$(mktemp -d); repo=$(mktemp -d)
git init -q --bare "$remote"
git init -q -b main "$repo"
printf 'fixture\n' > "$repo/README.md"
git -C "$repo" add . && git -C "$repo" -c user.email=t@t -c user.name=t commit -qm init
git -C "$repo" remote add origin "$remote"
git -C "$repo" push -q -u origin main
```

#### 5.2 Force the unconfident path

**Changes**: No `--input workflow=`, no key, and a request the router cannot place, so `delivery-start.yaml:80` sets `confident=false` and `:129` sets `confirm=true`. Do not lean on a particular `gates` value: the sibling branch at `:130` drops the `gates` term, so only the unsure request reads correctly on both.

```bash
cd "$repo"
archon workflow run delivery-start 'Make the thing better somehow' --branch scratch-steward
run_id=<the id Archon printed>
```

#### 5.3 Record the three unconfirmed facts

```bash
archon workflow get "$run_id" --json | tee /tmp/steward-paused.json | jq '{status, working_path, approval: .metadata.approval}'
archon workflow wait "$run_id" --json --timeout 5; echo "wait exit on expiry: $?"
archon workflow respond "$run_id" approve --detach; echo "respond exit: $?"
archon workflow get "$run_id" --json | jq -r '.status, (.metadata.approval.resolved // "unresolved")'
```

The six `metadata.approval` field names in the first output, the `wait --timeout` exit code and output on expiry in the second, and the `respond --detach` exit and its immediate return in the third go into the implementation receipt and the verification artifact verbatim. A `wait` exit code that a chunk expiry shares with a real failure changes step 6's loop: the `|| true` stays, and the `case "$status"` read is what the loop branches on, which is why the loop already re-reads rather than trusting `wait`'s exit.

#### 5.4 Clean up

```bash
archon workflow abandon "$run_id" || true
rm -rf "$repo" "$remote"
```

### Success Criteria:

#### Automated Verification:

- [ ] The run reaches `status: paused` with a non-empty `metadata.approval.nodeId` and an empty `resolved`
- [ ] `archon workflow respond "$run_id" approve --detach` exits 0 and returns before the run's next pause
- [ ] After the respond, `archon workflow get "$run_id" --json | jq -r '.status'` is no longer `paused` with an empty `resolved`
- [ ] `npm test`

#### Deferred human evidence (recorded, not a gate):

- Acceptance (a) and (c) inside Herdr: `/deliver` in a Herdr session leaves a review pane whose agent announces the first pause, and answering `approve` in that pane resolves the gate and announces the next pause. Recorded in the implementation receipt, since it needs a live Herdr workspace.
- Acceptance (b) outside Herdr: the same in the starting session. Recorded in the implementation receipt beside the phase 5 output.

human-gated: false

---

## Human Review

### Review targets

- Phase 2's step 6: the turn boundary (the turn ends at the ask, the reply starts the next turn) and the respond-then-poll shape inside one turn.
- Phase 2.3: the run is started and left running, its id read from `archon workflow status --json` rather than from the process's own output, so no call is held for the first phase either.
- The `suggested`-based branching in 2.5 and its clarifying-question fallback, which is what keeps a question about the artifact from rejecting the gate.
- Phase 1.4's decision to fill `deliver_archon_answer.md`'s existing run line with the artifact's summary, Verify, and Known limits, so the first pause outside Herdr reads like every later one.
- Phase 3.2: a `running` run now opens a pane labelled `<slug>/run` instead of printing a skipped reply.
- Phase 5's setup: the unsure request with no key and no `--input workflow=` is the only path that pauses on both `delivery-start` branches.

### Verify

- [ ] `npm test` passes after every phase, with `EXPECTED_SKILL_COUNT` unchanged at 42.
- [ ] `grep -rn 'archon workflow' skills/*/references skills/*/SKILL.md skills/*/*/references skills/*/*/SKILL.md` shows no line that tells a person to run a command; `deliver_archon_answer.md:7` remains as past-tense provenance.
- [ ] No shell call in `deliver` is held for the length of a phase: `grep -n 'in the foreground' skills/delivery/deliver/SKILL.md` returns nothing, step 4's run bullet names a long-running process that outlives the reply, and every wait is a `--timeout` chunk.
- [ ] Phase 5 records the six `metadata.approval` field names, the `respond --detach` exit, and `wait --timeout`'s exit code on expiry, verbatim, in the implementation receipt.
- [ ] The two new templates carry no fenced block, no `Next action:`, and no `Open a new session in `, as `validate.mjs:341-344` requires of a terminal answer.
- [ ] The ask sentence is byte-identical in `shared/CONVENTIONS.md`, `deliver_gate_answer.md`, `deliver_archon_answer.md`, and `herd_next_gate_answer.md`.

### Known limits

- `wait --timeout`'s exit code on expiry is unobserved until phase 5; step 6's loop is written not to depend on it, branching on the `get` status instead.
- No field-level JSON schema exists for `archon workflow get --json`. The steward reads the same six fields `herd-next` reads today, and phase 5's recorded JSON is the only confirmation.
- A session or pane that dies loses the steward while the run keeps going. Recovery is `/deliver --run <run-id>`; nothing here detects the loss.
- Acceptance (a), (b), and (c) inside Herdr cannot be checked by a command and are deferred human evidence in phase 5.
- Multiple concurrent runs are out of scope: one steward, one run id.
