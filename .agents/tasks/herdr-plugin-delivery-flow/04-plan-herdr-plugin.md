---
task: herdr-plugin-delivery-flow
type: plan
summary: "Adds one skill, `skills/delivery/herd-next/`, in three phases: Phase 1 ships the by-hand handoff mode (guard, caller-context read, sibling split or new tab, agent start, pane label, staged command) with two terminal answer templates, the `workflows/delivery.md` phase-table row, `EXPECTED_SKILL_COUNT` 41 to 42, and a regenerated plugin manifest; Phase 2 adds the Archon gate mode (`wait`, notification, review pane at the run's `working_path`, staged decision command) and a third answer template; Phase 3 ships the opt-in Claude Code `Stop` hook snippet and the documentation rows. Two facts from the design are corrected against the installed CLI and must be implemented as written here: `herdr agent get --current` does not exist, so the caller's agent kind reads from `herdr pane current --current | jq -r .result.pane.agent`, and the split direction reads from the caller's own `rect` inside `herdr pane layout`. Every phase ends green on `npm test`."
repo: skills
branch: herdr-plugin-delivery-flow
sha: f1ca1ae8fa8ef1e8fb2a682e6b5585061d2a3306
---

# Herdr delivery-flow skill Implementation Plan

## Overview

One new skill, `herd-next`, carries a delivery phase's continuation into a fresh Herdr pane. It parses the `/<skill> @<file>` line the finishing phase already printed, splits a sibling pane, starts an agent of the caller's kind in it, labels it `<slug>/<phase>`, and stages the command without pressing Enter. A second mode watches an Archon run, raises a notification when the run pauses at a gate, and opens a review pane at the run's own worktree with the artifact read and the decision command staged.

## Current State Analysis

The continuation instruction is already machine-readable. `scripts/validate.mjs:275-292` enforces that every answer template ends with exactly one `text` fence holding exactly one `/<skill>[ @<file>]` line, with nothing after it. The skill parses that line; it does not rebuild the phase chain.

### Key Discoveries:

- `scanSkills()` discovers any directory holding `SKILL.md` one level under a group directory, so a new `skills/delivery/herd-next/` needs no manifest code (`scripts/lib/layout.mjs:12-51`). Only `EXPECTED_SKILL_COUNT = 41` (`scripts/validate.mjs:20`) is hand-maintained; `tests/install.test.mjs:123,221,258` derives its counts from `scanSkills()` and needs no edit.
- A skill in the `delivery` group must be named somewhere in `workflows/delivery.md` (`scripts/validate.mjs:388-391`), and that file's phase table has the fixed columns `Skill | Artifact type | Human gate | Runs in` (`scripts/validate.mjs:399-401`).
- Every file under a skill directory whose name ends `answer.md` must appear in `ANSWER_INVENTORY` and match its declared handoff, and a `TERMINAL_ANSWER` entry must carry zero fenced blocks, no `Next action:` label, and no `Open a new session, then run:` sentence (`scripts/validate.mjs:36-92`, `:269-316`). A template that reproduced the caller's fence could not be registered, because the skill it names varies per call; all three of this skill's replies are therefore terminal.
- Every `references/<file>` string in a `SKILL.md` body must exist on disk, and the pattern accepts any extension, so `references/stop_hook.sh` is a valid reference (`scripts/validate.mjs:250-256`).
- **Correction to the design.** `herdr agent get --current` fails with `{"error":{"code":"agent_not_found"}}`; `--current` is a pane selector, not an agent target. The caller's kind is `.result.pane.agent` from `herdr pane current --current`, verified to print `omp` in this pane, and its values match the `--kind` list (`pi|claude|codex|omp|...`).
- `herdr pane layout --pane <id>` returns `.result.layout.panes[]` each with a `rect` of `{x, y, width, height}`, so the split direction reads from the caller's own rectangle, not from the tab area.
- `herdr pane rename <pane_id> <label>` adds a `label` key to that pane in `pane get` and `pane list`; `--clear` removes the key. `pane list --workspace <id>` returns every pane with its `tab_id`, which is how the skill detects another task already occupying the tab.
- `herdr pane send-text <pane_id> <text>` writes text with no Enter; `herdr agent prompt <target> <text>` sends text and Enter as one submission. `herdr notification show <title> [--body TEXT] [--sound none|done|request]` is the notification surface.
- `archon workflow get <run-id> --json` returns `working_path` at the top level and `metadata.approval` with `nodeId`, `bodyGateId`, `message`, `type`, `captureResponse`, `decisions[]` (`{id,label}`), `decisionsAuthored`, `iteration`, and, once the gate has been answered, `resolved`. Observed on run `d428fde0` on 2026-09-17 while it was paused at `design__cycle`: top-level `status` was `"paused"` and `metadata.approval` carried every key above with no `resolved` key at all; the same object gained `resolved` after the gate was answered. The live gate is therefore `status == "paused"` with no `resolved`.
- Agent names must match `[a-z][a-z0-9_-]{0,31}`, which a four-word slug plus a phase name can exceed. The skill truncates.

