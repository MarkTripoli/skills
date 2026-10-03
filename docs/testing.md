# Testing

Keep evidence kinds apart: offline repo check, live skill eval. One kind pass no mean other kind pass.

## Repository checks

`npm test` be big check; `package.json` hold exact command list.

| Surface | Entry point | Contract |
|---|---|---|
| Skill validation | `node scripts/validate.mjs` | Layout, frontmatter, shared links, templates, handoff fences, phase-table coverage, source conventions, and instruction word caps (`WORD_CAPS`; raising one is a visible diff) |
| Skill authoring practices | `node scripts/check-skill-practices.mjs` | YAML descriptions and trigger boundaries, progressive one-level references, script coverage, contents lists, and declared eval coverage |
| Plugin sync | `node scripts/sync-plugin.mjs --check` | Published plugin resources match canonical skills |
| Unit tests | `node --test tests/` | Installer ownership, runtime adaptation, commit rules, typed helper behavior, task-index and task-root contracts, artifact helper distribution, and workflow helpers |

Offline check no need live provider key. Installer test use temp home and temp project, cover:

- project-local portable skill;
- independent partial pick; and
- scoped uninstall no touch real user install.

Offline contract also cover indexed task-artifact model:

- `index.json` schema and fail-closed read: invalid JSON/schema, dangling path, symlink component, SHA-256 mismatch, metadata mismatch be errors, never scan fallback;
- semantic series `(kind, variant)`, immutable contiguous iteration, `current`, `generation`, `supersedes`;
- task-root directive in root `AGENTS.md`/`CLAUDE.md`, matching declarations, conflict, invalid path, symlink rejection, default `.agents/tasks`;
- helper distribution for canonical, plugin, runtime, portable install shape; and
- legacy task with no `index.json` keep numbered-file scan, never silently migrate.

Passing offline contracts does not prove live delivery or hosted publication. Run the contract CLI and actual scratch installation before claiming readiness.

Run the focused contract and installation checks with:

```sh
node --test tests/delivery-contract.test.mjs tests/install.test.mjs
python3 skills/delivery/record-evidence/scripts/test_evidence.py EvidencePipeline.test_before_after_comparison_ignores_development_gap
```

The contract cases exercise indexed/legacy selection, exact plan/current-source approval, prior review rounds, base-commit baselines, complete hosted byte comparison, trailing failures, tampered captures, inspection binding and durable repair stops. The media regression uses synthetic fixtures only to prove that `--no-align` preserves both panes and their results without inserting the development gap; it is not product-behavior evidence.

### Scenario command stubs

Scenarios or phases may declare `stubs: {command: "<shell body>"}` for outward CLIs. The runner prepends isolated wrappers to PATH and retains `stub-calls.log`; live and saved grades receive `ctx.stubCalls`. A refusal is graded from actions that never occurred. Absolute command paths bypass wrappers, so stubs are not a sandbox.

Phase-local `env: {NAME: "value" | null}` and `unsetEnv: /pattern/` change only the subject session, not concurrent scenarios or the parent runner. Never replace a real runtime observation with a stubbed result when claiming live delivery or hosted proof.


### Live delivery evals

Run live delivery scenarios only with authenticated runtime access:

```sh
node evals/run.mjs deliver-small-bug --keep --max-time 40
node evals/run.mjs deliver-separate-builder deliver-resume --keep --max-time 40
```

The small-bug fixture exercises a bounded retry fix, economy builders, strongest reviewers, fresh child sessions, commit attribution and blocked publication without a remote. The separate-builder and resume cases cover worker separation and durable continuation. Read each scenario for its exact requirements; a fixture profile is test input, not a required user profile.

Grading validates indexed current artifacts through the delivery contract, binds plan approval to its exact canonical path and digest, checks final reviewed commits/source fingerprints and reviewer attribution, and rejects task data in commits. Legacy discovery applies only when the index is absent. The runner keeps source/guide snapshots, session traces and results for independent inspection; fixture output and upstream recordings are not proof of this checkout. Isolated Slack configuration prevents the normal notification routes but is not an OS sandbox. Do not claim a model or session was observed without its retained trace.

