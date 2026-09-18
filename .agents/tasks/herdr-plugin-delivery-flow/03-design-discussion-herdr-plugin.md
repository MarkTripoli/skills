---
task: herdr-plugin-delivery-flow
type: design-discussion
summary: "Proposes one new skill in `skills/delivery/` that carries a delivery phase's continuation into a fresh Herdr pane: the by-hand handoff fence a phase already prints becomes the command staged in a new sibling pane, and an Archon run's gate pause becomes a notification plus a review pane bound to the run id, with the run's worktree and paused gate read from `archon workflow get <run-id> --json` (`working_path`, `metadata.approval.nodeId`, `.bodyGateId`, `.message`, `.decisions`). The printed fence stays the fallback when Herdr is absent, and the next command is staged rather than submitted so approval stays human except when the run declares `gates=none`. All six decisions are resolved: the skill is invoked explicitly with an opt-in Stop hook snippet shipped in `references/`, it stages by default, it splits a sibling pane and moves to one tab per task on a second concurrent task, it covers the Archon gate end to end, it lives in `skills/delivery/` named for the action, and it inherits the caller's agent kind with an override. A later phase writes the skill and its validator bookkeeping."
repo: skills
branch: herdr-plugin-delivery-flow
sha: ea4c7ed669720df41a23884524159d9c0ae587b8
---

### Summary of change request

Continue a delivery task across phases inside Herdr without the human copying a command between sessions: each phase's successor opens in its own pane, already pointed at the artifact it must read.

### Current State

- Finishing a phase by hand ends with a printed instruction: open a new session, then paste `/<skill> @<artifact>`. The human opens the terminal, starts an agent, and pastes (`workflows/delivery.md:252`).
- Nothing tells the human that an Archon run has paused. The run sits at a gate until someone runs `archon workflow approve <run-id>`, and finding the run id means listing runs (`workflows/delivery.md:136-152`).
- Reviewing a gated artifact and steering the run happen in whatever pane the human is in; the artifact path is retyped from the reply.
- Nothing in the collection knows about Herdr. Panes carry no task or phase label, so a workspace running three tasks reads as three unlabelled agents.
- Context per phase is already correct and stays correct: each phase reads the task directory, not the previous conversation. The cost is manual, not contextual.

### Desired End State

- Ending a phase inside Herdr opens the next phase in its own pane, in the same working directory, with the exact `/<skill> @<artifact>` command already in its input line; focus stays where the human is working.
- A paused Archon gate raises a Herdr notification and opens a pane bound to that run: the pane's cwd is the run's own worktree, the staged commands name the artifact to review and the `approve`/`reject` command for that run id, and every one of those values is read from `archon workflow get <run-id> --json` rather than guessed.
- Panes carry the task slug and phase, so a workspace with several delivery tasks is readable.
- Approval remains an act: the next command is staged, not submitted, unless the human asked for an unattended chain.
- Outside Herdr, every phase behaves exactly as it does today: the printed fence, and no error.

### What we're not doing

- No change to the phase skills, their artifacts, their answer templates, or the handoff contract in `shared/CONVENTIONS.md`.
- No change to the Archon packs: continuation inside a run stays Archon's job, and the design only observes and steers a run from outside.
- No new automation of the review itself. Herdr opens the pane; a human still reads the artifact and decides.
- No Herdr support for Oh My Pi and Pi hook callbacks in this pass (in-process JS extensions, a different integration shape; research Finding 8).
- No cross-machine control. Herdr ids are per-server, and remote sessions are out of scope.

### Proposed End State Architecture

The continuation instruction already exists in machine-readable form: the handoff fence holds exactly one `/<skill> @<file>` line, and `scripts/validate.mjs` enforces that shape on every answer template (`scripts/validate.mjs:275-292`). The new skill consumes that line; it does not re-derive the chain.