## Desired End State

`/herd-next` run at the end of a phase inside Herdr opens the next phase in its own pane, in the same working directory, with the exact command staged and focus unchanged. `/herd-next --run <run-id>` blocks on the run, raises a notification at the pause, and opens a review pane at the run's worktree with the artifact read and the decision command staged. Outside Herdr the skill prints one terminal reply and changes nothing. `npm test` passes at the end of every phase.

## What We're NOT Doing

- No change to the phase skills, their artifacts, their answer templates, or the handoff contract in `shared/CONVENTIONS.md`.
- No change to the Archon packs. The skill observes and steers a run from outside; continuation inside a run stays Archon's job.
- No automation of the review itself. The pane opens; a human reads and decides.
- No Oh My Pi or Pi hook callback. Those are in-process extension events, a different integration shape; the skill invocation covers all four runtimes.
- No installer change. The `Stop` hook ships as a snippet the user installs by hand; the installer never writes `~/.claude/settings.json`.
- No cross-machine control.

## Execution Strategy

Three phases, each ending green on `npm test`. Phase 1 registers the skill and ships the by-hand handoff mode, which is the flow every runtime and every pack-free skill uses. Phase 2 adds the Archon gate mode to the same `SKILL.md`. Phase 3 adds the opt-in hook snippet and the documentation rows. Phases 2 and 3 are independent of each other and both depend on Phase 1.

Every command in the skill body reads its identifiers out of JSON. The skill never predicts a pane id, an agent kind, a worktree path, or a decision id.

---

## Phase 1: The handoff mode exists and the collection validates

### Goal

`/herd-next` inside Herdr opens the next phase in a sibling pane with the command staged, and `npm test` passes with 42 skills.

### Required Edits:

#### 1.1 The skill body

**File**: `skills/delivery/herd-next/SKILL.md`
**Changes**: New file. Frontmatter keys exactly `name` and `description`; line 6 is the shared writing-guide sentence byte-exact from any existing skill; the body holds the numbered steps below.

```markdown
---
name: herd-next
description: Run for /herd-next requests at the end of a delivery phase inside Herdr. Open the next phase in its own pane with its command staged, or watch an Archon run and open a review pane when it pauses at a gate.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Herd Next
```

Step 1, the guard. Nothing else runs until it passes:

```bash
test "${HERDR_ENV:-}" = 1
```

A failed guard prints `references/herd_next_skipped_answer.md` with the reason `not inside Herdr` and stops. This is not an error: the phase reply that came before already carries the command fence, and pasting it by hand is the documented flow (`workflows/delivery.md:252`).

Step 2, the command to stage. Take the last line matching `^/[a-z0-9-]+( @[^ ]+)?$` from the caller's argument, or, when the skill was given none, from the finishing reply in this session. When no such line exists, print the skipped reply with the reason `no handoff command found` and stop. Never invent the next skill.

