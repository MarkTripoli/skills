---
type: implementation
completed_phase: 1
summary: "Phase 1 ships the `herd-next` skill's by-hand handoff mode as `skills/delivery/herd-next/` with two terminal answer templates, registers both in `ANSWER_INVENTORY`, raises `EXPECTED_SKILL_COUNT` to 42, adds the `workflows/delivery.md` phase-table row and by-hand list entry, regenerates the plugin manifest, and adds a minor changeset. All five of the phase's automated checks pass, so the skill is discovered in the delivery group and the collection validates at 42 skills. Phase 2 consumes the same `SKILL.md` and the same `ANSWER_INVENTORY` object, adding the Archon gate mode section and the third terminal template beneath the rows this phase inserted."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/herdr-plugin-delivery-flow/task.md`
- plan artifact: `.agents/tasks/herdr-plugin-delivery-flow/04-plan-herdr-plugin.md`
- phase range: Phase 1 only

## Child Workers
- implementer: `agent-implementer` (opus), one run for Phase 1
- reviewer: none; the orchestrator verified the diff and re-ran every check itself

## Completed Work
- `skills/delivery/herd-next/SKILL.md`: new file. Frontmatter carries only `name` and `description`; line 6 is the shared writing-guide sentence byte-exact. The body holds the nine numbered steps from plan section 1.1: the `HERDR_ENV` guard, the handoff-line parse, the slug and phase derivation, the kind read from `herdr pane current --current | jq -r '.result.pane.agent'`, the split-or-tab decision with the direction read from the caller's own `rect` in `herdr pane layout`, the 32-character agent-name rule, the start/rename/send-text sequence with the `agent_not_ready` retry, the stage-not-submit rule with its `--submit` and `gates: none` exceptions, and the reply. The closing paragraph states the never-close, never-target-by-focus, never-`server stop`, no-emoji, no-em-dash rules.
- `skills/delivery/herd-next/references/herd_next_answer.md` and `.../herd_next_skipped_answer.md`: new terminal replies, both with no fenced block, no `Next action:` label, and no fresh-session sentence, as `TERMINAL_ANSWER` requires.
- `scripts/validate.mjs`: `EXPECTED_SKILL_COUNT` 41 to 42; the two templates added to `ANSWER_INVENTORY` in alphabetical position between the `gather-sources` and `implement-outline` keys.
- `workflows/delivery.md:239`: the `herd-next` phase-table row after the `deliver` row. `workflows/delivery.md:253`: `herd-next` appended to the by-hand skill list.
- `.claude-plugin/plugin.json`: regenerated with `node scripts/sync-plugin.mjs`, not hand-edited; `./skills/delivery/herd-next` lands in sorted position.
- `.changeset/herd-next-skill.md`: new `minor` changeset with the plan's wording.
- Two unplanned edits the child worker made were reverted before the commit, so the phase diff matches the plan exactly. See Known limits.

## Automated Verification
- command: `npm test`
- result: pass
- evidence: `ok: 42 skills, 56 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`; `plugin in sync (version 2.1.0, 35 skills, 7 agents)`; `node --test tests/` reports `tests 61`, `pass 61`, `fail 0`.

- command: `node scripts/validate.mjs`
- result: pass, exit 0, no failure line and no `herd-next` mention in the output
- evidence: `ok: 42 skills, 56 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`

- command: `node scripts/sync-plugin.mjs --check`
- result: pass, exit 0
- evidence: `plugin in sync (version 2.1.0, 35 skills, 7 agents)`

- command: `node -e 'const {scanSkills}=await import("./scripts/lib/layout.mjs");const s=scanSkills("skills");if(s.problems.length)throw new Error(JSON.stringify(s.problems));if(!s.skills.find(x=>x.name==="herd-next"&&x.group==="delivery"))throw new Error("herd-next not discovered in the delivery group")' --input-type=module`
- result: pass, exit 0, no output
- evidence: no `problems` from `scanSkills`, and `herd-next` present with `group === "delivery"`

- command: `git grep -n "herd-next" workflows/delivery.md`
- result: pass, exit 0, two lines
- evidence: `workflows/delivery.md:239` is the phase-table row; `workflows/delivery.md:253` is the by-hand list line.

## Deferred Human Evidence

- A scratch-pane run of `/herd-next` at the end of a phase, confirming the new pane carries the staged command unsubmitted and that focus stayed in the calling pane. Not executed: it needs a live Herdr server and a session with `HERDR_ENV=1`. Pointer: plan section "Phase 1 / Deferred human evidence" (`04-plan-herdr-plugin.md:222-224`) and the plan's Human Review `### Verify` box on `herdr pane send-text` staging behaviour (`04-plan-herdr-plugin.md:422`).

