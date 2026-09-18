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

A failed guard prints `references/herd_next_skipped_answer.md` with the reason `not inside Herdr` and stops. This is not an error: the phase reply that came before already carries the command fence, and pasting it by hand is the documented flow (`workflows/delivery.md`, "Running skills by hand").

Step 2, the command to stage. Take the last line matching `^/[a-z0-9-]+( @[^ ]+)?$` from the caller's argument, or, when the skill was given none, from the finishing reply in this session. When no such line exists, print the skipped reply with the reason `no handoff command found` and stop. Never invent the next skill.

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
case "$dir" in right|down) ;; *) dir=down ;; esac
pane=$(herdr pane split --current --direction "$dir" --cwd "$PWD" --no-focus | jq -r '.result.pane.pane_id')
```

With `busy` non-empty, create the tab and take its root pane:

```bash
pane=$(herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "$PWD" --label "$slug" --no-focus \
  | jq -r '.result.root_pane.pane_id')
```

Step 6, the agent name. Cut the slug to `32 - (length of the phase + 1)` characters first, so the phase always survives, then build `<cut slug>-<phase>`, lower-case, every character outside `a-z0-9-` replaced by `-`, collapsed runs of `-` reduced to one, truncated to 32 characters, any trailing `-` stripped. A phase longer than 31 characters leaves no room for a stem; cut the joined `<slug>-<phase>` to 32 characters in that case. When `herdr agent list` already holds the result, append `-2`, then `-3`, cutting the stem further so the name stays within 32 characters. The built name must start with a lowercase letter, exactly as `stop_hook.sh` checks after building it; when it does not (a slug beginning with a digit, most often), ask the user for a name and stop rather than guessing one.

Step 7, start, label, stage:

```bash
herdr agent start "$name" --kind "$kind" --pane "$pane"
herdr pane rename "$pane" "$slug/$phase"
case "$kind" in codex) command="\$${command#/}" ;; esac
herdr pane send-text "$pane" "$command"
```

`agent start` returns `agent_not_ready` when the agent is blocked during startup while keeping the name usable; on that response, wait with `herdr agent wait "$name" --until idle --until done --timeout 30000` before staging. `--until` is repeatable and a bare wait with none settles on `blocked` too, which is the one state this branch exists to sit out. A wait that fails (the 30-second timeout, or the agent settling on `blocked`) means it never became ready: close the pane this step opened, `herdr pane close "$pane"`, then print `references/herd_next_skipped_answer.md` with the reason `the agent in the new pane is still blocked`, and stop. Nothing was staged, so nothing is left half-open with a reply that claims otherwise.

Step 8, stage or submit. `send-text` is the default and stages without Enter: a command that records approval is staged, never submitted, which is what keeps "running the next command records approval" true. A command that records no approval, such as the gate mode's `/deliver --run <run-id>`, may be submitted. Submit with `herdr agent prompt "$name" "$command" --wait --timeout 120000` only when the caller passed `--submit`. `$command` takes the prefix its own pane's kind uses, not the fence's literal `/`: `shared/CONVENTIONS.md`'s Handoff section fixes the printed fence at `/` for every kind because a Codex person retypes it as `$` before running it; a pane has no person doing that conversion, so step 7's `case "$kind"` does it, for `codex` only, before either `send-text` or this `agent prompt` line sees the string. The gate mode's submitted command below takes the same substitution.

Step 9, the reply: `references/herd_next_answer.md`, every `<...>` slot filled.

Never close a pane, tab, or workspace this skill did not create. Never target a pane by focus; only by `--current`, an id read from JSON, or a live agent name. Never run `herdr server stop`. No emojis, no em dashes.

## Archon gate mode

Entered when the caller passes `--run <run-id>` or names a run. Step 1's guard runs first here too.

Find the run when the caller named none. One running or paused run for this project is taken without asking; several means asking which:

```bash
archon workflow status --json | jq -r '.runs[] | "\(.id)\t\(.workflow_name)\t\(.status)\t\(.working_path)"'
```

Read the run once. This pane is never held: the steward in the review pane does the waiting.

Read the run's state; never guess a path or a decision id:

```bash
run=$(archon workflow get "$run_id" --json) || { printf '%s\n' "$run" >&2; exit 1; }
run_status=$(jq -r '.status' <<<"$run")
cwd=$(jq -r '.working_path' <<<"$run")
node=$(jq -r '.metadata.approval.nodeId // empty' <<<"$run")
msg=$(jq -r '.metadata.approval.message // empty' <<<"$run")
decisions=$(jq -r '.metadata.approval.decisions[]?.id // empty' <<<"$run")
resolved=$(jq -r '.metadata.approval.resolved // empty' <<<"$run")
```

A `get` that exits nonzero opens no pane: print `references/herd_next_skipped_answer.md` with the reason `the run could not be read`, followed by Archon's output as cause and fix. Without the guard `$cwd` is the literal string `null` and the pane opens there.

A gate is live when `status` is `paused` and `resolved` is empty; the key is absent while the gate waits and appears once it has been answered. `status` of `completed`, `failed`, or `cancelled` means the run is over: print the skipped reply with the reason `the run has ended` and stop. `running`, or `paused` with a non-empty `resolved`, still opens the pane: `$phase` is `run`, the notification is skipped because there is no gate to name, and the steward in the pane announces the pause when it arrives. `$phase` is `$node` with a trailing `__cycle` stripped when a gate is live, so `design__cycle` labels the pane `<slug>/design`.

`$artifact` is the task directory named in `$msg`, resolved against `$cwd`; when the message names none, `$artifact` is `$cwd` itself. `$slug` is that directory's basename - the run's own task, never the caller's, because `$cwd` is the run's `working_path`, a different checkout from `$PWD` whenever the caller is not already inside it.

Get the pane and the name exactly as steps 4 through 6 do, with one substitution throughout: `$cwd` in place of `$PWD` everywhere a pane or tab is opened, because the review pane lives in the run's worktree, not the caller's. The busy check still reads the caller's own tab and pane through `$HERDR_TAB_ID` and `$HERDR_PANE_ID`, since that geometry is unchanged; only the destination of the new pane or tab moves. That gives `$kind`, `$pane`, and `$name`. Notify, start the agent, and submit the attach command:

```bash
[ -n "$node" ] && herdr notification show "Gate: $slug/$phase" --body "$msg" --sound request
herdr agent start "$name" --kind "$kind" --pane "$pane"
herdr pane rename "$pane" "$slug/$phase gate"
attach="/deliver --run $run_id"
case "$kind" in codex) attach="\$deliver --run $run_id" ;; esac
herdr agent prompt "$name" "$attach"
```

The `agent_not_ready` handling is the one already stated in step 7, still-blocked branch included; the gate mode does not restate it: wait with `herdr agent wait "$name" --until idle --until done --timeout 30000` before submitting the attach command. A failed wait closes the pane and prints the skipped reply with the same reason, exactly as step 7 does, instead of submitting the attach command or printing the gate reply below. This is what keeps `deliver/SKILL.md`'s `No pane was opened` fallback reachable even though a pane was briefly opened here.

`agent prompt` without `--wait` returns on submission, so the gate mode does not block for the length of the run. The pane's `deliver` reads the gated artifact, announces the pause, and resolves every decision itself, including any id a pack authored beyond `approve` and `reject`. Submitting here records no approval, so the stage-not-submit rule does not reach this line.

The reply is `references/herd_next_gate_answer.md`, every `<...>` slot filled.

## Optional Stop hook

`references/stop_hook.sh` is a Claude Code `Stop` hook that opens the pane without being asked. It parses the fence out of the payload's `last_assistant_message` and then runs steps 3 to 7 itself: the task directory from the artifact in the fence, the kind from `herdr pane current`, the split-or-tab choice, `agent start`, `pane rename`, `pane send-text`. It takes its working directory from the payload's `cwd`, walking up from `cwd` to the nearest ancestor holding `.agents/tasks/` before it looks for the task directory, stages with `send-text` and never submits, and writes no file anywhere.

The hook cannot ask a question, so every branch where the skill would ask - an unreadable agent kind, two task directories holding the same artifact, an agent name already in use - exits 0 and changes nothing. Run `/herd-next` by hand for those. Install the hook by hand in `~/.claude/settings.json`; this collection ships no `hooks` block and the installer never writes that file. Codex takes the same shape in its own `hooks.json`. Oh My Pi and Pi expose in-process extension callbacks rather than shell hooks, so they use the skill invocation only.

Because step 5's busy check never treats a same-slug pane as busy, a full chain of phases splits one new pane per phase into the same tab with no bound and nothing closes the finished ones; close them by hand when the tab gets crowded.