Step 3, the slug and the phase. The slug is the task directory's `slug` from `task.md`; the phase is the skill name in the parsed command with any leading `create-`, `iterate-`, or `implement-` kept as written, so `/create-plan` labels the pane `<slug>/create-plan`.

Step 4, the caller's context and kind:

```diff
+ kind=${explicit_kind:-$(herdr pane current --current | jq -r '.result.pane.agent')}
+ case "$kind" in claude|codex|omp|pi) ;; *) kind="" ;; esac
```

An explicit `--kind` wins over the read. When the read yields nothing in that list, ask the user for the kind in one sentence and stop; never default to `claude`, which would switch runtimes mid-chain.

Step 5, the target pane. When another task already holds the tab, open a tab instead of crowding it:

```bash
busy=$(herdr pane list --workspace "$HERDR_WORKSPACE_ID" \
  | jq -r --arg tab "$HERDR_TAB_ID" --arg slug "$slug" \
    '.result.panes[] | select(.tab_id == $tab) | .label // empty | select(startswith($slug + "/") | not)')
```

With `busy` empty, split a sibling pane, choosing the direction from the caller's own rectangle:

```bash
dir=$(herdr pane layout --pane "$HERDR_PANE_ID" \
  | jq -r --arg p "$HERDR_PANE_ID" \
    '.result.layout.panes[] | select(.pane_id == $p) | if .rect.width >= .rect.height * 2 then "right" else "down" end')
pane=$(herdr pane split --current --direction "$dir" --cwd "$PWD" --no-focus | jq -r '.result.pane.pane_id')
```

With `busy` non-empty, create the tab and take its root pane:

```bash
pane=$(herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "$PWD" --label "$slug" --no-focus \
  | jq -r '.result.root_pane.pane_id')
```

Step 6, the agent name. Cut the slug to `32 - (length of the phase + 1)` characters first, so the phase always survives, then build `<cut slug>-<phase>`, lower-case, every character outside `a-z0-9-` replaced by `-`, collapsed runs of `-` reduced to one, truncated to 32 characters, any trailing `-` stripped. A phase longer than 31 characters leaves no room for a stem; cut the joined `<slug>-<phase>` to 32 characters in that case. When `herdr agent list` already holds the result, append `-2`, then `-3`, cutting the stem further so the name stays within 32 characters.

Step 7, start, label, stage:

```bash
herdr agent start "$name" --kind "$kind" --pane "$pane"
herdr pane rename "$pane" "$slug/$phase"
herdr pane send-text "$pane" "$command"
```

`agent start` returns `agent_not_ready` when the agent is blocked during startup while keeping the name usable; on that response, wait with `herdr agent wait "$name" --until idle --until done --timeout 30000` before staging, and report a still-blocked agent in the reply rather than sending input to it. A bare wait with no `--until` settles on `blocked` too, which is the state this branch exists to sit out.

Step 8, stage or submit. `send-text` is the default and stages without Enter, which is what keeps "running the next command records approval" true. Submit with `herdr agent prompt "$name" "$command" --wait --timeout 120000` only when the caller passed `--submit`, or when the task's `task.md` carries `gates: none`, because that chain was already declared unattended.

Step 9, the reply: `references/herd_next_answer.md`, every `<...>` slot filled.

Rules to state in the skill body: never close a pane, tab, or workspace the skill did not create; never target a pane by focus, only by `--current`, an id read from JSON, or a live agent name; never run `herdr server stop`; no emojis, no em dashes.

#### 1.2 The two terminal replies

**File**: `skills/delivery/herd-next/references/herd_next_answer.md`
**Changes**: New file. No fenced block, no `Next action:` label, no fresh-session sentence; the staged command appears as inline code.

```markdown
The next phase is open in pane `<pane id>`, labelled `<slug>/<phase>`, running `<kind>` as `<agent name>`.

Working directory: `<cwd>`. Focus stayed in this pane.

Staged, not submitted: `<the /skill @file command>`. Switch to that pane and press Enter to start the phase; running it records approval of the artifact this phase produced. <One line when a tab was created instead of a split, naming the tab id and the other task that held this tab; otherwise omit.> <One line when the command was submitted because the task declares `gates: none` or `--submit` was passed; otherwise omit.>
```

