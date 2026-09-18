#!/usr/bin/env bash
# Claude Code Stop hook: stage the next delivery phase in a new Herdr pane.
# Install by hand in ~/.claude/settings.json under "hooks" -> "Stop":
#   {"hooks":[{"type":"command","command":"<path to this file>","timeout":30}]}
# Not installed by this collection's installer, which never writes settings you own.
set -u
test "${HERDR_ENV:-}" = 1 || exit 0
payload=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
message=$(jq -r '.last_assistant_message // empty' <<<"$payload")
line=$(printf '%s\n' "$message" | grep -oE '^/[a-z0-9-]+( @[^ ]+)?$' | tail -1)
test -n "$line" || exit 0
printf '%s\n' "$line" > "${TMPDIR:-/tmp}/herd-next-pending"
exit 0
