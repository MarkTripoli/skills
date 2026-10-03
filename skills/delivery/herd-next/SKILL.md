---
name: herd-next
description: Opens the next delivery skill in a fresh Herdr pane with its handoff command staged but not submitted. Use when the user runs /herd-next at the end of a manual delivery phase inside Herdr, or wants a printed handoff command started in a new pane; not for running the next phase in the current session.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Herd Next

Carry a delivery phase's continuation into a fresh Herdr pane: parse the `/<skill> @<file>` line the finishing phase already printed, split a sibling pane, start an agent of the caller's kind in it, label it `<slug>/<phase>`, and stage the command without pressing Enter.

Step 1, the guard. Nothing else runs until it passes:

```bash
test "${HERDR_ENV:-}" = 1
command -v herdr >/dev/null && command -v jq >/dev/null
```

A failed guard prints `references/herd_next_skipped_answer.md` and stops, with the reason `not inside Herdr` when the first test fails and `herdr or jq not installed` when the second does. This is not an error: the phase reply that came before already carries the command fence, and pasting it by hand is the documented flow (the delivery workflow's "Running skills by hand").

Step 2, the command and model. Take the last line matching `^/[a-z0-9-]+( @[^ ]+)?$` from the caller's argument, or, when the skill was given none, from the finishing reply in this session. When no such line exists, print the skipped reply with the reason `no handoff command found` and stop. Never invent the next skill. Route the next phase with the portable helper using this precedence: explicit `--candidates <json-file>` and `--economy <model>`, then `SKILLS_MODEL_CANDIDATES_FILE`, then `$PWD/.agents/model-candidates.json`. The profile JSON is `{economy,candidates,routing?}`, with candidates ordered weakest to strongest. Run the helper:

```bash
request_json=$(jq -cn --arg skillsDir <skills-dir> --arg phase "$phase" --arg cwd "$root" --arg request "$(cat "$task_md")" \
  '{skillsDir:$skillsDir,phase:$phase,cwd:$cwd,request:$request}')
selected_model=$(printf '%s' "$request_json" \
  | node <skills-dir>/route-model/route-model.mjs --require-jev | jq -r '.model // empty') || selected_model=""
```

`phase` is the skill name in the parsed command, `root` the repository root, and `task_md` the task's `task.md`, the same inputs `stop_hook.sh` routes on; add the explicit `--candidates` and `--economy` flags to the command when given. An empty `selected_model` (no profile, or a helper failure) means no model was enforced; state that. Preserve a returned model in this phase's reply. A caller may instead pass `--model <model>` as an explicit recommendation. Never discover candidates by scraping a provider-private catalog.

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

Step 6, the agent name. Source the helper and build the name from the slug, the phase, and the names `herdr agent list` already shows:

```bash
. <skill-dir>/references/agent_name.sh
name=$(agent_name "$slug" "$phase" <names from herdr agent list>) || { echo "ask the user for a name"; }
```

Exit 1 means the name would not start with a lowercase letter, most often a slug beginning with a digit: ask the user for a name and stop rather than guessing one.

Step 7, start, label, stage. When a selected model came from configured candidates, pass it to the native agent command after Herdr's option separator, for example `herdr agent start ... -- --model <model>`. This is enforceable for supported Herdr agents.

```bash
model_args=()
if [ -n "${selected_model:-}" ]; then model_args=(-- --model "$selected_model"); fi
herdr agent start "$name" --kind "$kind" --pane "$pane" "${model_args[@]}"
herdr pane rename "$pane" "$slug/$phase"
case "$kind" in codex) command="\$${command#/}" ;; esac
herdr pane send-text "$pane" "$command"
```

After `agent start`:

1. `agent_not_ready` (the agent is blocked during startup, the name stays usable): wait with `herdr agent wait "$name" --until idle --until done --timeout 30000` before staging. `--until` is repeatable and a bare wait settles on `blocked` too, the one state this branch exists to sit out. If the wait fails (the timeout, or the agent settling on `blocked`), close the pane this step opened with `herdr pane close "$pane"`, print `references/herd_next_skipped_answer.md` with the reason `the agent in the new pane is still blocked`, and stop. Nothing was staged, so no reply claims otherwise.
2. Native `--model` rejected: close the pane and use the manual path, reporting `Recommendation only: <model>`, rather than retrying another model.

Step 8, stage or submit. `send-text` stages without Enter. A command that records approval stays staged even when the caller passes `--submit`; the user submits it. For a command that records no approval, submit with `herdr agent prompt "$name" "$command" --wait --timeout 120000` only when the caller passed `--submit`. Step 7 converts `/` to `$` for a Codex pane before either operation; the printed handoff fence keeps `/`.

Step 9, the reply: `references/herd_next_answer.md`, every `<...>` slot filled. Include `Selected model: <model>` when routing ran. If this is a manual handoff without enforceable Herdr model selection, include `Recommendation only: <model>; start the next session with that model if desired.` and do not claim that the handoff enforced it.

Never close a pane, tab, or workspace this skill did not create. Never target a pane by focus; only by `--current`, an id read from JSON, or a live agent name. Never run `herdr server stop`. No emojis, no em dashes.

## Optional Stop hook

See [references/stop_hook.md](references/stop_hook.md) to install the hook (`references/stop_hook.sh`) that does this unprompted.