**File**: `skills/delivery/herd-next/references/herd_next_skipped_answer.md`
**Changes**: New file. Same constraints.

```markdown
No pane was opened: <reason>.

Nothing changed. The handoff command printed by the phase that just ended is the way forward: open a new session and run it there.
```

#### 1.3 Validator registration

**File**: `scripts/validate.mjs`
**Changes**: Bump the count and add the two templates to `ANSWER_INVENTORY`, keeping the object's alphabetical order by key.

```diff
- const EXPECTED_SKILL_COUNT = 41;
+ const EXPECTED_SKILL_COUNT = 42;
```

```diff
  "gather-sources/references/sources_final_answer.md": SOURCES_VARIANTS,
+ "herd-next/references/herd_next_answer.md": TERMINAL_ANSWER,
+ "herd-next/references/herd_next_skipped_answer.md": TERMINAL_ANSWER,
  "implement-outline/references/implementation_final_answer.md": "describe-pr",
```

#### 1.4 Workflow document

**File**: `workflows/delivery.md`
**Changes**: Add a phase-table row after the `deliver` row (`:238`), and add the skill to the by-hand list in the running-by-hand paragraph (`:252`).

```diff
+ | herd-next | none | no | by hand, inside Herdr: parses the handoff fence the finishing phase printed, opens a sibling pane at the same working directory, starts an agent of the caller's kind, labels it `<slug>/<phase>`, and stages the command without submitting it |
```

```diff
- Skills that no pack invokes (`gather-sources`, `iterate-research*`, `record-evidence`, `ci-commit`, `review-artifact-comments`, `show-me`) run this way only.
+ Skills that no pack invokes (`gather-sources`, `iterate-research*`, `record-evidence`, `ci-commit`, `review-artifact-comments`, `show-me`, `herd-next`) run this way only.
```

#### 1.5 Manifest and changeset

**File**: `.claude-plugin/plugin.json`
**Changes**: Regenerated, not hand-edited. Run `node scripts/sync-plugin.mjs`, which adds `"./skills/delivery/herd-next"` to the `skills` array in sorted position.

**File**: `.changeset/herd-next-skill.md`
**Changes**: New file, `minor` per the changeset README's rule for a new skill.

```markdown
---
"@marktripoli/skills": minor
---

New `herd-next` skill: inside Herdr, it opens the next delivery phase in its own pane with the handoff command staged, so continuing a task no longer means copying a command into a new session by hand.
```

### Success Criteria:

#### Automated Verification:

- [x] `npm test`
- [x] `node scripts/validate.mjs` reports no failure mentioning `herd-next`
- [x] `node scripts/sync-plugin.mjs --check` exits 0
- [x] `node -e 'const {scanSkills}=await import("./scripts/lib/layout.mjs");const s=scanSkills("skills");if(s.problems.length)throw new Error(JSON.stringify(s.problems));if(!s.skills.find(x=>x.name==="herd-next"&&x.group==="delivery"))throw new Error("herd-next not discovered in the delivery group")' --input-type=module`
- [x] `git grep -n "herd-next" workflows/delivery.md` prints the phase-table row and the by-hand list line

human-gated: false

#### Deferred human evidence (recorded, not a gate):

- A scratch-pane run of `/herd-next` at the end of a phase, confirming the new pane carries the staged command unsubmitted and that focus stayed in the calling pane. Recorded in the implementation artifact's evidence section.

---

## Phase 2: The Archon gate mode

### Goal

`/herd-next --run <run-id>` blocks on the run, notifies at the pause, and opens a review pane at the run's worktree with the artifact read and the decision command staged.

### Required Edits:

#### 2.1 Gate mode in the skill body

**File**: `skills/delivery/herd-next/SKILL.md`
**Changes**: Add a `## Archon gate mode` section after the handoff steps, entered when the caller passes `--run <run-id>` or names a run. The same guard from step 1 applies first.

