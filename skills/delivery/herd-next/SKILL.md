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
