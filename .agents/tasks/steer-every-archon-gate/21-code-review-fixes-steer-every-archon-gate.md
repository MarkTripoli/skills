---
type: code-review-fixes
date: 2026-09-18
branch: herdr-plugin-delivery-flow
review_artifact: .agents/tasks/steer-every-archon-gate/20-code-review-steer-every-archon-gate.md
reviewed_head_sha: 89ea95e75c8691136557826fa24f64b08ac80ecd
fixed_head_sha: 89ea95e75c8691136557826fa24f64b08ac80ecd (working tree, uncommitted at write time)
status: complete
summary: "Fixed six of the review's seven major findings and all five advisories; CR-003 is blocked pending explicit confirmation before opening a Herdr pane and starting an agent in the person's live workspace, per the review's own guidance and this collection's convention on outward-facing actions. CR-001 gave `herd_next_gate_answer.md`'s first line a two-state slot so the running-run path no longer claims a pause and a notification that did not happen. CR-002 rewrote `epic_delivery_final_answer.md` lines 9 and 12 so the wave-1 block reads as a record of what `delivery-wave` runs, not an instruction to type; line 14 is folded into 12. CR-004 added `--cwd \"$cwd\"` to the `abandon` call and stated its failure path. CR-005 replaced the false cause sentence at `deliver/SKILL.md:79` with what the CLI actually does (a well-formed `ok: false` body with no `status` key, so `$status` is the literal `null`), corrected the same restated sentence in `13-plan` and receipts `14` and `16`, and fixed the fake `archon` fixture in `tests/steward.test.mjs` (ADV-002) to escape its newline the way the real CLI does; verified against a live `archon workflow get` failure. CR-006 added `.changeset/deliver-steward.md` and extended `.changeset/herd-next-skill.md` with the Archon gate mode. CR-007 loosened the `Archon gate ask` convention to what the three templates actually do and added a `validate.mjs` check keyed on those three answer files. ADV-001 defined `$slug` in `deliver`'s notification fence. ADV-003 closed the repo-relative key-file read when neither `HOME` nor `XDG_CONFIG_HOME` is set. ADV-004 dropped `apiKey`'s unused `env` parameter. ADV-005 gave `stop_hook.sh`'s tab-teardown a `created_pane` fallback so cleanup still closes something if the tab-id field ever stops matching. `npm test` is 69/69, `node scripts/validate.mjs` and `node scripts/check-commits.mjs main..HEAD` both exit 0, and `shellcheck` is clean on `stop_hook.sh`."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: none. `git merge-base origin/main HEAD` is still `ef969cddee3ae80975a5d2665ea501b8a329a95f`, the `base_sha` the review recorded, and HEAD is unchanged at `89ea95e` (nothing was committed by this pass; see `fixed_head_sha`).
- unrelated changes preserved: yes. Only the files each finding names were touched; no other tracked file in the diff's scope was edited.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-001

- disposition: fixed
- evidence: `skills/delivery/herd-next/references/herd_next_gate_answer.md:1` now reads `Run \`<run-id>\` (\`<workflow name>\`) <paused at \`<nodeId>\`, followed by "A notification was raised and a review pane is open."; or \`is running; no gate is waiting yet\`, followed by "A review pane is open." with no notification sentence>.` — the same `<...>` alternation shape `deliver_archon_answer.md:9` already uses for its run line, covering the `running` state `herd-next/SKILL.md:102` always takes on the primary inside-Herdr path (`deliver/SKILL.md:54`) without asserting a pause, a notification, or a `<nodeId>` that path does not have.
- files changed: `skills/delivery/herd-next/references/herd_next_gate_answer.md:1`
- regression check: `node scripts/validate.mjs` still passes `checkHandoff`'s terminal-reply checks on this file (no fence, no fresh-session sentence); no test extracts this template's prose, so no automated test exercises the new slot. `node --test tests/steward.test.mjs` (unaffected, this file carries no bash fence) stays 5/5.

### CR-002

- disposition: fixed
- evidence: `skills/delivery/start-epic-delivery/references/epic_delivery_final_answer.md:9` now introduces the list as "the start commands the `delivery-wave` block runs for them", dropping "run each from the project root ... for you to type". Line 12 now ends "... reply with changes to a child's `task.md` before starting it. With `children: manual`, or to start one child by hand, ask your agent to start it, after `git push -u origin <epic branch>`: Archon cuts each child from the epic branch on `origin`. The commands above are the record of what runs, not something for you to type." — line 14's content folded in, said once, in the same voice.
- files changed: `skills/delivery/start-epic-delivery/references/epic_delivery_final_answer.md:9,12` (old line 14 removed)
- regression check: `node scripts/validate.mjs` passes `ANSWER_INVENTORY`'s handoff check on this template (terminal, unchanged fence rule). `npm test` 69/69; no test reads this template's prose directly.

### CR-003