Find the run when the caller named none. One running or paused run for this project is taken without asking; several means asking which:

```bash
archon workflow status --json | jq -r '.runs[] | "\(.id)\t\(.workflow_name)\t\(.status)\t\(.working_path)"'
```

Block on the run in this pane. `--detach` is refused on a fresh launch of an interactive pack and the delivery packs declare `interactive: true` (`workflows/delivery.md:147`), so `wait` is a foreground process and the skill holds this pane while it runs:

```bash
archon workflow wait "$run_id" --json
```

Read the paused state; never guess a path or a decision id:

```bash
run=$(archon workflow get "$run_id" --json)
status=$(jq -r '.status' <<<"$run")
cwd=$(jq -r '.working_path' <<<"$run")
node=$(jq -r '.metadata.approval.nodeId // empty' <<<"$run")
msg=$(jq -r '.metadata.approval.message // empty' <<<"$run")
decisions=$(jq -r '.metadata.approval.decisions[].id' <<<"$run")
resolved=$(jq -r '.metadata.approval.resolved // empty' <<<"$run")
```

A gate is live when `status` is `paused` and `resolved` is empty. This was observed directly on run `d428fde0` on 2026-09-17 (Archon CLI on this machine) while it sat at `design__cycle`: `status` was `"paused"`, `metadata.approval` held `message`, `nodeId` (`design__cycle`), `type` (`approval`), `captureResponse` (`false`), `decisions` (`[{id:"approve",label:"Approve"},{id:"reject",label:"Request changes"}]`), `decisionsAuthored` (`true`), `bodyGateId` (`gate`), and `iteration` (`1`), and carried no `resolved` key; the key appeared only after the gate resolved. Any other `status`, or a non-empty `resolved`, means the run moved on: print the skipped reply with the reason `the run is not paused at a gate` and stop. The phase label is `nodeId` with a trailing `__cycle` stripped, so `design__cycle` labels the pane `<slug>/design`.

Notify, then open the review pane at the run's own worktree:

```bash
herdr notification show "Gate: $slug/$phase" --body "$msg" --sound request
pane=$(herdr pane split --current --direction "$dir" --cwd "$cwd" --no-focus | jq -r '.result.pane.pane_id')
herdr agent start "$name" --kind "$kind" --pane "$pane"
herdr pane rename "$pane" "$slug/$phase gate"
herdr pane send-text "$pane" "Read $artifact and report whether it is ready to approve."
```

`$artifact` is the task directory named in `metadata.approval.message`, resolved against `$cwd`; when the message names none, stage the task directory path itself. The decision command is reported in the reply rather than staged in the same input line, because a pane holds one staged line at a time:

```text
archon workflow respond <run-id> <decision> "<what should change>"
```

`respond` is the general form and covers every id in `decisions[]`, including any a pack authored beyond `approve` and `reject`. The tab-versus-split rule, the agent-name rule, the kind rule, and the stage-not-submit rule are the ones already stated for the handoff mode; the gate mode does not restate them.

#### 2.2 The gate reply

**File**: `skills/delivery/herd-next/references/herd_next_gate_answer.md`
**Changes**: New file. Terminal: no fenced block, no `Next action:` label, no fresh-session sentence.

```markdown
Run `<run-id>` (`<workflow name>`) paused at `<nodeId>`. A notification was raised and a review pane is open.

Review pane `<pane id>`, labelled `<slug>/<phase> gate`, working directory `<the run's working_path>`, running `<kind>` as `<agent name>`. Staged, not submitted: the read of `<artifact path>`.

Decide from any pane once you have read it: `archon workflow respond <run-id> approve`, or `archon workflow respond <run-id> reject "<what should change>"`. <One line naming any decision beyond approve and reject that this gate declares; otherwise omit.> Rejecting reopens the gate after the iterate skill revises the artifact.
```

#### 2.3 Validator registration

**File**: `scripts/validate.mjs`
**Changes**: One row. The skill count does not change.

```diff
  "herd-next/references/herd_next_answer.md": TERMINAL_ANSWER,
