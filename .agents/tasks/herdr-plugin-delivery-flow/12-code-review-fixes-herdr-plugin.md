---
type: code-review-fixes
date: 2026-09-17
branch: herdr-plugin-delivery-flow
review_artifact: .agents/tasks/herdr-plugin-delivery-flow/11-code-review-herdr-plugin.md
reviewed_head_sha: 3497cbb14a4974ab69417e1e878803154e4ca21f
fixed_head_sha: pending (workflow engine commits after this phase; working tree only at write time)
status: complete
summary: "Fixed all three major findings and four of five advisories from 11-code-review-herdr-plugin.md. stop_hook.sh now tracks any pane or tab it creates and closes it in a trap on every exit that does not reach the final staged command (CR-001), documents a 90s install timeout that covers its own worst-case wait instead of one shorter than it (CR-002), and walks up from the payload cwd to find .agents/tasks/ (ADV-005). SKILL.md's Archon gate mode now derives $slug from the same task-directory string $artifact already reads, and gets $dir, $pane, $kind, and $name by explicit reuse of steps 4 through 6 with the $cwd-for-$PWD substitution named, instead of using four undefined variables (CR-003). Step 5's split direction gets the same empty-read fallback the hook already had (ADV-004), Step 8 no longer keys submission on a task.md key nothing writes (ADV-001), and the stale delivery.md:252 citation is now a heading reference that survives future line insertions (ADV-002). ADV-003 (no runtime check that a parsed name is a real skill) is left advisory: a Stop hook has no reliable way to know where the skill collection is installed. npm test (61/61), scripts/validate.mjs, scripts/check-commits.mjs, shellcheck, and bash -n all pass on the fixed files."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: none. `base_sha` and `head_sha` in the review artifact are unchanged; this phase's edits are uncommitted working-tree changes to the two files the review flagged.
- unrelated changes preserved: yes. Only `skills/delivery/herd-next/SKILL.md` and `skills/delivery/herd-next/references/stop_hook.sh` were touched; no other tracked file was modified.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-001

- disposition: fixed
- evidence: `stop_hook.sh` now sets `created_pane`/`created_tab` when it opens a sibling pane or a new tab, and installs `trap cleanup EXIT` right after `set -u`. `cleanup()` closes `herdr tab close "$created_tab"` (or, absent a tab, `herdr pane close "$created_pane"`) unless `done=1` was reached, which now happens only after the final `pane send-text` succeeds. Every earlier `exit 0` - a bad kind, a name collision, a failed `agent start`/`agent wait`/`pane rename`/`pane send-text` - now runs the trap and removes what it created instead of abandoning it, including the review-loop collision the script's own comment names.
- files changed: `skills/delivery/herd-next/references/stop_hook.sh:19-33,104-110,131-137`
- regression check: `bash -n skills/delivery/herd-next/references/stop_hook.sh` and `shellcheck` on the same file both exit 0; `npm test` 61/61.

### CR-002

- disposition: fixed
- evidence: the install snippet's documented `timeout` in the header comment moved from 30 to 90 (seconds), with a comment stating the worst case it covers: up to 30s in `agent start`'s own readiness wait plus up to 30s in the `agent wait` fallback plus the other round trips, and a note to raise it further if either `--timeout` value grows. Claude Code's own hook kill no longer lands inside the blocked-startup path the script exists to handle.
- files changed: `skills/delivery/herd-next/references/stop_hook.sh:4-9`
- regression check: `bash -n`/`shellcheck` clean; no behavior change to the waits themselves, only the documented budget around them.

### CR-003

- disposition: fixed
- evidence: `SKILL.md`'s Archon gate mode block previously used `$slug`, `$dir`, and `$name` with nothing in that block deriving them. It now states `$artifact` is the task directory named in `$msg` resolved against `$cwd` (moved earlier, before first use), that `$slug` is that directory's basename, and that `$dir`, `$pane`, `$kind`, and `$name` come from reusing steps 4 through 6 verbatim with one substitution named explicitly (`$cwd` in place of `$PWD` everywhere a pane or tab is opened; the busy check still reads the caller's own tab/pane via `$HERDR_TAB_ID`/`$HERDR_PANE_ID`). The bash block under "Notify, start the agent, and stage the read" no longer contains a `pane=$(herdr pane split ...)` line with an undefined `$dir`, since that pane is now produced by the named reuse of step 5.
- files changed: `skills/delivery/herd-next/SKILL.md:104-125`
- regression check: `npm test` 61/61 (validator's terminal-answer check for `herd_next_gate_answer.md` is unaffected by this prose-only change); read-through confirms every variable referenced in the gate mode's final bash block (`$slug`, `$phase`, `$msg`, `$name`, `$kind`, `$pane`, `$artifact`) is now defined earlier in the same section, either directly or by the named reuse. No `herdr` call was made to exercise the gate mode live; that gap is unchanged from the review (no run is currently parked at a gate on this machine).

## Advisory Decisions

### ADV-001

- disposition: accepted
- reason: dropped the `task.md` `gates: none` clause from Step 8 (`SKILL.md:70`); submission is now keyed solely on the caller passing `--submit`, matching the suggestion and removing the branch that could never fire.

### ADV-002

- disposition: accepted
- reason: the guard's citation (`SKILL.md:18`) now reads `workflows/delivery.md`, "Running skills by hand" instead of a line number, per the suggestion to cite the section heading so the reference survives future insertions.

### ADV-003

- disposition: left_advisory
- reason: rejecting an unrecognized skill name at run time needs to know where the installed skill collection lives, and a Stop hook only receives the session's `cwd` and the Stop payload - it has no reliable path to the collection root when the skills are installed as a marketplace plugin rather than a local checkout. Adding that discovery is a larger change than this review's scope; both modes still exit 0 and change nothing on an unresolvable command, which bounds the damage of an unrecognized name to a stray labeled pane rather than a wrong action.

### ADV-004

- disposition: accepted
- reason: added the same `case "$dir" in right|down) ;; *) dir=down ;; esac` fallback to Step 5's code fence in `SKILL.md:44-48`, so the skill body now matches `stop_hook.sh:73` exactly. The drift is closed by making the behavior match rather than by recording it as a difference.

### ADV-005

- disposition: accepted
- reason: `stop_hook.sh` now walks up from `$cwd` (renamed the search root to `$root`) to the nearest ancestor holding `.agents/tasks/` before either task-directory lookup, so a session started in a repository subdirectory still finds the task tree; the pane and tab the hook opens still use `$cwd` itself, unchanged.

## Verification

- command: `npm test`
- result: exit 0, `tests 61 / pass 61 / fail 0`.
- command: `node scripts/validate.mjs`
- result: `ok: 42 skills, 57 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command: `node scripts/check-commits.mjs main..HEAD`
- result: `ok: 15 subjects`.
- command: `shellcheck skills/delivery/herd-next/references/stop_hook.sh`
- result: exit 0, no output.
- command: `bash -n skills/delivery/herd-next/references/stop_hook.sh`
- result: exit 0.

## Remaining Blocks

- None.
