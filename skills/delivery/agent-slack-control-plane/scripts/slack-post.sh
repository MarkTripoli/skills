#!/usr/bin/env bash
# Post, reply to, or update a Slack message from a text file. Prints the channel ID and message ts on success.
# Usage: slack-post.sh post <file> [channel] | reply <file> <channel> <thread_ts> | update <file> <channel> <ts>
set -euo pipefail
mode=${1:-}; file=${2:-}
case "$mode" in
  post) [ $# -ge 2 ] && [ $# -le 3 ] ;;
  reply|update) [ $# -eq 4 ] ;;
  *) false ;;
esac || { echo "usage: slack-post.sh post <file> [channel] | reply <file> <channel> <thread_ts> | update <file> <channel> <ts>" >&2; exit 2; }
[ -f "$file" ] || { echo "message file not found: $file" >&2; exit 2; }
command -v curl >/dev/null && command -v node >/dev/null || { echo "curl and node are required" >&2; exit 2; }
env_file=${SLACK_AGENT_ENV_FILE:-$HOME/.config/agent-slack/env}
[ -r "$env_file" ] || { echo "Slack env file missing or unreadable: $env_file" >&2; exit 2; }
set -a; . "$env_file"; set +a
: "${SLACK_AGENT_BOT_TOKEN:?SLACK_AGENT_BOT_TOKEN is not set}"
args=(--data-urlencode "text@$file")
case "$mode" in
  post) channel=${3:-${SLACK_AGENT_CHANNEL_ID:-}}; : "${channel:?no channel: pass one or set SLACK_AGENT_CHANNEL_ID}"
        method=chat.postMessage; args+=(--data-urlencode "channel=$channel") ;;
  reply) method=chat.postMessage; args+=(--data-urlencode "channel=$3" --data-urlencode "thread_ts=$4") ;;
  update) method=chat.update; args+=(--data-urlencode "channel=$3" --data-urlencode "ts=$4") ;;
esac
status=0
resp=$(curl -sS "https://slack.com/api/$method" -H "Authorization: Bearer $SLACK_AGENT_BOT_TOKEN" "${args[@]}") || status=$?
rm -f "$file"
[ "$status" -eq 0 ] || { echo "curl failed ($status)" >&2; exit 1; }
printf '%s' "$resp" | node -e 'let t=require("fs").readFileSync(0,"utf8"),r;try{r=JSON.parse(t)}catch{r={}}
if(r.ok===true){console.log(r.channel+" "+r.ts)}else{console.error("slack error: "+(r.error||"unparseable response"));process.exit(1)}'