+ "herd-next/references/herd_next_gate_answer.md": TERMINAL_ANSWER,
  "herd-next/references/herd_next_skipped_answer.md": TERMINAL_ANSWER,
```

#### 2.4 Workflow document

**File**: `workflows/delivery.md`
**Changes**: Extend the `herd-next` row's `Runs in` cell with the gate mode, keeping the row one line.

```diff
- | herd-next | none | no | by hand, inside Herdr: parses the handoff fence ... and stages the command without submitting it |
+ | herd-next | none | no | by hand, inside Herdr: parses the handoff fence ... and stages the command without submitting it; with `--run <run-id>` it waits on an Archon run, notifies at the pause, and opens a review pane at the run's `working_path` with the gated artifact staged |
```

### Success Criteria:

#### Automated Verification:

- [x] `npm test`
- [x] `archon workflow status --json | jq -e '.runs | type == "array"'` exits 0, confirming the discovery command's shape on this machine
- [x] `archon workflow get <any recent run id> --json | jq -e 'has("working_path") and (.metadata | has("approval"))'` exits 0
- [x] `git grep -c "herd_next_gate_answer" scripts/validate.mjs skills/delivery/herd-next/SKILL.md` prints 1 for each file

human-gated: false

#### Deferred human evidence (recorded, not a gate):

- A run of the gate mode end to end against a scratch `delivery-lean` run, confirming the notification appears and the review pane opens at the run's worktree.

---

## Phase 3: The opt-in Stop hook and the documentation rows

### Goal

A user who wants the pane to open without invoking the skill can install one snippet by hand, and the collection's documentation names the skill where a reader looks for it.

### Required Edits:

#### 3.1 The hook snippet

**File**: `skills/delivery/herd-next/references/stop_hook.sh`
**Changes**: New file. A Claude Code `Stop` hook reads one JSON object on stdin carrying `last_assistant_message`, which holds the printed fence, and `cwd`. It opens the pane itself, which is what the design's resolved trigger question states: the hook "does the same thing unprompted" (`03-design-discussion-herdr-plugin.md:93`), and the Desired End State has ending a phase inside Herdr open the next phase in its own pane. A hook that only recorded the line for a later `/herd-next` would still need a human to type the command, and a fixed temporary path would race between two panes finishing at once. The script exits 0 in every path; a hook that fails must never block the session, and it writes no file anywhere.

The opening lines, verbatim:

```bash
#!/usr/bin/env bash
# Claude Code Stop hook: open the next delivery phase in its own Herdr pane.
# Install by hand in ~/.claude/settings.json under "hooks" -> "Stop":
#   {"hooks":[{"type":"command","command":"<path to this file>","timeout":30}]}
# Not installed by this collection's installer, which never writes settings you own.
set -u

test "${HERDR_ENV:-}" = 1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v herdr >/dev/null 2>&1 || exit 0

payload=$(cat)
message=$(jq -r '.last_assistant_message // empty' <<<"$payload" 2>/dev/null) || exit 0
cmd=$(printf '%s\n' "$message" | grep -oE '^/[a-z0-9-]+( @[^ ]+)?$' | tail -1)
test -n "$cmd" || exit 0

