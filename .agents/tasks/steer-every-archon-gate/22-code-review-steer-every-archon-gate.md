---
type: code-review
date: 2026-09-18
branch: herdr-plugin-delivery-flow
base_branch: main
base_sha: ef969cddee3ae80975a5d2665ea501b8a329a95f
head_sha: 89ea95e75c8691136557826fa24f64b08ac80ecd
status: findings
summary: "Reviewed the whole 23-file non-artifact diff against `main` (581 insertions, 33 deletions) at HEAD `89ea95e` plus the uncommitted fix round: the steward loop in `deliver`, the `herd-next` skill and its Archon gate mode, the Stop hook, the TypeSafe key file, the gate-ask convention and its validator check, and their tests. `npm test` is 69/69, `node scripts/validate.mjs` exits 0, `node scripts/check-commits.mjs main..HEAD` exits 0, `shellcheck stop_hook.sh` is clean. Six of the previous round's seven findings are fixed; CR-003 is still open and re-raised. Three new major findings, all in the steward's own bash fences and all reproduced in this session: the `while :` wait loop is unbounded inside one shell call, contradicting the property the skill states four times and killing the steward on any phase longer than one chunk; `status=` is a read-only parameter in zsh, so the state read aborts outright on this machine's default shell (it aborted in this review session); and `deliver` step 4's inside-Herdr path has no branch for the case where `herd-next` opens no pane, so it announces a review pane that does not exist and leaves the run with no steward. Five advisories, none blocking."
---

# Code Review

## Scope

- merge base: `ef969cddee3ae80975a5d2665ea501b8a329a95f`, from `git merge-base origin/main HEAD`. Base branch `main`, the base of pull request #19 per `gh pr view --json baseRefName`. The local `main` ref is stale (`3fafa25`, behind `origin/main` at `a50132a`); `origin/main` is the branch GitHub names, so its merge base is the one pinned here, the same one the previous round pinned.
- reviewed HEAD: `89ea95e75c8691136557826fa24f64b08ac80ecd`, plus the uncommitted working tree, which is the previous round's fix pass and is in scope.
- commits: 46 after the merge base, 30 of them `docs(task)` artifact commits.
- staged and unstaged changes: nine modified tracked non-artifact files, all from the fix round left uncommitted for the workflow engine: `.changeset/herd-next-skill.md`, `scripts/validate.mjs`, `shared/CONVENTIONS.md`, `skills/delivery/deliver/SKILL.md`, `skills/delivery/herd-next/references/herd_next_gate_answer.md`, `skills/delivery/herd-next/references/stop_hook.sh`, `skills/delivery/start-epic-delivery/references/epic_delivery_final_answer.md`, `skills/delivery/typed-judgment/judge.mjs`, `tests/steward.test.mjs`. Plus the untracked `.changeset/deliver-steward.md`. Total reviewed surface: 23 files, 581 insertions, 33 deletions.
- task-owned untracked files: `20-code-review-steer-every-archon-gate.md` and `21-code-review-fixes-steer-every-archon-gate.md`, the previous round and its fix pass.
- excluded changes: everything under `.agents/tasks/`, which is artifact and not a review subject; `.backups/` and `.ignore`, which are untracked, predate this work, and neither `.gitignore` covers (noted as ADV-105, not a gate).

## Previous Round

- previous artifact: `.agents/tasks/steer-every-archon-gate/20-code-review-steer-every-archon-gate.md`
- CR-001 The gate reply has no variant for the running run the inside-Herdr path always produces: fixed
- CR-002 The epic answer still tells a person to run the child start commands: fixed
- CR-003 Acceptance (a) and (b) are decided by nothing in the change or the verification: still open
- CR-004 `abandon` is the one steward call left without `--cwd`: fixed
- CR-005 The stated cause of the read guard is not what the CLI does, and contradicts herd-next: fixed
- CR-006 The branch's headline behavior change ships with no changeset: fixed
- CR-007 The `Archon gate ask` convention is broken by all three replies that carry it: fixed