```mermaid
sequenceDiagram
    participant A as phase agent (pane w1:p1)
    participant S as herd skill
    participant H as herdr CLI
    participant B as next phase (pane w1:p2)
    A->>A: saves artifact, prints /create-plan @04-plan.md
    A->>S: invokes the skill (or a Stop hook does)
    S->>H: pane split --current --direction right --cwd $PWD --no-focus
    H-->>S: .result.pane.pane_id
    S->>H: agent start <slug>-plan --kind <caller kind> --pane w1:p2
    S->>H: pane send-text w1:p2 "/create-plan @04-plan.md"
    Note over B: command staged; human presses Enter
```

Two modes in one skill:

| Mode | Input | Does |
|---|---|---|
| by-hand handoff | the `/<skill> @<file>` line from the reply that just ended, plus the task directory | splits a sibling pane, starts an agent of the caller's kind, labels it `<slug>/<phase>`, stages the command |
| Archon gate | a run id | `archon workflow wait <run-id> --json` in the foreground, then `herdr notification show`, then a pane opened at the run's `working_path` whose staged commands are the artifact read and `archon workflow respond <run-id> <decision>` |

Archon's run state is machine-readable, so the gate mode reads it rather than deriving it. `archon workflow get <run-id> --json` returns `working_path` (the run's worktree) and a `metadata.approval` object carrying `nodeId` (`design__cycle`, `plan__cycle`, ...), `bodyGateId`, `message` (which names the task directory), `decisions[]` (`approve`, `reject`, and any pack-authored extras), and `resolved`; `archon workflow status --json` returns `.runs[]` with `id`, `workflow_name`, `status`, and `working_path`, which is how the skill finds the run id without being handed one. Verified against the installed CLI on 2026-09-17; research Finding 3 recorded that `workflows/delivery.md` documents no field schema for this JSON, which is a gap in the repo's prose, not in the command.

`--detach` is refused on a fresh launch of an interactive pack, and the delivery packs declare `interactive: true` (`workflows/delivery.md:147`). So the gate mode never backgrounds a run: it starts or waits on one as a foreground process in its own pane, which is the reason that pane exists.

New files, no manifest surgery: `scanSkills()` discovers any directory holding `SKILL.md` and `buildRuntime()` copies it per runtime, so installation needs no new code (`scripts/lib/layout.mjs:12-51`, research Finding 6).

```text
skills/
├── delivery/            # grouped with the phases it serves; needs a phase-table row
│   └── herd-next/       # working name; named for the action, not the product
│       ├── SKILL.md
│       └── references/
│           ├── stop_hook.sh        # opt-in Claude Code Stop hook snippet
│           └── *_answer.md         # terminal reply; must be registered in ANSWER_INVENTORY
└── show-me/             # precedent: a standalone, by-hand skill
```

The skill's first act is the guard the Herdr skill requires, `test "${HERDR_ENV:-}" = 1`; a failed guard prints the ordinary handoff and stops, which is what keeps the collection usable outside Herdr.

### Design Questions

None. Every decision below is settled; the implementation phase needs no further input.

### Resolved Design Questions

#### What triggers the pane

An explicit invocation of the skill, with the hook automation shipped as an opt-in snippet - the skill runs in all four runtimes and mutates nothing the user owns, and the hook is there for anyone who wants it without the installer deciding for them.

The skill is called (`/<herd skill>`) at the end of a phase, by the agent or the human. `references/stop_hook.sh` holds a Claude Code `Stop` hook that does the same thing unprompted: its stdin carries `last_assistant_message`, which holds the printed fence (research Finding 5). The user installs that snippet by hand; the installer never writes `~/.claude/settings.json`, and the collection ships no `hooks` block (`.claude-plugin/plugin.json:1-57`).

Rejected: the hook alone, because it is Claude-Code-and-Codex shaped and would make the installer edit a file the user owns. A pane watcher that scrapes a neighbouring agent's output, because an agent on the terminal's alternate screen loses rows to no scrollback, so the fence may simply not be there to read.

