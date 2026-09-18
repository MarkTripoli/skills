---
type: implementation
completed_phase: 2
summary: "Phase 2 adds the Archon gate mode to `skills/delivery/herd-next/SKILL.md` as a `## Archon gate mode` section: run discovery from `archon workflow status --json`, a foreground `archon workflow wait`, the paused-state read that takes `working_path`, `nodeId`, `message`, `decisions[].id`, and `resolved` out of `archon workflow get --json`, the notification, and the review pane opened at the run's own worktree with the artifact read staged and the `archon workflow respond` command reported rather than staged. The third terminal reply `references/herd_next_gate_answer.md` ships and is registered in `ANSWER_INVENTORY` between the two rows Phase 1 added; the `workflows/delivery.md` row now names the gate mode. All four of the phase's automated checks pass, including both Archon field-shape probes against a live run on this machine. Phase 3 consumes the same `SKILL.md`, appending a `## Optional Stop hook` section and the new `references/stop_hook.sh`, and touches only `README.md` and `docs/getting-started.md` besides."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/herdr-plugin-delivery-flow/task.md`
- plan artifact: `.agents/tasks/herdr-plugin-delivery-flow/04-plan-herdr-plugin.md`
- phase range: Phase 2 only

## Child Workers
- implementer: none. The session directive for this run forbids the Agent tool unless the user asks for it, so the implementer role was performed inline, as the conventions' Child workers section allows when no subagent mechanism is available. The phase is four edits in three files, all specified verbatim in the plan.
- reviewer: none; the orchestrator verified the diff and ran every check itself.

## Completed Work
- `skills/delivery/herd-next/SKILL.md:75-123`: new `## Archon gate mode` section, placed after the handoff steps and after the shared never-close and never-target-by-focus rules so those rules still read as applying to both modes. It holds the plan's five parts: entry on `--run <run-id>` with step 1's guard applied first; run discovery through `archon workflow status --json | jq -r '.runs[] | ...'`, one running or paused run taken without asking and several meaning a question; the foreground `archon workflow wait "$run_id" --json`, with the reason it cannot detach (`interactive: true` packs refuse `--detach` on a fresh launch, `workflows/delivery.md:147`); the paused-state read that assigns `status`, `cwd`, `node`, `msg`, `decisions`, and `resolved` from one `archon workflow get --json` call; and the notify-then-open sequence `notification show`, `pane split --cwd "$cwd" --no-focus`, `agent start`, `pane rename "$slug/$phase gate"`, `pane send-text`. The live-gate rule is `status == paused` with `resolved` empty, any other state printing the skipped reply with the reason `the run is not paused at a gate`; the phase label strips a trailing `__cycle`. The decision command `archon workflow respond <run-id> <decision> "<what should change>"` is reported in the reply, not staged, because a pane holds one staged line at a time, and `respond` covers every id in `decisions[]`. The closing paragraph names the tab-versus-split, agent-name, kind, and stage-not-submit rules as already stated for the handoff mode.
- `skills/delivery/herd-next/references/herd_next_gate_answer.md`: new file, the plan's section 2.2 wording verbatim. Terminal: zero fenced blocks, no `Next action:` label, no fresh-session sentence, which is what `TERMINAL_ANSWER` requires (`scripts/validate.mjs:272-280`). It carries no `{artifact_link}`, and correctly so: the `HUMAN_GATE_ANSWERS` filter matches only the `create-*`, `iterate-*`, `implement-*`, `describe-pr`, `resolve-pr-reviews`, and `reproduce-bug` paths (`scripts/validate.mjs:123-129`), so a `herd-next` reply is not held to the gate-reply shape.
- `scripts/validate.mjs:58`: one `ANSWER_INVENTORY` row, `"herd-next/references/herd_next_gate_answer.md": TERMINAL_ANSWER`, in alphabetical position between the `herd_next_answer.md` and `herd_next_skipped_answer.md` rows Phase 1 added. `EXPECTED_SKILL_COUNT` is unchanged at 42, as the plan states; the answer-template count moves 56 to 57.
- `workflows/delivery.md:239`: the `herd-next` row's `Runs in` cell extended with the gate mode, still one line. The plan's diff elides the middle of the existing cell with `...`; the existing text was kept byte-for-byte and the new clause appended after `without submitting it`.
- No other file changed. `.claude-plugin/plugin.json` needs no regeneration: the skill directory already exists in the manifest from Phase 1 and this phase adds no skill.

## Automated Verification
- command: `npm test`
- result: pass
- evidence: `ok: 42 skills, 57 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`; `plugin in sync (version 2.1.0, 35 skills, 7 agents)`; `node --test tests/` reports `tests 61`, `pass 61`, `fail 0`, `duration_ms 27464`.

- command: `archon workflow status --json | jq -e '.runs | type == "array"'`
- result: pass, exit 0
- evidence: prints `true`. The command's own output lists two `delivery-full` runs with `id`, `workflow_name`, and `status`, so the discovery line in the skill body is correct on this machine.