cwd=$(jq -r '.cwd // empty' <<<"$payload" 2>/dev/null)
test -n "$cwd" || cwd=$PWD
test -d "$cwd" || exit 0
```

The guard runs before anything else, so with `HERDR_ENV` unset the hook executes no `herdr` command at all. After the parse it performs steps 3 to 7 of section 1.1's handoff mode, in that order and with those commands, against `$cwd`:

- Step 3. The phase is the skill name in the fence. The task directory is the one holding the artifact the fence names: a `@path/to/NN-artifact.md` takes that directory, a bare `@NN-artifact.md` matches `$cwd/.agents/tasks/*/<artifact>` and stops when two directories hold it, and a fence with no `@file` takes the newest `.agents/tasks/*/task.md` by mtime. The slug is that file's `slug` key, falling back to its directory name.
- Step 4. `kind` from `herdr pane current --current | jq -r '.result.pane.agent'`, accepted only as `claude`, `codex`, `omp`, or `pi`. The skill asks the user when the read yields nothing; a hook cannot ask, so it exits 0.
- Step 5. The same `busy` read over `$HERDR_WORKSPACE_ID` and `$HERDR_TAB_ID`, then the `herdr pane layout --pane "$HERDR_PANE_ID"` direction read and `herdr pane split`, or `herdr tab create` when `busy` is non-empty. An unreadable direction falls back to `down`.
- Step 6. `<slug>-<phase>` reduced to `[a-z][a-z0-9-]{0,31}`, the slug cut to `32 - (length of the phase + 1)` characters first so the phase survives the limit and only a phase longer than 31 characters falls back to cutting the joined name. No `-2` collision walk: a name already in use fails `agent start` and the hook stops.
- Step 7. `herdr agent start`, then `herdr agent wait` only when the start response carries `agent_not_ready`, then `herdr pane rename "$pane" "$slug/$phase"` and `herdr pane send-text "$pane" "$cmd"`. Never `herdr agent prompt`: submitting the handoff would record approval of the artifact the finished phase produced.

Every branch above that cannot be resolved without asking the user exits 0 and changes nothing, which is the hook's whole error contract.

#### 3.2 Hook section in the skill body

**File**: `skills/delivery/herd-next/SKILL.md`
**Changes**: Add a `## Optional Stop hook` section naming `references/stop_hook.sh`, what it does, the branches it cannot resolve, the settings path, and the two-runtime limit.

```diff
+ `references/stop_hook.sh` is a Claude Code `Stop` hook that opens the pane without being asked. It parses the fence out of the payload's `last_assistant_message` and then runs steps 3 to 7 itself: the task directory from the artifact in the fence, the kind from `herdr pane current`, the split-or-tab choice, `agent start`, `pane rename`, `pane send-text`. It takes its working directory from the payload's `cwd`, stages with `send-text` and never submits, and writes no file anywhere.
+
+ The hook cannot ask a question, so every branch where the skill would ask - an unreadable agent kind, two task directories holding the same artifact, an agent name already in use - exits 0 and changes nothing. Run `/herd-next` by hand for those. Install the hook by hand in `~/.claude/settings.json`; this collection ships no `hooks` block and the installer never writes that file. Codex takes the same shape in its own `hooks.json`. Oh My Pi and Pi expose in-process extension callbacks rather than shell hooks, so they use the skill invocation only.
```

#### 3.3 Documentation rows

**File**: `README.md`
**Changes**: Add the skill to the utilities row (`:82`).

```diff
- | Utilities | `ci-commit`, `review-artifact-comments`, `show-me` |
+ | Utilities | `ci-commit`, `review-artifact-comments`, `show-me`, `herd-next` (Herdr pane handoff) |
```

**File**: `docs/getting-started.md`
**Changes**: Add the skill to the by-hand list (`:164`).

```diff
- Skills no pack invokes run this way only: `iterate-research-questions`, `iterate-research`, `record-evidence` (narrated video proof for the pull request), `ci-commit`, `review-artifact-comments`, `show-me`.
+ Skills no pack invokes run this way only: `iterate-research-questions`, `iterate-research`, `record-evidence` (narrated video proof for the pull request), `ci-commit`, `review-artifact-comments`, `show-me`, `herd-next` (opens the next phase in a Herdr pane).
```

### Success Criteria:

#### Automated Verification:

- [x] `npm test`
- [x] `bash -n skills/delivery/herd-next/references/stop_hook.sh`
- [x] Guard check. With the stub below first on `PATH` and `HERDR_ENV=` unset, a payload carrying a fence leaves the script exiting 0 and `$HERD_LOG` never created: no `herdr` command runs at all.
- [x] Ordered-call check. With `HERDR_ENV=1 HERDR_WORKSPACE_ID=w1 HERDR_TAB_ID=t1 HERDR_PANE_ID=p1`, the same stub answering `pane current`, `pane list`, `pane layout`, `pane split`, `agent start`, `pane rename` and `pane send-text` with canned JSON, and a payload holding `/create-plan @04-plan-herdr-plugin.md` plus this repository's path as `cwd`, `$HERD_LOG` holds exactly those seven calls in that order and the `pane send-text` argument is the parsed command.
- [x] `git grep -n "herd-next" README.md docs/getting-started.md` prints both rows

