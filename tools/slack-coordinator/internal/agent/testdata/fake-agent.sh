#!/bin/sh
# Stand-in agent for run_test.go. FAKE_MODE selects the behavior; the runner
# sets the working directory to the run directory, so relative paths land
# there.
set -u

case "${FAKE_MODE:-}" in
  result)
    printf '%s' "$FAKE_TEXT" > result.md
    ;;
  proposal)
    printf '%s' "$FAKE_TEXT" > result.md
    cat > proposal.json <<'EOF'
{"watch": ["C123"], "trigger": {"kind": "schedule", "daily": "09:00", "tz": "UTC"},
 "instruction": "summarize the day", "deliver_to": {"dm": true}, "summary": "daily summary"}
EOF
    ;;
  stdout)
    printf '%s\n' "$FAKE_TEXT"
    ;;
  empty)
    ;;
  sleep)
    sleep 300 &
    echo $! > child.pid
    wait
    ;;
  fail)
    i=1
    while [ "$i" -le 25 ]; do
      echo "line $i" >&2
      i=$((i + 1))
    done
    exit 3
    ;;
  env)
    env > result.md
    ;;
  *)
    echo "unknown FAKE_MODE: ${FAKE_MODE:-}" >&2
    exit 2
    ;;
esac