Decided from the current diff, not from the previous reviewer's reasoning. CR-001: `herd_next_gate_answer.md:1` now carries a two-state slot covering `is running; no gate is waiting yet` with no notification sentence. CR-002: `epic_delivery_final_answer.md:9,12` now introduce the list as the record of what `delivery-wave` runs and close with "not something for you to type"; old line 14 is folded in. CR-004: `deliver/SKILL.md:99` carries `--cwd "$cwd"` on `abandon`. CR-005: `deliver/SKILL.md:79` now states the `ok: false`-with-no-`status` cause, matching `herd-next/SKILL.md:100`; reproduced live below. CR-006: `.changeset/deliver-steward.md` exists and `.changeset/herd-next-skill.md` names the gate mode. CR-007: `shared/CONVENTIONS.md:94` is loosened to "carries this sentence", and `scripts/validate.mjs:338-344,393-395` enforces it on the three named answer files; removing the sentence from a copy makes the validator fail. CR-003 is re-raised below as CR-104: acceptance (a) and (b) are still `untested` in `19-verification-steer-every-archon-gate.md` (A1, A2, A15) and nothing in the current diff decides them.

## Requirements and Standards

- task or ticket: `.agents/tasks/steer-every-archon-gate/task.md`. Six acceptance items, (a) through (f).
- implementation source: `13-plan-steer-every-archon-gate.md` (newest `plan`), with receipts `14` through `18` and verification `19`. Verification's items table records C1-C2, T1-T5, A3-A14 `pass` with commands and quoted output; those are proven and not re-run here except the three repo-wide checks. A1, A2, and A15 are `untested`, which is CR-104. No item is `fail`.
- repository instructions: `AGENTS.md` ("Done means `npm test` passes ... a user-facing change adds a `.changeset/` entry"), `shared/CONVENTIONS.md`, `shared/WRITING.md`, `docs/testing.md`. `scripts/validate.mjs` is the contract a skill or template must pass.

## Change Profile

- intent and expected behavior: a person never types an `archon` command. `deliver` starts the run and then stewards it: it blocks on `wait`, reads `get`, announces each pause from the gated artifact, maps a plain-language reply through `judge.mjs feedback-intent`, and runs `respond` itself. Inside Herdr, `herd-next`'s new Archon gate mode opens a review pane at the run's `working_path` and submits `/deliver --run <id>` into it.
- change description quality: `.changeset/deliver-steward.md` and `.changeset/herd-next-skill.md` both describe user-visible behavior, motivation, and the attach path. Commit subjects are conventional and `check-commits.mjs` passes on all 66.
- implementation model and review model: implementation model not recorded in receipts 14-18; review model `claude-opus-5`.
- changed-line size and logical cohesion: 23 files, 581 insertions. Above the ~300-line coherent band but not split-worthy: the diff is one behavior (steward the run) plus its two carriers (`deliver`, `herd-next`) plus the convention and validator that pin its one byte-exact sentence. The TypeSafe key-file change (`judge.mjs`, `typed-judgment/SKILL.md`, two test files, one changeset) is a separate concern riding along from an earlier task on this branch; it is small, self-contained, and independently tested, so it does not warrant a split.
- resulting large-file concerns: `deliver/SKILL.md` is 131 lines and `herd-next/SKILL.md` 128, both in line with other skills in the collection.
- dependency or lockfile changes: none. `package-lock.json` is untouched.

## Tests Reviewed First