The stub both checks use, written to a `mktemp -d` directory as `herdr` and made executable:

```bash
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$HERD_LOG"
case "$1 $2" in
  "pane current") echo '{"result":{"pane":{"pane_id":"p1","agent":"omp"}}}' ;;
  "pane list") echo '{"result":{"panes":[{"pane_id":"p1","tab_id":"t1"}]}}' ;;
  "pane layout") echo '{"result":{"layout":{"panes":[{"pane_id":"p1","rect":{"x":0,"y":0,"width":200,"height":50}}]}}}' ;;
  "pane split") echo '{"result":{"pane":{"pane_id":"p2"}}}' ;;
  "tab create") echo '{"result":{"root_pane":{"pane_id":"p9"}}}' ;;
  "agent start") echo '{"result":{"agent":{"name":"a","status":"ready"}}}' ;;
  *) echo '{"result":{"pane":{"pane_id":"p2"}}}' ;;
esac
```

human-gated: false

#### Deferred human evidence (recorded, not a gate):

- The hook installed in a real `~/.claude/settings.json` and observed opening a pane with the command staged at the end of a phase, against a live `herdr` rather than a stub. Recorded in the implementation artifact's evidence section.

## Human Review

### Review targets

- Phase 1 section 1.2 and Phase 2 section 2.2: all three replies are terminal because a template reproducing the caller's fence cannot be registered in `ANSWER_INVENTORY`, whose values are fixed skill names. This is the reason the skipped reply points at the fence the previous phase printed rather than reprinting it, which is a change from the design's wording.
- Phase 1 section 1.1 step 4 and step 5: the two corrections to the design against the installed CLI, the kind read and the split-direction read.
- Phase 3 section 3.1: the hook opens the pane itself, so the pane logic exists in two places, the skill body and the script, and they can drift. The script carries no `-2` name-collision walk and no user question; those branches exit 0 and leave the by-hand `/herd-next` as the way through.
- Changed-file ownership: `scripts/validate.mjs` is edited in both Phase 1 and Phase 2, in the same object; the phases must land in order.

### Verify

- [ ] Confirm in a scratch pane that `herdr pane send-text <pane> "<text>"` stages text without submitting it, and that an agent started by `herdr agent start` accepts staged text before its first turn.
- [ ] Confirm the caller's agent kind reads as one of `claude`, `codex`, `omp`, `pi` from `herdr pane current --current` in each runtime a user runs, not only `omp`.
- [ ] Confirm `npm test` passes after Phase 1 alone, with `EXPECTED_SKILL_COUNT` at 42 and the manifest regenerated.
- [ ] Confirm whether a Claude Code plugin may ship hook configuration, which decides only whether Phase 3's snippet can later become a documented plugin option.

### Known limits

- `workflows/delivery.md` documents no field schema for `archon workflow get --json`; the fields Phase 2 reads were verified against Archon CLI 0.10.1 on 2026-09-17, so a future release could move them without the repository's prose noticing.
- `--detach` is refused on a fresh launch of an interactive pack, so the gate mode holds a pane for the foreground `wait` rather than polling from anywhere.
- Rows leaving a terminal's alternate screen do not enter Herdr's scrollback, so the skill cannot recover a fence by reading a neighbouring pane; the command must arrive through the invocation or the hook file.
- The `Stop` hook covers Claude Code and Codex only. Oh My Pi and Pi expose in-process extension callbacks, so their users invoke the skill.
- Herdr ids and agent names are scoped to one server; nothing here works across machines.
- Agent names truncate at 32 characters, so two tasks whose slugs share a long prefix can collide and take a `-2` suffix that reads less clearly than the pane label.