#### Stage the command or submit it

Stage by default, submit only when the run has already declared it is unattended - staging is what keeps "running the next command records approval" a true sentence in every gate reply.

`herdr pane send-text` writes text without pressing Enter; `herdr agent prompt` submits. The skill uses `send-text` unless the caller passes an explicit unattended flag or the task's Archon `gates` input is `none`, in which case the chain was already asked to run without human gates and submitting changes nothing.

Rejected: always submitting, because auto-submitting a handoff is exactly the approval the gate exists to collect. Always staging, because `gates=none` is a mode this collection already supports and a staged command in an unattended chain just stalls it.

#### Pane topology per task

A sibling pane in the current tab, promoted to one tab per task as soon as a second task's phase wants a pane in the same tab - it matches the Herdr skill's own default and creates no layout the human did not ask for until concurrency forces it.

Split right for a wide pane, down for a tall one. When the skill finds an existing pane in the tab already labelled for a different task slug, it creates a tab for the new task instead of crowding the current one. Epic children running in parallel are the one case for a Herdr worktree workspace per task (`herdr worktree create --branch <slug>`), which mirrors how Archon already isolates a run.

Rejected: tab-per-task unconditionally, which adds a layout object to create and close for the common single-task case. Workspace-per-task unconditionally, which is the heaviest option and moves the human out of the checkout they were working in.

#### How much of the Archon flow is in scope

The full gate mode: notification plus a review pane bound to the run id, staging the artifact read and the decision command - the pain in an Archon run is not pasting a command, it is noticing the pause and finding the run id.

This is affordable because the run state is machine-readable: `status --json` gives `.runs[]` with `id`, `workflow_name`, `status`, and `working_path`; `get <run-id> --json` gives `working_path` for the pane's cwd and `metadata.approval` (`nodeId`, `bodyGateId`, `message`, `decisions[]`) for the phase label, the task directory named in the gate message, and the exact decisions to stage. Because `--detach` is refused on a fresh launch of an interactive pack (`workflows/delivery.md:147`), the run or the `wait` occupies the pane as a foreground process.

Rejected: by-hand handoff only, which leaves untouched the flow `workflows/delivery.md` presents as primary. Notification without a pane, which tells the human a run paused and then makes them go find where.

#### Where the skill lives and what it is called

`skills/delivery/<name>`, named for the action - the skill only makes sense inside the delivery flow, and the phase table is where a reader looks for it.

Placement in `skills/delivery/` makes the validator require a row in the `workflows/delivery.md` phase table (`scripts/validate.mjs:388-391`), which is correct: the row carries "Runs in: by hand", the column `gather-sources`, `record-evidence`, and `show-me` already use. The working name is `herd-next`; it is a label, swappable at implementation with no design consequence, but it must not be `herdr`, which is taken by the Herdr-shipped skill (`herdr --skill`) that this one references rather than duplicates. Either way `EXPECTED_SKILL_COUNT = 41` (`scripts/validate.mjs:20`) is bumped and `node scripts/sync-plugin.mjs` regenerates the manifest.

Rejected: a standalone `skills/<name>` like `skills/show-me`, which skips the phase-table row and reads as a general tool - wrong, because the skill's only input is a delivery handoff fence or an Archon delivery run.

#### Which agent kind starts in the new pane

Inherit the caller's kind, with an explicit override, and ask rather than guess when the read fails - the chain should continue in the agent the human chose.

`herdr agent start` requires `--kind` from a fixed list (`claude`, `codex`, `omp`, `pi`). The skill reads the current kind from `herdr agent get --current` or `herdr pane process-info --current`, accepts an explicit `--kind` that wins over the read, and asks when neither is available.

Rejected: hardcoding `claude`, which silently switches runtimes mid-chain for a Codex or Pi user. Requiring `--kind` every time, which adds an argument the skill can almost always answer itself.

### Patterns to follow

#### A dispatching skill that writes no artifact

