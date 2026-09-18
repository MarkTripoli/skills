#!/usr/bin/env bash
# Claude Code Stop hook: open the next delivery phase in its own Herdr pane.
# Install by hand in ~/.claude/settings.json under "hooks" -> "Stop":
#   {"hooks":[{"type":"command","command":"<path to this file>","timeout":30}]}
# Not installed by this collection's installer, which never writes settings you own.
#
# Does unprompted what /herd-next does: parses the handoff fence the finishing
# phase printed, then runs steps 3 to 7 of the skill's handoff mode itself -
# slug and phase, the caller's agent kind, a sibling split or a new tab, the
# agent, the pane label, and the command staged without Enter. It asks nothing
# and writes no file: every path that the skill would resolve by asking the user
# exits 0 and changes nothing, because a Stop hook must never block a session.
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

# Step 3, the slug and the phase. The artifact in the fence names the task
# directory; a fence without one falls back to the most recently touched task.
phase=${cmd#/}
phase=${phase%% *}
artifact=${cmd#* @}
test "$artifact" != "$cmd" || artifact=""
task=""
if test -n "$artifact"; then
  case "$artifact" in
    */*)
      test -f "$cwd/${artifact%/*}/task.md" && task="$cwd/${artifact%/*}/task.md"
      ;;
    *)
      for hit in "$cwd"/.agents/tasks/*/"$artifact"; do
        test -f "$hit" || continue
        test -z "$task" || exit 0 # two task directories hold this artifact
        task="${hit%/*}/task.md"
      done
      ;;
  esac
else
  # shellcheck disable=SC2012 # mtime order, and every path here is .agents/tasks/<slug>/task.md
  task=$(ls -t "$cwd"/.agents/tasks/*/task.md 2>/dev/null | head -1)
fi
test -f "$task" || exit 0
slug=$(sed -n 's/^slug: *//p' "$task" | tr -d '"' | head -1)
if test -z "$slug"; then
  slug=${task%/task.md}
  slug=${slug##*/}
fi

# Step 4, the caller's kind. The skill asks when the read yields nothing; a hook
# cannot ask, so an unreadable kind ends the run rather than defaulting.
kind=$(herdr pane current --current 2>/dev/null | jq -r '.result.pane.agent // empty' 2>/dev/null)
case "$kind" in claude | codex | omp | pi) ;; *) exit 0 ;; esac

# Step 5, the target pane: a sibling split, or a new tab when another task holds
# this tab.
busy=$(herdr pane list --workspace "${HERDR_WORKSPACE_ID:-}" 2>/dev/null |
  jq -r --arg tab "${HERDR_TAB_ID:-}" --arg slug "$slug" \
    '.result.panes[] | select(.tab_id == $tab) | .label // empty | select(startswith($slug + "/") | not)' 2>/dev/null)
if test -z "$busy"; then
  dir=$(herdr pane layout --pane "${HERDR_PANE_ID:-}" 2>/dev/null |
    jq -r --arg p "${HERDR_PANE_ID:-}" \
      '.result.layout.panes[] | select(.pane_id == $p) | if .rect.width >= .rect.height * 2 then "right" else "down" end' 2>/dev/null)
  case "$dir" in right | down) ;; *) dir=down ;; esac
  pane=$(herdr pane split --current --direction "$dir" --cwd "$cwd" --no-focus 2>/dev/null |
    jq -r '.result.pane.pane_id // empty' 2>/dev/null)
else
  pane=$(herdr tab create --workspace "${HERDR_WORKSPACE_ID:-}" --cwd "$cwd" --label "$slug" --no-focus 2>/dev/null |
    jq -r '.result.root_pane.pane_id // empty' 2>/dev/null)
fi
test -n "$pane" || exit 0

# Step 6, the agent name: <slug>-<phase> reduced to [a-z][a-z0-9-]{0,31}. The
# slug is cut to leave room for the phase, so the name still says which phase
# this is; only a phase longer than 31 characters falls back to cutting both.
# No -2 / -3 collision walk here: a name already in use fails the start below
# and the hook stops. Run /herd-next by hand for that case.
stem=$((32 - ${#phase} - 1))
if test "$stem" -ge 1; then
  name="${slug:0:stem}-$phase"
else
  name="$slug-$phase"
fi
name=$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | tr -s '-' | cut -c1-32)
name=${name%-}
case "$name" in [a-z]*) ;; *) exit 0 ;; esac

# Step 7, start, label, stage. send-text only: submitting the handoff would
# record approval of the artifact the finished phase produced.
start=$(herdr agent start "$name" --kind "$kind" --pane "$pane" 2>/dev/null) || exit 0
case "$start" in
  *agent_not_ready*) herdr agent wait "$name" --timeout 30000 >/dev/null 2>&1 || exit 0 ;;
esac
herdr pane rename "$pane" "$slug/$phase" >/dev/null 2>&1 || exit 0
herdr pane send-text "$pane" "$cmd" >/dev/null 2>&1 || exit 0
exit 0