- behavior claimed by tests: `tests/steward.test.mjs` (new, 102 lines) extracts the three new bash fences from the two `SKILL.md` files by marker and runs them against a fake `archon` under an explicit `/bin/bash`. It pins the paused-run state read, the guard on a failing `get` in both skills, `--cwd` on `respond`/`wait`/`get`, and that a terminal status breaks the wait loop after one chunk. `19-verification` item A9 shows each assertion is load-bearing: three separate reverts each fail exactly one named test. `tests/judge.test.mjs` gained the key-file precedence cases (`TYPESAFE_API_KEY_FILE` > `XDG_CONFIG_HOME` > `HOME`) and tightened the three no-key assertions with an explicit missing `TYPESAFE_API_KEY_FILE` so this machine's real key file cannot satisfy them; `tests/build-packs.test.mjs` got the same tightening.
- missing or misleading coverage: the fixture is only ever a `paused` run (`PAUSED` at `tests/steward.test.mjs:23`). The `running` state is the primary inside-Herdr path (`deliver/SKILL.md:54` runs the gate mode "at once, without waiting for a pause", and `herd-next/SKILL.md:102` opens the pane on it), and no test exercises it; ADV-101 is what that gap hides. The harness also spawns `/bin/bash` explicitly (`tests/steward.test.mjs:39`), so it cannot catch CR-102, which only appears under the shell the agent actually gets. The wait loop is only ever driven to a terminal status on the first chunk, so it never demonstrates the unbounded case in CR-101.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `10436` in / `73` out

### Correctness

- assessment and evidence: the loop's shape is right and the two read guards are load-bearing. Every defect found sits in a bash fence the steward copies verbatim, and each was reproduced in this session rather than reasoned about. The `while :` loop at `deliver/SKILL.md:107-112` re-issues `wait` without bound inside one shell invocation: a fake `archon` returning `running` drove it through 50 chunks in a single `/bin/bash` call before an injected counter stopped it, so the "no shell call is held for the length of a phase" property stated at `:45`, `:65`, `:103`, and `:115` does not hold (CR-101). `status=` at `:71`, `:110`, and `herd-next/SKILL.md:92` collides with zsh's read-only `status` parameter: running `deliver`'s own read fence under `/bin/zsh` prints `read-only variable: status` and exits 1 at line 2, while `/bin/bash` prints `paused|/runs/verbose-flag|design__cycle|approve reject` (CR-102). `deliver/SKILL.md:54` has no branch for `herd-next` opening no pane, which three of `herd-next`'s own paths produce (CR-103). Smaller: `decisions=$(jq -r '.metadata.approval.decisions[].id' ...)` is the one of five reads without `// empty` and exits 5 with `Cannot iterate over null` on every running-run read (ADV-101), and `${a:-{\}}` expands to the literal `{\}` under bash, so the `// "revise"` default at `:95-96` never fires when the helper is unavailable (ADV-102). CR-005's corrected cause sentence checks out: `archon workflow get <id> --json` from `/tmp` exits 1 with a well-formed `ok: false` body and `jq -r '.status'` on it prints `null`, exactly as `:79` now states.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: prose is direct and every fence is introduced by the sentence that says what it is for. Two variables are interpolated without ever being defined: `$judge` and `$reply` at `deliver/SKILL.md:94` appear nowhere else in the file (`grep -n 'judge\|\$reply'` returns only the two `<skills dir>/typed-judgment/judge.mjs` prose lines from step 2 and line 94 itself), which is the same class of gap the previous round's ADV-001 closed for `$slug` (ADV-103). `shared/CONVENTIONS.md:96` writes the byte-exact sentence as `` `Say `approve`, or say what should change.` ``, whose nested backticks render as three fragments, so the one line the whole convention exists to pin is the one line that does not read correctly (ADV-104). Nothing else: no dead code, no unnecessary abstraction, `herd-next`'s gate mode reuses steps 4 through 6 by named substitution rather than restating them.
- helper coverage: covered, level 3, confidence 0.99

### Architecture