## Commit Handoff
The phase commit was created after all five automated checks passed. Code paths staged explicitly: `skills/delivery/herd-next/`, `scripts/validate.mjs`, `workflows/delivery.md`, `.claude-plugin/plugin.json`, `.changeset/herd-next-skill.md`. The task directory was committed separately as `docs(task): implementation artifact`.

## Human Review

### Review targets

- `skills/delivery/herd-next/SKILL.md` steps 4 and 5: the two corrections the plan made against the installed CLI. The kind reads from `herdr pane current --current`, not from `herdr agent get --current`, which fails with `agent_not_found`; the split direction reads from the caller's own `rect` inside `herdr pane layout`, not from the tab area. Both are prose in a skill body, so nothing in `npm test` can prove them; only a live pane can.
- `skills/delivery/herd-next/references/herd_next_skipped_answer.md`: it points back at the fence the previous phase printed rather than reprinting it, because a template reproducing the caller's fence cannot be registered in `ANSWER_INVENTORY`, whose values are fixed skill names. This is the plan's departure from the design's wording.
- `scripts/validate.mjs`: this file is edited again in Phase 2, in the same `ANSWER_INVENTORY` object. The `herd-next` rows are alphabetically adjacent, so Phase 2's insertion sits between the two rows this phase added.
- Plan step 4's snippet is written as a `bash` fence, where the plan shows a `diff` fence with `+` prefixes. The content is identical; the fence style matches steps 1, 5, 6, and 7 in the same file.

### Verify

- [ ] In a live Herdr pane, `herdr pane current --current | jq -r '.result.pane.agent'` prints one of `claude`, `codex`, `omp`, `pi` in each runtime a user runs, not only `omp`.
- [ ] In a scratch pane, `herdr pane send-text <pane> "<text>"` stages text without submitting it, and an agent started by `herdr agent start` accepts staged text before its first turn.
- [ ] `npm test` passes on a clean checkout of this branch with no `node_modules` present, after `npm install`.

### Known limits

- Two unplanned edits by the child worker were reverted before the commit and are not in the diff. First, `.backups` added to `SKIP_DIRS` in `scripts/validate.mjs`: the worker hit a banned-token failure caused by a copy of `validate.mjs` that the orchestrator had placed under `.backups/`, so the validator's own regex literals matched themselves. The backup was moved outside the repository instead and every check passes with `.backups/` still present and unskipped, so the validator change was unnecessary. If a future run puts source under `.backups/` again the same false positive returns; making the skip permanent is a separate decision, not this phase's. Second, `package-lock.json`'s `version` field moving `0.1.0` to `2.1.0`, a side effect of the `npm install` the worker needed because this worktree had no `node_modules`. It is a real staleness against `package.json` at `2.1.0`, but it is unrelated to this phase, so the file was restored and the correction is left for whoever owns release hygiene.
- Nothing in this phase exercises the skill. `npm test` proves the skill is discovered, counted, and that its templates satisfy the terminal-answer contract; it cannot prove that any `herdr` command in the body behaves as written. That proof is the deferred human evidence above.
- Phase 2 and Phase 3 are unstarted. The `SKILL.md` carries no `## Archon gate mode` section and no `## Optional Stop hook` section yet, so the `description` frontmatter already promises the gate mode that Phase 2 delivers.