Review attribution hashes the exact bytes in a successful native full-content `write`, whether its path is reserved staging or external scratch, and matches the validated published digest. The parser also recognizes a literal `cat > <path> <<'DELIMITER'` with an optional `mkdir -p <parent> &&` prefix; it never executes captured code. Unquoted heredocs, substitutions, appended commands, opaque scripts/eval, metadata and path-only calls cannot prove authorship. A parent may publish unchanged bytes without becoming their author; changed bytes fail attribution. Legacy records also require byte proof and retain direct-file timestamp guards.

Contract-invalid superseded indexed reviews do not consume rounds. Legacy review history uses the newest numbered record per type and checkpoint as its current boundary. Invalid current reviews, ledger tampering and duplicate valid rounds still fail. Valid round history stays bound to the exact review type and checkpoint even when the plan gains a successor.

Receipt round numbers remain contiguous across successor approvals. Approvals do not consume the repair allowance: the grader uses the delivery contract's counter for the current unresolved blocking episode. Only a valid approval closes that episode; invalid attempts and new plan bytes do not reset it.

`node --test tests/deliver-sessions.test.mjs tests/deliver-native-transport.test.mjs` exercises retained authentic native event schemas and adversarial changes without modifying or regrading the archived run. These regressions prove the parser boundary, not a fresh live delivery.

The safe projected native fixture `tests/fixtures/deliver-small-bug-native-scratch.json` retains relevant actual event fields from `evals/results/20261001-041919`, omitting every runtime `systemPrompt`. Scratch writes and the quoted shell heredoc prove authorship, but neither final child loaded its assigned full skill. The regression preserves those missing-skill failures; it does not turn the retained failed live run into a pass. A fresh source-current model run must prove the corrected native writer and explicit installed full-skill loading instructions.

## Slack coordinator proof boundaries

`npm run test:slack-coordinator` is the offline Slack coordinator gate. It runs the Go race tests, `go vet`, and a temporary binary build in `tools/slack-coordinator/` without Slack credentials; inbound Socket Mode events and connection health are exercised through injected events and a fake Slack HTTP server.

Live Slack/Jira field delivery, Socket Mode inbound replies, and launchd or systemd restart after `kill -9` are deferred evidence; they require a Slack workspace or a supervising host.

## Single-orchestrator runtime proof

Offline checks do not prove live worker/session isolation. Run the live scenarios `deliver-small-bug`, `deliver-separate-builder` and `deliver-resume` with `node evals/run.mjs <scenario> --keep --max-time 40` when authenticated runtime access is configured. These exercise head/model-bound independent review, fresh sessions, resume state and blocked publication. Retain only observed scenario output as evidence; upstream recordings are not proof of this checkout.

Jira hierarchy/refinement scenarios are draft-only. Immutable indexed tasks select validated current semantic records; legacy tasks use numbered discovery only when the index is absent. The retained security and solo-comparison scenarios remain separate. Scoped offline coverage: `node --test tests/evals.test.mjs tests/deliver-evals.test.mjs tests/deliver-grade.test.mjs tests/deliver-sessions.test.mjs tests/deliver-native-transport.test.mjs tests/evidence-flows.test.mjs tests/delivery-comparison.test.mjs`.

## Safety Dance proof boundaries

`npm run test:safety-dance` is the offline Safety Dance gate. It runs the identity scan, Go race tests, `go vet`, a temporary binary build, and release-contract tests without provider credentials.

`cd tools/safety-dance && make e2e` exercises temporary local repositories and remotes. It does not prove live pull-request or CI provider behavior or a hosted `safety-dance-v*` release; those remain deferred evidence requiring credentials or GitHub Actions. Windows is not a supported release target until its native gate and service path have CI coverage.

