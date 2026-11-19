#!/usr/bin/env bash
# Human-in-the-loop reproduction loop for a bug that needs a person to act.
# Copy this file to a scratch path, edit the lines between the markers, then run it:
#   bash <copy>
# The agent runs the script; the user follows the prompts in the terminal.
#
# Helpers:
#   step "<instruction>"        show an instruction and wait for Enter
#   capture VAR "<question>"    show a question and store the typed answer in VAR
#
# Captured values print as KEY=VALUE at the end for the agent to read. They are echoed
# to the terminal, so capture observations only; leave signing in to the user as a step.

set -euo pipefail

step() {
  printf '\n>>> %s\n' "$1"
  read -r -p "    [Enter when done] " _
}

capture() {
  local var="$1" question="$2" answer
  printf '\n>>> %s\n' "$question"
  read -r -p "    > " answer
  printf -v "$var" '%s' "$answer"
}

# --- edit below ---------------------------------------------------------

step "Open the volunteer signup app at http://localhost:3000 and sign in."

capture ERRORED "Click 'Export roster'. Did an error appear? (y/n)"

capture ERROR_MSG "Paste the error message, or 'none':"

# --- edit above ---------------------------------------------------------

printf '\n--- Captured ---\n'
printf 'ERRORED=%s\n' "$ERRORED"
printf 'ERROR_MSG=%s\n' "$ERROR_MSG"