- assessment and evidence: ownership is clean. `deliver` owns the steward loop; `herd-next` owns pane geometry and does exactly one run read before handing the waiting to the pane, which is why `herd-next/SKILL.md:86` can say "This pane is never held". The one seam between them is unguarded in one direction: `herd-next` can decline to open a pane (unreadable agent kind at `:31`, a name not starting with a letter at `:58`, an unreadable run at `:100`, a still-blocked agent at `:115`) and `deliver` has no branch for that, which is CR-103 and is a one-clause fix at the boundary, not a structural change. The validator check added for CR-007 keys on a hardcoded three-file `Set` (`scripts/validate.mjs:339-343`) rather than deriving the list, which is the right size for three files. `judge.mjs`'s `apiKey()` is exported but has one in-module caller and no test importing it; harmless.
- helper coverage: covered, level 3, confidence 0.99

### Security

- assessment and evidence: the key-file path is the only new trust boundary and it is closed correctly. `judge.mjs:81-92` resolves the default path only when `XDG_CONFIG_HOME` or `HOME` is set, returning `""` otherwise rather than reading a relative `.config/typesafe/api_key` that a checked-out repository could plant; `typed-judgment/SKILL.md:18` documents writing the file under `umask 077`. The key is never logged or echoed: `grep` finds no `console`/`printf` of it. `tests/judge.test.mjs:27-28` and `tests/build-packs.test.mjs:109-110` both point `TYPESAFE_API_KEY_FILE` at a missing path for the no-key assertions, so a developer's real key cannot make a no-key test pass falsely. Elsewhere: `deliver` sends only the person's reply text to the helper, which is what `shared/CONVENTIONS.md`'s Typed judgments section permits; no run id, path, or decision id is ever guessed, every one is read from `archon workflow get` JSON; `stop_hook.sh` writes no file, opens nothing it does not tear down on failure, and its `cleanup` trap has a `created_pane` fallback for an unparsed tab id.
- helper coverage: covered, level 3, confidence 0.98

### Performance

- assessment and evidence: the only hot path is the wait loop, and its cost is the defect in CR-101 rather than a throughput problem: each iteration is one `archon workflow wait --timeout 600` plus one `get`, so at 50 iterations the single shell call spans eight hours. Nothing else loops: `herd-next`'s gate mode reads the run exactly once (`herd-next/SKILL.md:86`), the run-id lookup after dispatch is one `archon workflow status --json` (`deliver/SKILL.md:48`), and `stop_hook.sh` makes a bounded number of `herdr` round trips, which is why its documented install timeout of 90 is derived from the two 30-second waits inside it. `judge.mjs` reads the key file once per process with `readFileSync` on a file of one line.
- helper coverage: covered, level 3, confidence 0.99

## Verification Story

