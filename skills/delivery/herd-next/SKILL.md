---
name: herd-next
description: Run for /herd-next requests at the end of a manual delivery phase inside Herdr. Open the next skill in a fresh pane with its handoff command staged for the user.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Herd Next

Carry a delivery phase's continuation into a fresh Herdr pane: parse the `/<skill> @<file>` line the finishing phase already printed, split a sibling pane, start an agent of the caller's kind in it, label it `<slug>/<phase>`, and stage the command without pressing Enter.

Step 1, the guard. Nothing else runs until it passes:

```bash
test "${HERDR_ENV:-}" = 1
```

A failed guard prints `references/herd_next_skipped_answer.md` with the reason `not inside Herdr` and stops. This is not an error: the phase reply that came before already carries the command fence, and pasting it by hand is the documented flow (`workflows/delivery.md`, "Running skills by hand").

Step 2, the command and model. Take the last line matching `^/[a-z0-9-]+( @[^ ]+)?$` from the caller's argument, or, when the skill was given none, from the finishing reply in this session. When no such line exists, print the skipped reply with the reason `no handoff command found` and stop. Never invent the next skill. Route the next phase with the portable helper using this precedence: explicit `--candidates <json-file>` and `--economy <model>`, then `SKILLS_MODEL_CANDIDATES_FILE`, then `$PWD/.agents/model-candidates.json`. The profile JSON is `{economy,candidates,routing?}`, with candidates ordered weakest to strongest. Preserve the returned model recommendation in this phase's reply. A caller may instead pass `--model <model>` as an explicit recommendation. If no profile exists, state that no model was enforced. Never discover candidates by scraping a provider-private catalog.

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

Step 7, start, label, stage. When a selected model came from configured candidates, pass it to the native agent command after Herdr's option separator, for example `herdr agent start ... -- --model <model>`. This is enforceable for supported Herdr agents; if the installed Herdr command rejects the native `--model`, close the pane and use the manual recommendation path rather than retrying another model. A manual copy-paste handoff can only report `Recommendation only: <model>` and must not claim enforcement.

```bash
model_args=()
if [ -n "${selected_model:-}" ]; then model_args=(-- --model "$selected_model"); fi
herdr agent start "$name" --kind "$kind" --pane "$pane" "${model_args[@]}"
herdr pane rename "$pane" "$slug/$phase"
case "$kind" in codex) command="\$${command#/}" ;; esac
herdr pane send-text "$pane" "$command"
```

`agent start` returns `agent_not_ready` when the agent is blocked during startup while keeping the name usable; on that response, wait with `herdr agent wait "$name" --until idle --until done --timeout 30000` before staging. `--until` is repeatable and a bare wait with none settles on `blocked` too, which is the one state this branch exists to sit out. A wait that fails (the 30-second timeout, or the agent settling on `blocked`) means it never became ready: close the pane this step opened, `herdr pane close "$pane"`, then print `references/herd_next_skipped_answer.md` with the reason `the agent in the new pane is still blocked`, and stop. Nothing was staged, so nothing is left half-open with a reply that claims otherwise.

Step 8, stage or submit. `send-text` stages without Enter. A command that records approval stays staged even when the caller passes `--submit`; the user submits it. For a command that records no approval, submit with `herdr agent prompt "$name" "$command" --wait --timeout 120000` only when the caller passed `--submit`. Step 7 converts `/` to `$` for a Codex pane before either operation; the printed handoff fence keeps `/`.

Step 9, the reply: `references/herd_next_answer.md`, every `<...>` slot filled. Include `Selected model: <model>` when routing ran. If this is a manual handoff without enforceable Herdr model selection, include `Recommendation only: <model>; start the next session with that model if desired.` and do not claim that the handoff enforced it.

Never close a pane, tab, or workspace this skill did not create. Never target a pane by focus; only by `--current`, an id read from JSON, or a live agent name. Never run `herdr server stop`. No emojis, no em dashes.

## Optional Stop hook

`references/stop_hook.sh` is a Claude Code `Stop` hook that opens the pane without being asked. It parses the fence out of the payload's `last_assistant_message` and then runs steps 3 to 7 itself: the task directory from the artifact in the fence, the kind from `herdr pane current`, the split-or-tab choice, `agent start`, `pane rename`, `pane send-text`. It takes its working directory from the payload's `cwd`, walking up from `cwd` to the nearest ancestor holding `.agents/tasks/` before it looks for the task directory, stages with `send-text` and never submits, and writes no file anywhere.

The hook cannot ask a question, so every branch where the skill would ask - an unreadable agent kind, two task directories holding the same artifact, an agent name already in use - exits 0 and changes nothing. Run `/herd-next` by hand for those. Install the hook by hand in `~/.claude/settings.json`; this collection ships no `hooks` block and the installer never writes that file. Codex takes the same shape in its own `hooks.json`. Oh My Pi and Pi expose in-process extension callbacks rather than shell hooks, so they use the skill invocation only.

Because step 5's busy check never treats a same-slug pane as busy, a full chain of phases splits one new pane per phase into the same tab with no bound and nothing closes the finished ones; close them by hand when the tab gets crowded.
