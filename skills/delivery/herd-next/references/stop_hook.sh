#!/usr/bin/env bash
# Claude Code Stop hook: open the next delivery phase in its own Herdr pane.
# Install by hand in ~/.claude/settings.json under "hooks" -> "Stop":
#   {"hooks":[{"type":"command","command":"<path to this file>","timeout":90}]}
# Not installed by this collection's installer, which never writes settings you own.
# 90 covers the worst case below: up to 30s in `herdr agent start`'s own
# readiness wait, plus up to another 30s in the `herdr agent wait` fallback,
# plus the handful of other herdr round trips. Raise this alongside either
# timeout below if either one grows.
#
# Does unprompted what /herd-next does: parses the handoff fence the finishing
# phase printed, then runs steps 3 to 7 of the skill's handoff mode itself -
# slug and phase, the caller's agent kind, a sibling split or a new tab, the
# agent, the pane label, and the command staged without Enter. It asks nothing
# and writes no file: every path that the skill would resolve by asking the user
# exits 0 and changes nothing, because a Stop hook must never block a session.
set -u

# Anything created below is torn down on the way out unless `done=1` is
# reached at the bottom: leaving an empty or half-configured pane or tab
# behind on every failure is worse than doing nothing.
done=0
created_pane=""
created_tab=""
# shellcheck disable=SC2329 # invoked indirectly, via the trap below
cleanup() {
  test "$done" = 1 && return
  if test -n "$created_tab"; then
    herdr tab close "$created_tab" >/dev/null 2>&1
  elif test -n "$created_pane"; then
    herdr pane close "$created_pane" >/dev/null 2>&1
  fi
}
trap cleanup EXIT
trap 'cleanup; exit 0' INT TERM HUP

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

# The task-directory lookup below walks up from $cwd to the nearest ancestor
# holding .agents/tasks/, so a session started in a repo subdirectory still
# finds it; panes and tabs are still opened at $cwd itself, unchanged.
root=$cwd
while ! test -d "$root/.agents/tasks" && test "$root" != "/"; do
  root=${root%/*}
  test -n "$root" || root=/
done
test -d "$root/.agents/tasks" || exit 0

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
      test -f "$root/${artifact%/*}/task.md" && task="$root/${artifact%/*}/task.md"
      ;;
    *)
      for hit in "$root"/.agents/tasks/*/"$artifact"; do
        test -f "$hit" || continue
        test -z "$task" || exit 0 # two task directories hold this artifact
        task="${hit%/*}/task.md"
      done
      ;;
  esac
else
  # shellcheck disable=SC2012 # mtime order, and every path here is .agents/tasks/<slug>/task.md
  task=$(ls -t "$root"/.agents/tasks/*/task.md 2>/dev/null | head -1)
fi
test -f "$task" || exit 0

# Route only when an explicit profile is configured. The helper receives the task
# request and next phase, and require-jev makes malformed or unavailable routing
# fail before a pane or agent is launched. With no profile, selected_model stays
# empty and this hook preserves the existing native behavior.
selected_model=""
hook_root=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
route_helper="$hook_root/route-model/route-model.mjs"
profile_file=${SKILLS_MODEL_CANDIDATES_FILE:-}
if test -z "$profile_file" && test -f "$root/.agents/model-candidates.json"; then
  profile_file="$root/.agents/model-candidates.json"
fi
if test -n "$profile_file"; then
  command -v node >/dev/null 2>&1 || exit 0
  test -f "$route_helper" || exit 0
  request=$(cat "$task") || exit 0
  route_input=$(jq -cn --arg skillsDir "$hook_root" --arg phase "$phase" --arg cwd "$root" --arg request "$request" '{skillsDir:$skillsDir,phase:$phase,cwd:$cwd,request:$request}') || exit 0
  route=$(printf '%s\n' "$route_input" | node "$route_helper" --require-jev 2>/dev/null) || exit 0
  selected_model=$(jq -r '.model // empty' <<<"$route" 2>/dev/null) || exit 0
  test -n "$selected_model" || exit 0
fi
slug=$(sed -n 's/^slug: *//p' "$task" | tr -d '"' | head -1)
if test -z "$slug"; then
  slug=${task%/task.md}
  slug=${slug##*/}
fi

# Step 4, the caller's kind. The skill asks when the read yields nothing; a hook
# cannot ask, so an unreadable kind ends the run rather than defaulting.
kind=$(herdr pane current --current 2>/dev/null | jq -r '.result.pane.agent // empty' 2>/dev/null)
case "$kind" in claude | codex | omp | pi) ;; *) exit 0 ;; esac
# The fence above always shows `/`, per CONVENTIONS.md's Handoff section, on the
# assumption a Codex person retypes it as `$`; this pane has no person doing that,
# so convert before staging. phase/artifact parsing above already ran on the raw form.
case "$kind" in codex) cmd="\$${cmd#/}" ;; esac

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
  split=$(herdr pane split --current --direction "$dir" --cwd "$cwd" --no-focus 2>/dev/null)
  pane=$(jq -r '.result.pane.pane_id // empty' <<<"$split" 2>/dev/null)
  created_pane=$pane
else
  created=$(herdr tab create --workspace "${HERDR_WORKSPACE_ID:-}" --cwd "$cwd" --label "$slug" --no-focus 2>/dev/null)
  pane=$(jq -r '.result.root_pane.pane_id // empty' <<<"$created" 2>/dev/null)
  created_tab=$(jq -r '.result.tab.tab_id // .result.tab.id // .result.tab_id // empty' <<<"$created" 2>/dev/null)
  # Without a tab identity the root pane may belong to an unowned tab. Close it
  # immediately and stop rather than proceeding with an ambiguous cleanup handle.
  if test -z "$created_tab"; then
    created_pane=$pane
    herdr pane close "$pane" >/dev/null 2>&1
    exit 0
  fi
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
# CLI errors are JSON on stderr with exit status 1, so both streams are kept
# together and the branch reads the code, not the exit status: agent_not_ready
# can appear on a non-zero exit, and every other non-zero exit still stops.
agent_args=()
if test -n "$selected_model"; then agent_args=(-- --model "$selected_model"); fi
start=$(herdr agent start "$name" --kind "$kind" --pane "$pane" "${agent_args[@]}" 2>&1)
rc=$?
case "$start" in
  *agent_not_ready*) herdr agent wait "$name" --until idle --until "done" --timeout 30000 >/dev/null 2>&1 || exit 0 ;;
  *) test "$rc" = 0 || exit 0 ;;
esac
herdr pane rename "$pane" "$slug/$phase" >/dev/null 2>&1 || exit 0
herdr pane send-text "$pane" "$cmd" >/dev/null 2>&1 || exit 0
done=1
exit 0
