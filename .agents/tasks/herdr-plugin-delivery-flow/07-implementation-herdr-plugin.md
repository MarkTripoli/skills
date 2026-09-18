---
type: implementation
completed_phase: 3
summary: "Phase 3 ships `skills/delivery/herd-next/references/stop_hook.sh`, the opt-in Claude Code `Stop` hook that records the handoff line a finishing phase printed, plus the `## Optional Stop hook` section in the skill body and the `herd-next` rows in `README.md` and `docs/getting-started.md`. Step 2 of the skill body was extended to read and delete `${TMPDIR:-/tmp}/herd-next-pending`, closing a gap that would have left the hook writing a file nothing read. This is the plan's terminal phase: all three phases are implemented and `npm test` passes at 61/61, so the next consumer is the pull request description, not another phase."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/herdr-plugin-delivery-flow/task.md`
- plan artifact: `.agents/tasks/herdr-plugin-delivery-flow/04-plan-herdr-plugin.md`
- phase range: Phase 3 of 3 (terminal)

## Child Workers
- implementer: `agent-implementer`, one run for Phase 3, reported four files changed with every Phase 3 check run and passing
- reviewer: none; the phase was verified directly against the repository

## Completed Work
- `skills/delivery/herd-next/references/stop_hook.sh` (new, executable): reads one JSON object on stdin, extracts the last `^/[a-z0-9-]+( @[^ ]+)?$` line from `last_assistant_message`, writes it to `${TMPDIR:-/tmp}/herd-next-pending`, and exits 0 on every path, including a missing `HERDR_ENV`, a missing `jq`, and no matching line. Byte-for-byte the snippet in plan section 3.1.
- `skills/delivery/herd-next/SKILL.md`: added the `## Optional Stop hook` section from plan section 3.2, naming the reference file, the `~/.claude/settings.json` install path, Codex's equivalent `hooks.json`, and the Oh My Pi and Pi limit.
- `skills/delivery/herd-next/SKILL.md` step 2: added the `${TMPDIR:-/tmp}/herd-next-pending` fallback with its delete-after-read, which plan section 3.1 states in prose but section 3.2's diff omitted. Without it the hook wrote a file no step read.
- `README.md:82`: `herd-next` (Herdr pane handoff) added to the Utilities row.
- `docs/getting-started.md:164`: `herd-next` (opens the next phase in a Herdr pane) added to the by-hand skill list.
- Commit `1037f28 feat(delivery): add the opt-in herd-next Stop hook`, staged with explicit code paths and no task artifacts.

## Automated Verification
- command: `npm test`
- result: pass
- evidence: `tests 61 / pass 61 / fail 0`, three suites; re-run after the step 2 edit and still 61/61

- command: `bash -n skills/delivery/herd-next/references/stop_hook.sh`
- result: pass
- evidence: `exit=0`, no syntax diagnostics

- command: `printf '{"last_assistant_message":"done\\n\\n/create-plan @04-plan-herdr-plugin.md"}' | HERDR_ENV=1 TMPDIR=$(mktemp -d) bash skills/delivery/herd-next/references/stop_hook.sh; echo "exit=$?"`
- result: pass
- evidence: `exit=0`; re-run with `TMPDIR` captured, `$TMPDIR/herd-next-pending` held exactly `/create-plan @04-plan-herdr-plugin.md`

- command: `printf '{}' | HERDR_ENV= bash skills/delivery/herd-next/references/stop_hook.sh; echo "exit=$?"`
- result: pass
- evidence: `exit=0`; the captured `TMPDIR` listing was empty, so no file was written

- command: `git grep -n "herd-next" README.md docs/getting-started.md`
- result: pass
- evidence: `README.md:82` prints the Utilities row and `docs/getting-started.md:164` prints the by-hand list line

## Deferred Human Evidence

- The hook installed in a real `~/.claude/settings.json` and observed firing at the end of a phase. Not executed here; the install block is in the script's own header comment at `skills/delivery/herd-next/references/stop_hook.sh:3-4`.
- Carried from Phase 1: a scratch-pane run of `/herd-next` at the end of a phase, confirming the new pane carries the staged command unsubmitted and that focus stayed in the calling pane.
- Carried from Phase 2: a run of the gate mode end to end against a scratch `delivery-lean` run, confirming the notification appears and the review pane opens at the run's worktree.

## Commit Handoff
The phase commit `1037f28` was created after all five automated checks passed. The ticked plan and this receipt commit separately as `docs(task): implementation artifact`. Backups of every edited file are under `.backups/`, which is untracked and not committed.

## Human Review

### Review targets

- `skills/delivery/herd-next/SKILL.md` step 2: the pending-file fallback is an addition beyond plan section 3.2's diff, taken from section 3.1's prose. Confirm the read-then-delete order reads correctly for a skill that may be invoked twice in one session.
- `skills/delivery/herd-next/references/stop_hook.sh:10-12`: a malformed payload makes `jq` print a parse error to stderr and the hook still exits 0 with no file written. Silent on purpose, since a `Stop` hook must never block a session, but it means a hook misfiring leaves no trace in the session either.
- The three deferred evidence items above are the whole of the runtime proof for this skill. Nothing in the test suite exercises a real Herdr pane, an agent start, or an Archon gate.

### Verify

- Install `stop_hook.sh` in a real `~/.claude/settings.json` under `hooks` -> `Stop` and confirm it writes `${TMPDIR:-/tmp}/herd-next-pending` at the end of a phase that printed a handoff fence.
- Confirm a Claude Code `Stop` hook payload actually carries `last_assistant_message`; the field name was taken from the plan, not from a captured payload on this machine.
- Confirm `npm test` passes on a clean checkout of this branch at 61/61 with 42 skills.

### Known limits

- The `Stop` hook covers Claude Code and Codex only; Oh My Pi and Pi expose in-process extension callbacks, so their users invoke the skill by hand.
- Superseded by `08-implementation-herdr-plugin.md`. The pending-file handoff this receipt describes, its fixed-path race between two panes, and the hook's stop-at-the-line behaviour were all removed under review: the hook now opens the pane itself and writes no file. Read 08 for the shipped Phase 3.
- `last_assistant_message` is unverified against a live payload, so a Claude Code release that renames the field silently turns the hook into a no-op that still exits 0.
