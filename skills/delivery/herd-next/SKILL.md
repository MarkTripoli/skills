---
name: herd-next
description: Run for /herd-next requests at the end of a delivery phase inside Herdr. Open the next phase in its own pane with its command staged, or watch an Archon run and open a review pane when it pauses at a gate.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Herd Next

Carry a delivery phase's continuation into a fresh Herdr pane: parse the `/<skill> @<file>` line the finishing phase already printed, split a sibling pane, start an agent of the caller's kind in it, label it `<slug>/<phase>`, and stage the command without pressing Enter.

Step 1, the guard. Nothing else runs until it passes:

```bash
test "${HERDR_ENV:-}" = 1
```

A failed guard prints `references/herd_next_skipped_answer.md` with the reason `not inside Herdr` and stops. This is not an error: the phase reply that came before already carries the command fence, and pasting it by hand is the documented flow (`workflows/delivery.md:252`).

Step 2, the command to stage. Take the last line matching `^/[a-z0-9-]+( @[^ ]+)?$` from the caller's argument, or, when the skill was given none, from `${TMPDIR:-/tmp}/herd-next-pending` if the optional `Stop` hook below recorded one, deleting that file after reading it, or from the finishing reply in this session. When no such line exists, print the skipped reply with the reason `no handoff command found` and stop. Never invent the next skill.

Step 3, the slug and the phase. The slug is the task directory's `slug` from `task.md`; the phase is the skill name in the parsed command with any leading `create-`, `iterate-`, or `implement-` kept as written, so `/create-plan` labels the pane `<slug>/create-plan`.

Step 4, the caller's context and kind:

```bash
kind=${explicit_kind:-$(herdr pane current --current | jq -r '.result.pane.agent')}
case "$kind" in claude|codex|omp|pi) ;; *) kind="" ;; esac
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

Step 6, the agent name. Build `<slug>-<phase>`, lower-case, every character outside `a-z0-9-` replaced by `-`, collapsed runs of `-` reduced to one, truncated to 32 characters, any trailing `-` stripped. When `herdr agent list` already holds that name, append `-2`, then `-3`, truncating the stem further so the result stays within 32 characters.

Step 7, start, label, stage:

```bash
herdr agent start "$name" --kind "$kind" --pane "$pane"
herdr pane rename "$pane" "$slug/$phase"
herdr pane send-text "$pane" "$command"
```

`agent start` returns `agent_not_ready` when the agent is blocked during startup while keeping the name usable; on that response, wait with `herdr agent wait "$name" --timeout 30000` before staging, and report a still-blocked agent in the reply rather than sending input to it.

Step 8, stage or submit. `send-text` is the default and stages without Enter, which is what keeps "running the next command records approval" true. Submit with `herdr agent prompt "$name" "$command" --wait --timeout 120000` only when the caller passed `--submit`, or when the task's `task.md` carries `gates: none`, because that chain was already declared unattended.

Step 9, the reply: `references/herd_next_answer.md`, every `<...>` slot filled.

Never close a pane, tab, or workspace this skill did not create. Never target a pane by focus; only by `--current`, an id read from JSON, or a live agent name. Never run `herdr server stop`. No emojis, no em dashes.

## Archon gate mode

Entered when the caller passes `--run <run-id>` or names a run. Step 1's guard runs first here too.

Find the run when the caller named none. One running or paused run for this project is taken without asking; several means asking which:

```bash
archon workflow status --json | jq -r '.runs[] | "\(.id)\t\(.workflow_name)\t\(.status)\t\(.working_path)"'
```

Block on the run in this pane. `--detach` is refused on a fresh launch of an interactive pack and the delivery packs declare `interactive: true` (`workflows/delivery.md:147`), so `wait` is a foreground process and this pane is held while it runs:

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

A gate is live when `status` is `paused` and `resolved` is empty; the key is absent while the gate waits and appears once it has been answered. Any other `status`, or a non-empty `resolved`, means the run moved on: print the skipped reply with the reason `the run is not paused at a gate` and stop. The phase label is `nodeId` with a trailing `__cycle` stripped, so `design__cycle` labels the pane `<slug>/design`.

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

The reply is `references/herd_next_gate_answer.md`, every `<...>` slot filled.

## Optional Stop hook

`references/stop_hook.sh` is a Claude Code `Stop` hook that records the handoff line without being asked. Install it by hand in `~/.claude/settings.json`; this collection ships no `hooks` block and the installer never writes that file. Codex takes the same shape in its own `hooks.json`. Oh My Pi and Pi expose in-process extension callbacks rather than shell hooks, so they use the skill invocation only.