- command or inspection: `npm test`
- result: exit 0, `tests 69 / suites 3 / pass 69 / fail 0 / skipped 0 / todo 0`, duration 27110ms. The five steward cases are in the pass list.
- command or inspection: `node scripts/validate.mjs`
- result: exit 0, `ok: 42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command or inspection: `node scripts/check-commits.mjs main..HEAD`
- result: exit 0, `ok: 66 subjects`.
- command or inspection: `shellcheck skills/delivery/herd-next/references/stop_hook.sh`
- result: exit 0, no output.
- command or inspection: `grep -rn 'archon workflow' skills/delivery/*/references skills/delivery/*/SKILL.md` (acceptance (d); the glob in `task.md` is one directory too shallow and matches nothing, as verification item A10 already recorded)
- result: 14 lines across 5 files. Every one is either a command a skill runs itself, a past-tense provenance line under "Started from the project root:", or a `{child_start_command}` placeholder introduced as "the record of what runs, not something for you to type". No line addresses a person. Acceptance (d) holds.
- command or inspection: the `deliver/SKILL.md:107-112` wait loop against a fake `archon` that always answers `running`, with an injected iteration counter
- result: `UNBOUNDED: still looping after 51 chunks in ONE shell call`, 50 `wait` calls logged. This is CR-101.
- command or inspection: the `deliver/SKILL.md:69-77` state read, run under `/bin/bash` and under `/bin/zsh`
- result: bash prints `AFTER: status=[running] ...` and continues; zsh prints `t.sh:2: read-only variable: status` and exits 1. The same split appears in the respond loop: zsh dies after the first `wait` chunk with the same message. This is CR-102, and it is why my own first attempt to run this fence in this review session failed.
- command or inspection: `jq -r '.metadata.approval.decisions[].id'` against `{"status":"running","working_path":"/runs/x","metadata":{}}`
- result: `jq: error (at <stdin>:0): Cannot iterate over null (null)`, exit 5. The four sibling reads with `// empty` exit 0. This is ADV-101.
- command or inspection: `a=""; printf '[%s]' "${a:-{\}}"` under both shells
- result: bash prints `[{\}]`, zsh prints `[{}]`. jq then fails with `Invalid numeric literal` under bash and `intent` comes back empty instead of `revise`. This is ADV-102.
- command or inspection: CR-005's corrected cause, reproduced live from `/tmp`
- result: `archon workflow get <id> --json` exits 1 with `{ "ok": false, "error": "Error: Not in a git repository..." }`; `jq -r '.status'` on that body prints `null` and exits 0. `deliver/SKILL.md:79` now states this correctly.
- manual, screenshot, or before-and-after evidence: none. The pane half of acceptance (a) and (b) remains unobserved, which is CR-104.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-101 The wait loop is unbounded inside one shell call, so no phase longer than a chunk keeps its steward

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `skills/delivery/deliver/SKILL.md:107-112`
- failure mode: the fence is `while :; do archon workflow wait ... --timeout 600; ...; case "$status" in paused|completed|failed|cancelled) break ;; esac; done`. The `--timeout` bounds each `wait`, not the fence: on expiry the loop immediately re-issues, so a single shell invocation stays open for the whole phase. The skill states the opposite four times: `:45` "No shell call is held for the length of a phase, here or later; step 6 does every read and every wait, in bounded chunks", `:65` "No shell call is held for the length of a phase, the first one included", `:103` "the wait is bounded, so no shell call is held for the length of a phase", `:115` "A chunk that expires is not a failure; the loop re-reads and re-issues". An agent runs this fence through a shell tool with its own per-command ceiling (Claude Code's Bash tool caps at 600000 ms, exactly one chunk), so any phase that outlives one chunk has its steward killed mid-loop. The steward is then gone with no pause announced and no reply printed, which is acceptance (c) failing in the one case the run is long enough to matter. The same fence is the first wait after step 4 on the outside-Herdr path, so this is not an edge.
- evidence or reproduction: the fence run verbatim against a fake `archon` whose `get` always answers `{"status":"running"}` and whose `wait` always returns, with an iteration counter injected only to stop it: `UNBOUNDED: still looping after 51 chunks in ONE shell call`, with 50 `wait` calls in the log. At the real `--timeout 600` that single call spans over eight hours. `tests/steward.test.mjs:88-95` cannot catch this: its fixture is `paused`, so the loop always breaks on the first chunk, which is exactly what that test asserts.
- fix direction: make the fence one chunk. Drop `while :` / `done` so it is `wait` once, `get` once, read `status` once, and move the looping into the prose the agent already follows: "re-run this fence until `status` is `paused`, `completed`, `failed`, or `cancelled`." That restores the stated property with one fewer construct, and `tests/steward.test.mjs`'s existing assertion (one `wait` per invocation) still holds unchanged.

### CR-102 `status` is a read-only parameter in zsh, so the state read aborts on this machine's default shell

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `skills/delivery/deliver/SKILL.md:71`, `skills/delivery/deliver/SKILL.md:110`, `skills/delivery/herd-next/SKILL.md:92`
- failure mode: `status=$(jq -r '.status' <<<"$run")` assigns to `status`, which zsh reserves as a read-only alias for `$?`. Under zsh the assignment fails with `read-only variable: status` and a non-interactive shell aborts the whole block there, so `$cwd`, `$node`, `$msg`, `$decisions`, and `$resolved` are never set: `deliver` cannot announce the gate and `herd-next` cannot open the pane at the run's `working_path`. In an interactive zsh that keeps going, `$status` reads back as the last exit code `0`, which matches none of `paused|completed|failed|cancelled`, so the CR-101 loop spins on an already-finished run. zsh is the default login shell on macOS and is the shell this repository's own agent sessions get; every other bash fence in the collection avoids the name (`grep -rn '^\s*status=' skills/` returns only these three lines plus an unrelated Python keyword argument).
- evidence or reproduction: `deliver`'s read fence saved verbatim and run twice. `/bin/bash`: `AFTER: status=[running] cwd=[/runs/x] ...`, exit 0. `/bin/zsh`: `t.sh:2: read-only variable: status`, exit 1, nothing after line 2 runs. The respond loop behaves the same way: under zsh it dies right after the first `wait` chunk. My own first attempt to run this fence while reviewing failed with that exact message, because this session's shell is zsh. `tests/steward.test.mjs:39` spawns `/bin/bash` explicitly, so the suite is structurally unable to see it, and verification item A6 passed for the same reason.
- fix direction: rename the variable to `run_status` in all three fences, and in `tests/steward.test.mjs`'s `REPORT` line so the test keeps asserting on it. One word in four places; no behavior changes under bash.

### CR-103 `deliver` announces a review pane that `herd-next` may never have opened

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `skills/delivery/deliver/SKILL.md:54`
- failure mode: the inside-Herdr branch reads "run `herd-next`'s Archon gate mode for this run id at once ... it opens the review pane ... Reply with `references/deliver_archon_answer.md` ... its last line filled with the pane pointer, and stop. The pane's steward owns every pause from here." There is no branch for the gate mode not opening a pane, and `herd-next` has four such exits: an agent kind it cannot read (`herd-next/SKILL.md:31`, "ask the user for the kind in one sentence and stop"), a built name not starting with a lowercase letter (`:58`, "ask the user for a name and stop"), a `get` that fails (`:100`, print the skipped reply), and an agent still blocked after the readiness wait (`:115`, "report a still-blocked agent in the reply rather than sending input to it" - the pane exists but `/deliver --run <id>` was never submitted into it). In each case `deliver` still prints a pane pointer with a pane id it does not have and stops, so the person is told to answer in a pane that is absent or empty while the run keeps going with nobody waiting on it. That is acceptance (a) failing silently, and it is the exact outcome - a person discovering the pause themselves - the task was opened to remove. `deliver_archon_answer.md:14` makes it worse by construction: it is "Never both", so the agent cannot fall back to printing the ask in this reply.
- evidence or reproduction: read from the diff. `deliver/SKILL.md:54` against `herd-next/SKILL.md:31,58,100,115`; no `grep` of `deliver/SKILL.md` finds any conditional on the gate mode's result, and step 6 is reachable only "from step 1's attach branch, or from step 4 outside Herdr" (`:65`). Not covered by any test: `tests/steward.test.mjs` tests fences, not this branch, and verification items A1 and A15 are `untested`.
- fix direction: one clause on `:54`, after the sentence that runs the gate mode: when it opens no pane - its skipped reply, or a question it has to ask - go to step 6 and steward inline in this session instead, replying as the outside-Herdr path does. That reuses the branch already written rather than adding one, and makes `:65`'s list of entry points true.

### CR-104 Acceptance (a) and (b) are still decided by nothing in the change, the tests, or the verification

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `.agents/tasks/steer-every-archon-gate/task.md:13`
- failure mode: acceptance (a) - `/deliver` inside Herdr leaves the person with a review pane whose agent announces the first pause and asks for a decision - and (b) - the same outside Herdr, in the starting session - are the task's two headline outcomes, and nothing proves either. `19-verification-steer-every-archon-gate.md` records A1, A2, and A15 as `untested` with "Not run", and the fix round recorded CR-003 as `blocked` pending confirmation rather than fixed. The end-to-end path has never executed once: the run starts, the pane opens, the agent attaches, the gate is announced, the answer is mapped, and the next pause arrives. That is also the path CR-101, CR-102, and CR-103 each break, and all three survived a full verification and a full review round precisely because it was never walked.
- evidence or reproduction: `19-verification-steer-every-archon-gate.md:31,32,45` (A1, A2, A15, verdict `untested`, "Not run"); `21-code-review-fixes-steer-every-archon-gate.md:37-42` (CR-003, disposition `blocked`); nothing in the current diff adds a check for either item. This is the previous round's CR-003, re-raised under a new identifier because it is still open.
- fix direction: run plan 13's checklist steps 1 through 4 once against a scratch `delivery-start` run with a bare remote, the same shape verification already used for A3, A4, and A11, and record the pane label, the agent's first message, and the resolved gate in the verification artifact. This is an outward-facing action in the person's live Herdr workspace, so confirm before taking it, exactly as the fix round asked. If it is declined again, say so as a decision rather than a block, and the residual risk stays recorded.

## Advisories

### ADV-101 The one unguarded `jq` read errors on every running-run state read

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `skills/delivery/deliver/SKILL.md:75`, `skills/delivery/herd-next/SKILL.md:96`
- evidence: `decisions=$(jq -r '.metadata.approval.decisions[].id' <<<"$run")` is the only one of the five reads without `// empty`. Against `{"status":"running","working_path":"/runs/x","metadata":{}}` it prints `jq: error (at <stdin>:0): Cannot iterate over null (null)` and exits 5; the four siblings exit 0. This fires on the primary inside-Herdr path, where `deliver/SKILL.md:54` runs the gate mode before any pause and `herd-next/SKILL.md:102` explicitly opens the pane on a `running` run. Under plain bash the damage is stderr noise and an empty `$decisions` that nothing downstream uses while no gate is live; under `set -e`, which agents commonly apply to a copied fence, the read aborts and no pane opens. `tests/steward.test.mjs` never sees it: the only fixture is `paused`.
- suggestion: `jq -r '.metadata.approval.decisions[]?.id // empty'`, matching its four siblings, and add a `running` fixture to `tests/steward.test.mjs` so the branch both skills document is exercised.

### ADV-102 The helper-unavailable default expands to a literal `{\}` under bash and never fires

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `skills/delivery/deliver/SKILL.md:95-96`
- evidence: `intent=$(jq -r '.intent // "revise"' <<<"${a:-{\}}")`. bash does not strip the backslash inside `${...}`, so with `a` empty the expansion is the literal `{\}`: `jq` fails with `parse error: Invalid numeric literal at line 1, column 3` and `intent` comes back empty, not `revise`. Same for `suggested`, which comes back empty rather than `unclear`. zsh expands it to `{}` and both defaults work, the mirror image of CR-102. `a=''` is set by the `|| a=''` on `:94`, which fires on exit 3 - the ordinary no-key case - so this is a common path, not an exotic one. The prose at `:101` covers helper-unavailable separately, so the outcome is the same in practice; the fence's own default is simply dead under the shell it is labelled for.
- suggestion: replace the expansion with an explicit default on the line before: `[ -n "$a" ] || a='{}'`, then `<<<"$a"` in both reads. Correct in both shells and one construct simpler.

### ADV-103 `$judge` and `$reply` are interpolated but never defined

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `skills/delivery/deliver/SKILL.md:94`
- evidence: `a=$(node "$judge" feedback-intent --json - <<<"$reply") || a=''`. `grep -n 'judge\|\$reply' skills/delivery/deliver/SKILL.md` returns three lines: the two step-2 prose lines naming `<skills dir>/typed-judgment/judge.mjs`, and line 94. Neither `$judge` nor `$reply` is ever bound. This is the same gap the previous round's ADV-001 closed for `$slug` by adding one clause before the fence.
- suggestion: one clause before the fence, in the ADV-001 shape: `$judge` is `<skills dir>/typed-judgment/judge.mjs` from step 2, `$reply` is the person's words.

### ADV-104 The byte-exact gate-ask sentence is the one line in the convention that renders wrong

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `shared/CONVENTIONS.md:96`
- evidence: the line is `` `Say `approve`, or say what should change.` ``. Nested backticks do not nest in Markdown, so it renders as code `Say `, plain text `approve`, then code `, or say what should change.` - three fragments for the one sentence the section exists to pin byte-exact. The Handoff section immediately below solves the same problem correctly with a four-backtick fence (`:66-88`). Separately, `scripts/validate.mjs:338` hardcodes its own copy of the sentence, so the two can drift without anything noticing.
- suggestion: put the sentence in a fenced `text` block, as the Handoff section already does for its template.

### ADV-105 `.backups/` and `.ignore` are untracked and no `.gitignore` rule covers them

- type: Nitpick
- severity: info
- category: Maintainability and code quality
- location: `.gitignore:1-10`
- evidence: `git status --porcelain -uall` lists 55 untracked paths under `.backups/` and one `.ignore`. `.gitignore` covers `.DS_Store`, `dist/`, `node_modules/`, `/graft/`, and `/evals/results/` only. Both predate this task, so neither is task-caused and neither is in the reviewed scope; this pass added many `.backups/` entries, so a `git add -A` would now sweep working copies of task artifacts into a commit. Noted because it is one line to close, not because this change caused it.
- suggestion: add `.backups/` to `.gitignore`. `.ignore` is a ripgrep config that arguably belongs in the repository; commit it or ignore it deliberately.

## Dead Code and Dependency Review

- newly orphaned code: none. `grep` for each new symbol finds a caller: `GATE_ASK_SENTENCE` and `GATE_ASK_ANSWERS` are used in the `TERMINAL_ANSWER` branch at `scripts/validate.mjs:393-395`; `apiKey()` is called at `judge.mjs:98`; all three new answer templates are named by `deliver/SKILL.md:130` and `herd-next/SKILL.md:18,100,119` and registered in `ANSWER_INVENTORY`; `stop_hook.sh` is documented at `herd-next/SKILL.md:123` as install-by-hand and is deliberately not wired into any shipped `hooks` block. `apiKey()` is exported with only an in-module caller and no importing test, which is a style choice consistent with the file's other exports, not an orphan. Nothing in the diff leaves prior code unreferenced.
- dependency findings: none. No `package.json` or `package-lock.json` change; the new code uses `node:fs`, `node:path`, and shelled-out `jq`, `git`, `archon`, and `herdr`, all already required by the collection.

## Verdict

- decision: request_changes
- overall code-health change: positive. The steward loop is the right shape, ownership between `deliver` and `herd-next` is clean, the two read guards are load-bearing and pinned by reverts, and the gate-ask convention now has a validator behind it. The four findings are a loop construct, a variable name, a missing branch, and an unrun check; none touches that shape.
- rationale: three major findings sit on the path the task exists to create, and each one alone leaves a run with no steward: the wait loop outlives the shell call it runs in, the state read cannot execute under zsh, and the inside-Herdr path announces a pane that may not exist. The fourth is the previous round's CR-003, still open: acceptance (a) and (b) are proven by nothing, which is why the first three survived a full verification and a full review round. Fixing CR-104 would likely have surfaced CR-101 through CR-103 on its own.

## Review Limits

- blocked or unavailable checks: the end-to-end Herdr path (a pane opened, an agent started, a gate announced and answered) was not run here either, for the reason CR-104 states: it is an outward-facing action in the person's live workspace. Everything in this review is either a read-only command against a fake `archon` in `/tmp` or a read of the diff. No Archon run was started, no pane opened, no product code edited.
- residual manual verification: CR-104's checklist. Also worth one live check after CR-101 and CR-102 are fixed: a real run whose phase outlives one 600-second chunk, to confirm the steward still announces the pause that follows.
