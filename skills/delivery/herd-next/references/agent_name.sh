# Sourced by SKILL.md step 6 and stop_hook.sh. Defines agent_name. POSIX sh: works when sourced into bash or zsh.
# agent_name <slug> <phase> [existing-name...] prints a Herdr agent name of at most 32
# characters, [a-z][a-z0-9-]*, ending in the phase. A name already in the list gets -2, -3.
# Returns 1 when the name would not start with a lowercase letter.
# The body is a subshell so no variable leaks into the caller's shell.
agent_name() (
  slug=$1 phase=$2 n=1
  shift 2
  stem=$((32 - ${#phase} - 1))
  if [ "$stem" -ge 1 ]; then slug=$(printf '%s' "$slug" | cut -c1-"$stem"); fi
  base=$(printf '%s-%s' "$slug" "$phase" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-\n' '-' | tr -s '-' | cut -c1-32)
  base=${base%-}
  case "$base" in [a-z]*) ;; *) return 1 ;; esac
  cand=$base
  while [ "$#" -gt 0 ] && printf '%s\n' "$@" | grep -Fqx -- "$cand"; do
    n=$((n + 1))
    suffix="-$n"
    head=${base%-"$phase"}
    room=$((32 - ${#phase} - 1 - ${#suffix}))
    if [ "$head" != "$base" ] && [ "$room" -ge 1 ]; then
      cand=$(printf '%s' "$head" | cut -c1-"$room")
      cand=${cand%-}-$phase$suffix
    else
      cand=$(printf '%s' "$base" | cut -c1-$((32 - ${#suffix})))
      cand=${cand%-}$suffix
    fi
  done
  printf '%s\n' "$cand"
)