- disposition: blocked
- evidence: acceptance (a) and (b) still have no automated or live-observed proof after this pass. The only action that would decide A1, A2, and A15 (plan 13's checklist steps 1-4 against a scratch `delivery-start` run) is opening a review pane and starting an agent in this Herdr workspace — a visible, outward-facing action the review's own fix direction says to confirm before taking, and the same reason the verification recorded these items `untested` rather than performed them. `HERDR_ENV` is `1` and Archon is installed in this session, so the CLI half is runnable again, but the pane/agent half is not something this fix-code-review pass was asked to take. Recorded in `19-verification-steer-every-archon-gate.md`'s `### Known limits`, added in this pass.
- files changed: `.agents/tasks/steer-every-archon-gate/19-verification-steer-every-archon-gate.md` (Known limits, one bullet added, edited in place per the Iteration convention)
- regression check: none applicable; no code or template changed for this item.

### CR-004

- disposition: fixed
- evidence: `skills/delivery/deliver/SKILL.md:99` now reads `... run \`archon workflow abandon "$run_id" --cwd "$cwd"\` and print the ended reply; a nonzero exit prints Archon's output as cause and fix instead, the same guard the two reads already use.` `grep -n -- '--cwd "$cwd"' skills/delivery/deliver/SKILL.md` returns five lines: `:99` (abandon), `:106` (respond), `:108` (wait), `:109` (get), `:115` (the prose rule) — `abandon` no longer the one call without it.
- files changed: `skills/delivery/deliver/SKILL.md:99`
- regression check: `node --test tests/steward.test.mjs` 5/5 (no test exercises the `stop` path, so this is a prose-only assertion, consistent with the review's own finding that nothing caught the gap); `node scripts/validate.mjs` unaffected.

### CR-005

- disposition: fixed
- evidence: `skills/delivery/deliver/SKILL.md:79` now reads "Outside a git work tree the body is a well-formed `ok: false` error with no `status` key, so an unguarded read leaves `$status` as the literal `null`, the loop takes the running-run branch, and it waits forever on a run it cannot read. The guard fires on the nonzero exit, not on a parse error." Reproduced live: `run=$(archon workflow get 00000000-0000-0000-0000-000000000000 --json)` from `/tmp` exits 1; `jq -r '.status' <<<"$run"` (run without the guard) prints `null` and exits 0, matching `herd-next/SKILL.md:100`'s existing correct account, not contradicting it. The same false sentence was corrected in place in `13-plan-steer-every-archon-gate.md:24` and `:78`, and in receipts `14-implementation-steer-every-archon-gate.md` (frontmatter `summary` and body line 20) and `16-implementation-steer-every-archon-gate.md` (body line 20, the fixture description), per the Iteration convention. The fake `archon` in `tests/steward.test.mjs:35` (ADV-002) was fixed at the same time: the embedded newline is now `\\\\n` in the template literal, so the fixture's `printf` emits a literal `\n` escape instead of a raw newline, verified with a standalone `printf`/`jq` reproduction that the fixture's JSON is now valid and `jq -r '.status'` prints `null`, matching the real CLI.
- files changed: `skills/delivery/deliver/SKILL.md:79`, `.agents/tasks/steer-every-archon-gate/13-plan-steer-every-archon-gate.md:24,78`, `.agents/tasks/steer-every-archon-gate/14-implementation-steer-every-archon-gate.md` (frontmatter, line 20), `.agents/tasks/steer-every-archon-gate/16-implementation-steer-every-archon-gate.md:20`, `tests/steward.test.mjs:35`
- regression check: `node --test tests/steward.test.mjs` still 5/5 after the fixture fix (the two failing-read tests assert on exit status, unaffected by the JSON body's validity); `npm test` 69/69.

### CR-006

- disposition: fixed
- evidence: `.changeset/deliver-steward.md` added (minor), describing the behavior a user sees: `deliver` stewards the run it starts, resolves every gate in plain language through `archon workflow respond`, and `/deliver --run <run-id>` attaches to a lost steward. `.changeset/herd-next-skill.md` extended with one clause: "It also gained an Archon gate mode: given a run id, it opens a review pane at the run's own worktree and attaches `deliver`'s steward there, so a paused Archon run is announced and answered in a pane instead of by a person running Archon commands." `git diff --stat -- .changeset/` now shows both files changed plus the new one.
- files changed: `.changeset/deliver-steward.md` (new), `.changeset/herd-next-skill.md`
- regression check: `npm test` 69/69 (no test reads `.changeset/` contents); `node scripts/validate.mjs` unaffected (it does not check changeset coverage, matching the review's own note).

### CR-007

- disposition: fixed
- evidence: `shared/CONVENTIONS.md:94` now reads "A reply that announces a paused Archon gate carries this sentence, byte-exact, as its ask:" (was "ends with ... byte-exact"), matching what all three templates already do. `scripts/validate.mjs` gained `GATE_ASK_SENTENCE` and `GATE_ASK_ANSWERS` (the three answer files `deliver_archon_answer.md`, `deliver_gate_answer.md`, `herd_next_gate_answer.md`, all already in `ANSWER_INVENTORY`) and a check inside the `TERMINAL_ANSWER` branch of the existing `ANSWER_INVENTORY` loop: each must `.includes()` the byte-exact sentence. `grep -n 'Say \`approve\`, or say what should change\.' skills/delivery/deliver/references/deliver_archon_answer.md skills/delivery/deliver/references/deliver_gate_answer.md skills/delivery/herd-next/references/herd_next_gate_answer.md` confirms all three already carry it literally, so no template text needed to change for the check to pass.
- files changed: `shared/CONVENTIONS.md:94`, `scripts/validate.mjs` (new constants plus one check in the `ANSWER_INVENTORY` loop)
- regression check: `node scripts/validate.mjs` exits 0 (`ok: 42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`); confirmed the check is live by a manual removal of the sentence from a copy of `deliver_gate_answer.md`, which `validate.mjs` then failed with the new message, then restored.

## Advisory Decisions

### ADV-001

- disposition: accepted
- reason: `skills/delivery/deliver/SKILL.md:83` gained the clause "`$slug` is that directory's basename." right before the notification fence at `:86`, the same derivation `herd-next/SKILL.md:104` already states. `herdr notification show "Gate: $slug/$phase" ...` no longer interpolates an undefined variable.

### ADV-002

- disposition: accepted
- reason: fixed together with CR-005 (same fixture, same root cause): `tests/steward.test.mjs:35`'s embedded newline is now `\\\\n` in the JS template literal, so the fake `archon`'s `printf` emits a literal backslash-n escape rather than a raw newline under `FAKE_FAIL`, matching the real CLI's `ok: false` body. The two tests that key off this fixture (`a get that fails ends the read ...`, `a get that fails inside the wait loop ...`) still assert on exit status and stderr content, unaffected, and both still pass.

### ADV-003

- disposition: accepted
- reason: `skills/delivery/typed-judgment/judge.mjs:83-92`'s `apiKey()` now resolves the default key-file path only when `XDG_CONFIG_HOME` or `HOME` is set; with neither, it returns `""` (the documented unavailable path) instead of reading a relative `.config/typesafe/api_key` a repository's working directory could plant. `node --test tests/judge.test.mjs` still passes 11/11, including "the key comes from `TYPESAFE_API_KEY_FILE` or `~/.config/typesafe/api_key` when the environment has none".

### ADV-004

- disposition: accepted
- reason: `apiKey`'s `env = process.env` parameter is dropped; the function now reads `process.env` directly (`judge.mjs:85`). `grep -rn "apiKey" tests/ skills/delivery/typed-judgment/` shows the only caller (`:98`, no argument) and no test importing the function, so nothing depended on the parameter.

### ADV-005

- disposition: accepted
- reason: `skills/delivery/herd-next/references/stop_hook.sh`'s tab-create branch now sets `created_pane=$pane` whenever `created_tab` parses empty (`test -z "$created_tab" && created_pane=$pane`, right after both jq reads), so the `cleanup` trap's `elif test -n "$created_pane"` branch closes the pane if the tab-id field name (`.result.tab.tab_id`, unconfirmed against a real response) ever stops matching. The tab-close branch still runs first when `created_tab` does parse, so the normal case is unchanged. `shellcheck skills/delivery/herd-next/references/stop_hook.sh` exits 0 with no output.

## Verification

- command: `npm test`
- result: exit 0, `tests 69 / suites 3 / pass 69 / fail 0 / skipped 0 / todo 0`, duration ~27s.
- command: `node scripts/validate.mjs`
- result: exit 0, `ok: 42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command: `node scripts/check-commits.mjs main..HEAD --title "feat(delivery): open the next delivery phase in a Herdr pane"`
- result: exit 0, `ok: 67 subjects` (one more than the review's 66: this branch gained a `docs(task): verification artifact` commit between the review and this pass; no commit from this pass is included, since fixes are left uncommitted for the workflow engine).
- command: `shellcheck skills/delivery/herd-next/references/stop_hook.sh`
- result: exit 0, no output.
- command: `grep -rn 'archon workflow' skills/delivery/*/references skills/delivery/*/SKILL.md`
- result: 14 lines across 5 files, every one a command a skill runs itself or a placeholder inside a template; none addresses a person (acceptance (d), re-checked after CR-001, CR-002, and CR-004's edits).
- command: standalone `printf`/`jq` reproduction of the fixed `tests/steward.test.mjs` fixture
- result: the fixture's `FAKE_FAIL` body is now valid JSON with an escaped newline; `jq -r '.status'` prints `null`, matching the live CLI reproduction in CR-005.

## Remaining Blocks

- CR-003: acceptance (a) and (b) (`.agents/tasks/steer-every-archon-gate/19-verification-steer-every-archon-gate.md` items A1, A2, A15) stay `untested`. Deciding them means opening a review pane and starting an agent in this Herdr workspace against a scratch `delivery-start` run, following plan 13's checklist steps 1-4. That is an outward-facing action in the person's live workspace; before taking it, confirm: proceed with the live pane-and-agent check now (a `delivery-start` run against a fresh scratch repository with a bare remote, the same shape verification used for A3/A4/A11), or decline and keep this recorded as a known limit. Recorded in `19-verification-steer-every-archon-gate.md`'s `### Known limits`.
