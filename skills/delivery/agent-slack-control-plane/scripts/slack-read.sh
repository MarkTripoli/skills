#!/usr/bin/env bash
# Read a thread's replies newer than <oldest>. Prints one {user,ts,text} JSON object per line, parent first.
# Usage: slack-read.sh <channel> <thread_ts> <oldest>
set -euo pipefail
[ $# -eq 3 ] || { echo "usage: slack-read.sh <channel> <thread_ts> <oldest>" >&2; exit 2; }
command -v curl >/dev/null && command -v node >/dev/null || { echo "curl and node are required" >&2; exit 2; }
env_file=${SLACK_AGENT_ENV_FILE:-$HOME/.config/agent-slack/env}
[ -r "$env_file" ] || { echo "Slack env file missing or unreadable: $env_file" >&2; exit 2; }
set -a; . "$env_file"; set +a
: "${SLACK_AGENT_BOT_TOKEN:?SLACK_AGENT_BOT_TOKEN is not set}"
resp=$(curl -sS -G https://slack.com/api/conversations.replies -H "Authorization: Bearer $SLACK_AGENT_BOT_TOKEN" \
  --data-urlencode "channel=$1" --data-urlencode "ts=$2" --data-urlencode "oldest=$3") || { echo "curl failed" >&2; exit 1; }
printf '%s' "$resp" | node -e 'let t=require("fs").readFileSync(0,"utf8"),r;try{r=JSON.parse(t)}catch{r={}}
if(r.ok===true){for(const m of r.messages||[])console.log(JSON.stringify({user:m.user,ts:m.ts,text:m.text}))}else{console.error("slack error: "+(r.error||"unparseable response"));process.exit(1)}'