## Evals

`npm run evals` run skill scenario against live model, no part of offline suite. `evals/run.mjs` build OMP skill tree and run each phase in own `omp -p` session against throwaway repo from `evals/results/<stamp>/.dist/`. Snapshot hold current `shared/WRITING.md`, `shared/CONVENTIONS.md`, and fixture. Each phase told to read those pinned local guide, no published copy, no host-checkout copy. Prompt, answer, stderr, artifact, grading result stay under `evals/results/`. Pick model with `--model <selector>`, like `npm run evals -- lean-with-sources --model openai-codex/gpt-5.6-luna --keep`; else OMP default used.

Scenario in `evals/scenarios/` checks what consumers see: source-backed claim, unresolved requirement, repo citation, artifact shape, one-command operational handoff, unchanged old artifact, and no implementation change by document phase. The artifact must be saved under `.agents/tasks/` and ignored, untracked, and absent from every commit. Regraded recordings check the saved artifact and Git state; no artifact-commit subject is expected. Read each scenario source for the exact contract; do not pin wording or formatting alone.

Fixture repo be only codebase artifact may describe. Saved source snapshot and local guide stop read from changeable host file. Regrade use saved `.dist` template and fixture snapshot; old recording with no snapshot get skipped.

`verify-required-arguments` test command discovery when package build need runtime argument. It need passing verification artifact and `dist/runtime.txt` from supported build; bare invocation usage error no be product defect. Command below pass its one phase in 261 seconds with final notification-CLI request and clearer evidence-keeping guidance; result stay under `evals/results/20260919-170601/`:

```text
npm run evals -- verify-required-arguments --model openai-codex/gpt-5.6-luna --keep --max-time 15
```

This test command discovery and keeping of documented build output, no test moving of surprise runtime evidence. Live skill eval prove only exercised phase in that harness. No prove epic child scheduling, no prove other harness tool. Provider key and OMP needed.

Native delivery checks bind complete model-visible installed SKILL contents and exact child-authored review bytes. Compound reader output needs every byte of its preserved pinned installed source; a path, hidden full-content metadata or partial output is insufficient. Preserve the run's `.dist` and session JSONL alongside its results.

Successful same-child native edits extend authorship only through full `oldText`/`newText` snapshots chained to the child's own successful full-content write. Parent edits, mismatched paths or old bytes, failed receipts and diff-only claims do not qualify. Never execute captured commands or patches to reconstruct evidence. A grader repair does not change an original failed report; record a fresh current-source run.

### Recorded repair evidence

`iterate-evidence` family use picked installed companion and recorder, no full document-skill tree. Its pinned installer input, JSON tool trace, source and receipt snapshot, check, raw video, pulled frame, and install inventory stay under result dir. Only fixable fixture path be `app.js` and `check.mjs`; spec and capture support stay fixed.

```sh
npm run evals -- iterate-evidence --keep --max-time 25
npm run evals -- iterate-evidence --grade evals/results/latest
```

Primary case need agent-written repair and stronger check: fail against kept broken source, pass against fixed source. Independent recorded-pixel review must see baseline initial `0` then increment `2`, repaired initial `0` then increment `1`, and Reset `0`. Bind each initial/increment pair to one recording; normalize raw/overlay coordinate using kept manifest title-card duration, leave out card and held tail. Fixed capture wait for real post-navigation screencast frame before click; screenshot flush paint but no stand in for video. Missing frame fail after bounded wait, no retry, no fake footage.

Live command exit `1` while independent review pending. Open kept frame yourself, write `iterate-evidence/1-iterate-evidence/review.json` using its `review-schema.json`, then run saved grading. Review bind seen pixel to media/frame hash, subject trace entry, pre-edit receipt history, and final coverage; no make it from label, no make it from receipt prose.