`deliver` routes a request, prints a command, and saves nothing but a task directory - `skills/delivery/deliver/SKILL.md`. Its reply templates live in `references/` and are registered in the validator's inventory (`scripts/validate.mjs:51-52`). The herd skill has the same shape: it acts on the environment and writes no artifact.

```text
skills/delivery/deliver/references/deliver_archon_answer.md   # terminal reply, no command fence
skills/delivery/deliver/references/deliver_hand_answer.md     # hands off to the chain's first skill
```

#### Capability guard before any control command

The Herdr skill's own first rule, which this skill repeats verbatim so that a non-Herdr session degrades instead of failing:

```bash
test "${HERDR_ENV:-}" = 1
```

#### Read ids from JSON, never predict them

```bash
pane=$(herdr pane split --current --direction right --cwd "$PWD" --no-focus | jq -r .result.pane.pane_id)
herdr agent start "$name" --kind "$kind" --pane "$pane"
herdr pane send-text "$pane" "/create-plan @04-plan-<slug>.md"
```

Archon's run state is read the same way; the gate mode never guesses a worktree or a decision id:

```bash
run=$(archon workflow get "$run_id" --json)
cwd=$(jq -r .working_path <<<"$run")                          # pane cwd
node=$(jq -r .metadata.approval.nodeId <<<"$run")             # design__cycle -> phase label
jq -r '.metadata.approval.decisions[].id' <<<"$run"           # approve, reject, pack extras
```

#### The fence is the contract

One `text` fence holding one `/<skill>[ @<file>]` line, with nothing after it, enforced for every answer template - `scripts/validate.mjs:275-292`. Parse that line; do not rebuild the phase chain in the skill.

#### Skill file shape the validator requires

Frontmatter keys exactly `name`, `description`; line 6 is the shared writing-guide sentence; every `references/<file>` named in the body exists - `scripts/validate.mjs:222-256`.

## Human Review

### Review targets

- The two decisions that change what a human is on the hook for: staging rather than submitting (submitting a handoff is approving it), and shipping the `Stop` hook as a snippet the user installs rather than something the installer writes.
- The scope call that the gate mode is worth its weight now that the run state reads cleanly out of `get --json`.
- The skill's placement in `skills/delivery/`, which commits a later phase to a `workflows/delivery.md` phase-table row on top of the count bump and manifest regeneration.

### Verify

- [ ] Confirm in a scratch pane that `herdr pane send-text <pane> "<text>"` stages text without submitting it, and that a started agent accepts staged text before its first turn.
- [ ] Confirm whether a Claude Code plugin may ship hook configuration, which decides only whether the snippet can become a documented plugin option later - not the trigger decision itself.
- [ ] Confirm the caller's agent kind is readable from `herdr agent get --current` or `herdr pane process-info --current` on this machine.
- [ ] Confirm `npm test` passes after a placeholder skill directory is added with `EXPECTED_SKILL_COUNT` bumped and `node scripts/sync-plugin.mjs` run.
- [ ] Confirm `metadata.approval` is present on a run that is *currently* paused, not only on one that has already resolved a gate - both runs observed on 2026-09-17 carried a `resolved` value.

### Known limits

- `workflows/delivery.md` documents no field schema for `get --json` (research Finding 3); the fields this design reads were verified against the installed CLI, so a future Archon release could move them without the repo's prose noticing.
- `--detach` is refused on a fresh launch of an interactive pack, so the gate mode holds a pane for the foreground run or `wait` rather than polling from anywhere.
- Reading a finishing agent's printed fence from another pane can fail: rows leaving the terminal's alternate screen do not enter Herdr's scrollback. This is why the trigger is an invocation, not a watcher.
- Oh My Pi and Pi expose in-process extension callbacks rather than shell hooks, so the opt-in hook covers Claude Code and Codex only; the skill invocation covers all four.
- Herdr ids and agent names are scoped to one server; nothing here works across machines.