- command: `archon workflow get d428fde0-6d62-45e0-80ec-16d6fd565727 --json | jq -e 'has("working_path") and (.metadata | has("approval"))'`
- result: pass, exit 0
- evidence: prints `true`. The same run reports `status: "running"`, `working_path: "/Users/marktripoli/.archon/workspaces/MarkTripoli/skills/worktrees/herdr-plugin-delivery-flow"`, and `metadata.approval` keys `bodyGateId`, `captureResponse`, `decisions`, `decisionsAuthored`, `iteration`, `message`, `nodeId`, `resolved`, `type`. Every field the gate mode reads exists, and `resolved` being present on a run that is past its gate is the live-gate rule working in the direction the plan predicted.

- command: `git grep -c "herd_next_gate_answer" scripts/validate.mjs skills/delivery/herd-next/SKILL.md`
- result: pass, exit 0
- evidence: `scripts/validate.mjs:1` and `skills/delivery/herd-next/SKILL.md:1`, one occurrence in each file.

## Deferred Human Evidence

- A run of the gate mode end to end against a scratch `delivery-lean` run, confirming the notification appears and the review pane opens at the run's worktree. Not executed: it needs a live Herdr server with `HERDR_ENV=1` and an Archon run parked at a gate, neither of which this non-interactive session has. Pointer: plan section "Phase 2 / Deferred human evidence" (`04-plan-herdr-plugin.md:330-332`), and the plan's Human Review `### Verify` box on `herdr pane send-text` staging behaviour (`04-plan-herdr-plugin.md:422`), which the gate mode depends on exactly as the handoff mode does.

## Commit Handoff
The phase commit was created after all four automated checks passed. Code paths staged explicitly: `skills/delivery/herd-next/SKILL.md`, `skills/delivery/herd-next/references/herd_next_gate_answer.md`, `scripts/validate.mjs`, `workflows/delivery.md`. The task directory is committed separately as `docs(task): implementation artifact`.

## Human Review

### Review targets

- `skills/delivery/herd-next/SKILL.md`, the `## Archon gate mode` section: every Archon and Herdr command in it is prose, so `npm test` proves only that the file parses, links, and references resolve. The two field-shape probes above are the only machine proof that `working_path` and `metadata.approval` exist; nothing proves the notification fires or the pane opens.
- Section placement: the gate mode sits after the shared rules paragraph rather than before it, so that paragraph keeps applying to both modes instead of reading as part of the gate section. The plan said "after the handoff steps", which this satisfies.
- The live-gate rule, `status == paused` and `resolved` empty. It was verified only in the negative here: the observed run is `running` and already carries `resolved`. The positive case, a paused run with the key absent, was observed on 2026-09-17 when the plan was written (`04-plan-herdr-plugin.md:265`) and not re-observed in this phase.
- `references/herd_next_gate_answer.md`: it tells the reader to run `archon workflow respond` from any pane, while the skill stages only the artifact read. That split is deliberate, a pane holds one staged line, but it means the decision is the one step of the gate flow the skill never stages for the user.

### Verify

- [ ] In a live Herdr pane with an Archon run parked at a gate, `archon workflow get <run> --json` reports `status: "paused"` with no `resolved` key, and the gate mode opens the review pane at the run's `working_path`, not at the caller's `$PWD`.
- [ ] `herdr notification show "<title>" --body "<text>" --sound request` raises a visible notification on this machine.
- [ ] A gate whose pack authored a decision id beyond `approve` and `reject` is reported in the reply's "one line naming any decision beyond approve and reject" slot rather than dropped.

### Known limits

- `$dir`, `$kind`, `$name`, and `$slug` in the gate mode's pane commands are defined by the handoff mode's steps 4, 5, and 6; the section names those rules as shared instead of restating them, which is what the plan asked for but does mean the gate section cannot be read alone.
- The gate mode splits a pane and never creates a tab, unlike the handoff mode. The plan's snippet has only `pane split`, and the closing paragraph says the tab-versus-split rule is shared, so a busy tab in gate mode resolves through that shared rule rather than through a command shown in the section.
- Backups for this phase went to `.backups/herd-next-SKILL.md.bak-phase2` and `.backups/workflows-delivery.md.bak-phase2`, but the `scripts/validate.mjs` backup went outside the repository to `~/.backups/skills-herdr-plugin-delivery-flow/validate.mjs.bak-phase2`. A copy of `validate.mjs` under `.backups/` fails the banned-token scan, which skips only the real `scripts/validate.mjs` (`scripts/validate.mjs:147`) and would match that file's own regex literals in any copy. This is the same trap Phase 1 recorded.
- Phase 3 is unstarted: `SKILL.md` carries no `## Optional Stop hook` section and `references/stop_hook.sh` does not exist.