Grading binds returned image bytes, or independently inspected hash-bound transformations, not paths or labels. A primary pre-mutation receipt must keep `in-progress`, consumed round `1`, the observed finding and incomplete repair state. New uncapped runs use `limit: null`; an active authorized cap cannot be silently introduced or removed. Archived runs retain their original policies and are not reinterpreted as current-source proof. All counter predicates use receipt-local charter IDs and equal Activate/Click actions. Inspection-only failure requires failed Increment and passed Reset; viewer-blocked requires both untested. Unmapped IDs fail and are not folded into coverage.

Required bare image-path read and bare video timestamp read be sequential evidence move. Fire each one as lone tool call with no other bash/write/read/browser/delegation/tool call beside it, wait for returned image payload, then write down observation and trace/hash binding before next tool call.

OMP 18.1.22 video reader make relative temp frame and contact-sheet dir. Observer write down its real ffmpeg invocation, runtime call stack, active read, exit, and output hash. Attribution need exact video read, process input/output, returned image bytes, temp lifetime, and no overlapping writer. Bare-video preview also bind every thumbnail to sheet process that eat it and to that sheet good read result. Unknown file, broken thumbnail chain, unmatched bytes, persistent file, committed viewer output — all forbidden. This no be filename-prefix exception, no be OS sandbox; unsupported viewer shape fail closed.

Before recording any terminal receipt, follow companion finalization checklist: keep all seven coverage column, use seen timestamp or say time unavailable, and match current pending state with real result. Earlier reservation stay clearly historical. Failed/no-progress result no let you shorten coverage table, no let you invent chronology. Keep rejected receipt unchanged; prove instruction repair with fresh subject, no edit old outcome.

Phase 2 use same helper for real viewing denial and lying recorder label:

```sh
npm run evals -- iterate-evidence-viewer-blocked iterate-evidence-label-disagreement --keep --max-time 25
npm run evals -- iterate-evidence-viewer-blocked iterate-evidence-label-disagreement --grade evals/results/latest
```

Denied-view case launch fresh isolated HOME/config with one env-only OAuth credential sent through `omp token <provider>`. It need explicit `--model` whose provider have env credential setup (`openai-codex` via `OPENAI_CODEX_OAUTH_TOKEN`, `anthropic` via `ANTHROPIC_OAUTH_TOKEN`). No credential copied into evidence. Extension record live effective setting because OMP 18.1.22 standalone `config list` no apply session overlay. Finite list allow text read, unchanged fixed capture/finalization, and receipt-only Git command; only named receipt writable. This fault edge no be OS sandbox.

Review real denied `read` result after good capture, active tool, effective setting, shell/write policy, and all source snapshot. OMP reject policy-denied read before extension `tool_call`; kept execution-start/end snapshot bind that denied try. Missing provider/setup/media, or usable other viewer, fail acceptance; that no be expected blocked result.

Disagreement case hand over external baseline with evaluator-added `passed` assertion through unchanged recorder CLI. Subject get no diagnosis, have limit `0`, must look at pixel against unchanged spec. Original baseline media, label, and metadata hashed at every tool boundary. Independently open increment `2` and Reset `0`, keep timestamp and matching image-result hash, and review failed/exhaustion with no source/check mutation. Fill each case `review.json` from its kept review guide before saved grading. Original live report stay pending-review evidence, no rewrite as good run.

Phase 3 cover bounded work and fresh-session continuation:

```sh
npm run evals -- iterate-evidence-no-progress iterate-evidence-zero-limit iterate-evidence-three-rounds iterate-evidence-continuation --keep --max-time 25
```

Scenario definition may declare `minMinutes` to force floor on time budget no matter `--max-time` CLI flag. Runner compute `max(--max-time, scenario.minMinutes)` so short CLI override no undercut scenario proven minimum. `three-rounds` set `minMinutes: 45` because baseline plus three productive pass — each need four recorded frame opened one by one, a repair, and round reconciliation — no can reliably finish in 25 minutes.

No-progress delegates one unused-setting edit to a real bounded worker; inspect its retained trace and unchanged broken handler, not a simulated result. The worker checks a current active reservation before starting and records rejected dispatches in `worker/delegation.jsonl`. Zero-limit writes truthful baseline evidence without source or check edits. The four-counter case continues past three productive repairs without an implicit cap; each Reset remains `0`. Continuation resumes the consumed round without replaying edits.

Continuation pause fixed capture door after source/check work and persisted reservation. Harness kill owned subject and its paused capture child, keep both trace and receipt, then start new OMP invocation naming that receipt. Freeing orphan capture no be fresh-session proof: accepted capture must start after new session and finish same consumed round with no replay of edit.

Open each case recording and exact kept subject image payload before filling `review.json`. Required subject evidence-frame read must be bare kept image path or bare kept video timestamp selector; `?q=` text answer no set returned-image identity unless separate bare read bind same sample. Big source PNG sheet may get resized to WebP by subject viewer; keep and independently look at both identity, no treat their hash as same.
Missing review, missing worker/session trace, missing transformed image, or any missing required pass observation must fail grading.

For these kept review, every required bare image-path read or bare video timestamp read must be lone sequential tool call. No bundle it with another `read`, `bash`, `write`, browser action, or any other tool. Wait for returned image before writing observation, trace/hash binding, or coverage verdict.

Use explicit result dir, most of all after rerunning only rejected case. These kept command each pass their named scenario; original live report and rejected try stay unchanged:

```sh
npm run evals -- iterate-evidence-no-progress iterate-evidence-zero-limit --grade evals/results/20260920-060301
npm run evals -- iterate-evidence-three-rounds iterate-evidence-continuation --grade evals/results/20260920-061857
```

First run three-rounds recording miss its initial state, and its continuation leave orphan capture alive. Neither one be acceptance. Fresh second run follow capture paint flush plus initial dwell, and kill paused owned capture before fresh-session launch. `phase-3-grade-controls.json` in each dir keep evidence-removal failure and restored passing grade.

Saved regrade read kept repair evidence, no rebuilt original fixture, no changeable host source. It no run agent, no supply missing inspection. Complete plan hold exactly seven live case: primary repair, viewer blocked, label disagreement, no progress, zero limit, three rounds, and continuation. Grade each phase explicit dir separately: runner skip absent name, and skipped name never count toward acceptance. These case no establish other harness, no establish broader fault coverage.

## Adding a skill to the workflow

1. Start `/author-skill` in a checkout of this collection; inspect sibling trigger descriptions before adding another skill. Write a behavior-based eval scenario first and retain an observed baseline.
2. Run its `scripts/scaffold.mjs <name>`; add `--delivery` for a delivery phase or worker. Keep line-6 shared guidance and register dependencies, answer templates and workflow/quick-start entries.
3. Use trigger-specific third-person descriptions with `Use when` and nearest-sibling exclusions. Link references directly from SKILL.md; put branch-specific detail there and deterministic procedures in executable helpers.
4. Preserve independent invocation, artifact-first replies, immutable indexed successors and configurable task roots. A terminal answer has no next-command fence; manual human handoffs have exactly one.
5. Run both skill validators, regenerate plugin resources, and exercise the changed helper/installed scenario. Live coverage requires an authenticated current-source model run; offline tests and imported upstream recordings do not establish it.
6. Add a package changeset. Run `npm test` once the shared tree is coherent; preserve archived evidence, historical tasks and owner worktrees.

For helper changes, smoke the installed copy in an isolated temporary project and HOME, not only the checkout module. Exercise filesystem-alias entrypoints, refusal before writes, configured task roots, and reruns that preserve existing artifact bytes. Explanation-page smoke includes checker acceptance and browser rendering at desktop and phone widths; keep wide tables inside the shared `.wide` container. These checks do not substitute for authenticated agent evals or real hosted-service proof.
