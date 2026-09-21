# Testing

Keep evidence kinds apart: offline repo check, live skill eval, maybe-run Atomic runtime. One kind pass no mean other kind pass.

## Repository checks

`npm test` be big check; `package.json` hold exact command list.

| Surface | Entry point | Contract |
|---|---|---|
| Skill validation | `node scripts/validate.mjs` | Layout, frontmatter, shared links, templates, handoff fences, phase-table coverage, and source conventions |
| Plugin sync | `node scripts/sync-plugin.mjs --check` | Published plugin resources match canonical skills |
| Unit tests | `node --test tests/` | Installer ownership, runtime adaptation, commit rules, typed helper behavior, and workflow helpers |

Offline check no need Atomic install, no need live provider key. Installer test use temp home and temp project, cover:

- no-workflow default;
- project-local portable skill;
- independent partial pick;
- workflow discovery door; and
- scoped uninstall no touch real user install.

Old engine fixture no be Atomic run proof. Maybe-run TypeScript workflow plus helper be current controller source.

## Safety Dance proof boundaries

`npm run test:safety-dance` is the offline Safety Dance gate. It runs the identity scan, Go race tests, `go vet`, a temporary binary build, and release-contract tests without provider credentials.

`cd tools/safety-dance && make e2e` exercises temporary local repositories and remotes. It does not prove live pull-request or CI provider behavior or a hosted `safety-dance-v*` release; those remain deferred evidence requiring credentials or GitHub Actions. Windows is not a supported release target until its native gate and service path have CI coverage.
## Atomic runtime proof

Use scratch repo and scratch Atomic agent dir. Keep task stuff and other user state out of cleanup reach. Follow native [authoring](https://docs.bastani.ai/workflows/authoring) and [operations](https://docs.bastani.ai/workflows/operations) contract.

1. Install whole portable collection with `--atomic` into scratch spot.
2. Start Atomic, run `/workflow reload`, `/workflow list`, `/workflow inputs delivery`. Confirm registered name and input schema. Discovery no go deep, so check both installed top-level `skills-delivery.mjs` door and its nested source tree.
3. Run small real task with explicit workflow. Look at saved artifact and native run status. Fake context prove only helper/control flow, no stage run.
4. For gate change, use `gates=all` or `plan`: look at artifact, ask change, approve revision, look at pause/quit/resume with saved run id.
5. For headless change, use `gates=none`; no path may touch `ctx.ui`. Exercise blocked and failed result, no take them as done.
6. For auto routing, test JEV with key present and its visible unavailable-service fail path. Deterministic explicit chain no prove auto routing.

Write down exact command, version, seen status, blocker. Registration, module import, stub stage, or one deterministic helper result no be end-to-end workflow proof. Runtime integration be optional for skill-only change, but any claim about it need live proof.

### Retained Atomic 0.9.19 evidence

Current proven runtime edge be Atomic 0.9.19 native two-model-session artifact handoff. Table below keep seen result and limit apart:

| Run or evidence | Observed result | Limit or required handling |
|---|---|---|
| `0a18d915-142a-4f1a-a8d6-c453f86d4032` | Failed native run resumed from another process through the native workflow CONTROL TOOL. DBOS metadata showed `completed`, `count-effects=1`, and no replay of the `completed-once` callback. Raw proof: `/tmp/atomic-migration.JBu9Sk/recovery-proof.json`. | Direct headless `/workflow resume <run-id>` first error, DBOS durability no ready; native tool recovery start it. Narrow recovery result, no proof of every CLI path. |
| `6ba6144a-9806-4c7b-9ba0-ba1535b9df9f` | With a persistent interactive host, recovery advanced stage 016 to 017. | `-p` control-tool call can say `running` then pause when print mode kill its host; superseded paused host can push another pause while shutting down. Stop superseded host, keep one interactive `atomic` host open, run `/workflow status <run-id>` to start durability, then `/workflow resume <run-id>`. Chat back to idle keep run alive; exit no keep. Admission alone no be progress, no be done proof. |
| `b5e7dca8-8820-4d41-a8a5-e342ba386c03` | After host and device-service restoration, the run resumed from `crashed` with its first four stages cached. | Keep supervising host and owned device service alive across harness teardown. Open terminal screen no prove alive. Restore service, check authorized target, look at status and cached stage, then resume; stop persistent service after accept. Cached checkpoint no prove rest of delivery, no prove UI assertion. |
| `600e37e0-14f2-4b18-8348-0d00c8c8dcc7` | Successor run reused the task with `max_steps=80` and `verify=true`. | Old `6ba6144a-9806-4c7b-9ba0-ba1535b9df9f` run later come back `blocked` at its 40-stage wall; native resume refuse it as non-resumable. Go on with same `task_dir` and branch, bigger explicit `max_steps`, and needed verify setting. Keep blocked run and artifact; no reset checkpoint, no call it done. |
| Existing `task_dir` behavior | The runtime reads the canonical request from `task.md`. | New `request` no replace it, no carry repair feedback. Keep original request, add accepted feedback pointer to task, send them explicit to live stage that already took input. |
| `73ac4665-6b6e-430a-b11b-e8972a38037a` | Recovery after successor local PR description lack needed Purpose and Change outline fail with replay/topology mismatch. | No be good full-controller recovery proof. |
| `9b65b796-f8b0-419a-bc19-2640e5ad92fc` | Independent-verification revision guard fail after fixture build write untracked output in source tree; tracked implementation file stay same. | Exact pre-stage fingerprint no restore from kept generated output. Keep fixture build output outside source tree and keep each run outcome. |
| `853af082-da2e-4c89-8afd-94500a5a20e0` | Guard fail at `009-verify-implementation-observe` because relative evidence path write recording under `skills/delivery/jev-ui/.agents/`; recording kept before move. | Clean tree no prove exact fingerprint. No bypass guard, no throw away regression source to fake match. |
| `e4f70765-bd1a-48c4-acae-78d8c7fbc5f1` and `f54ac46d-1d0c-45c6-9357-c7022a496059` | Moving two runtime metadata file byte-same into task evidence bring back fingerprint, but continuation still fail topology admission. Atomic 0.9.19 give failed-run continuation fresh `ctx.runId`; putting that attempt ID in completed-workspace argument change checkpoint identity. | Fix take attempt ID out of those argument but keep original ownership ID in cached workspace output. Old checkpoint identity no migrate, no rewrite. |
| `d862dec2-ce66-4aab-91de-3bad68c8a649` → `41b053b4-e678-4afa-8621-cfb899abd7e7` | Real Luna-fast implementation session fail `001-implement-plan-observe` on purpose; fresh-ID continuation finish with cached `open-task-workspace`, zero-duration model reuse, same session ID, and observer admission. See-through context wrapper pass native task and argument along unchanged. | Prove internal replay after observer admission, no prove cached-child replay, no prove full delivery done. Evidence: `evidence/supervisor-independent-EE5OZZ/native-internal-replay/`. |
| Live intercom | In same 0.9.19 run, `workflow:<run-id>/**` message pile up under empty-root `[future]` while stage run. Blocking ask can outlive its target. | Queue admission no be delivery. Pick current roster receiver, demand ack, refresh receiver as stage move, put accepted finding in task artifact so fresh session no lean on undelivered queue. |
| Repair handoff | Fresh native `openai-codex/gpt-5.6-luna-fast` worker eat final `iterate-implementation` prompt in isolated `notifyctl`. Padded channel selector fail with exit 1 before repair, work after; whitespace, case, canonical logged channel identity, and input artifact all kept. | Stale uppercase-message finding no applied. Evidence and archive hash: `evidence/supervisor-independent-EE5OZZ/controller-repair-handoff/`. Prove repair input contract, no prove whole route, no prove recovery path. |

Full controller end-to-end delivery, every route and durable control, still unproven.

## Evals

`npm run evals` run skill scenario against live model, no part of offline suite. `evals/run.mjs` build OMP skill tree and run each phase in own `omp -p` session against throwaway repo from `evals/results/<stamp>/.dist/`. Snapshot hold current `shared/WRITING.md`, `shared/CONVENTIONS.md`, and fixture. Each phase told to read those pinned local guide, no published copy, no host-checkout copy. Prompt, answer, stderr, artifact, grading result stay under `evals/results/`. Pick model with `--model <selector>`, like `npm run evals -- lean-with-sources --model openai-codex/gpt-5.6-luna --keep`; else OMP default used.

Scenario in `evals/scenarios/` check what consumer see: source-backed claim, unresolved requirement, repo citation, artifact shape, one-command operational handoff, unchanged old artifact, and no implementation change by document phase. Artifact must be only path at `HEAD`, and commit must use valid Conventional Commit subject with `docs(task):`. Subject no compared with side wording. Read each scenario source for exact contract; no pin wording alone, no pin formatting alone.

Fixture repo be only codebase artifact may describe. Saved source snapshot and local guide stop read from changeable host file. Regrade use saved `.dist` template and fixture snapshot; old recording with no snapshot get skipped.

`verify-required-arguments` test command discovery when package build need runtime argument. It need passing verification artifact and `dist/runtime.txt` from supported build; bare invocation usage error no be product defect. Command below pass its one phase in 261 seconds with final notification-CLI request and clearer evidence-keeping guidance; result stay under `evals/results/20260919-170601/`:

```text
npm run evals -- verify-required-arguments --model openai-codex/gpt-5.6-luna --keep --max-time 15
```

This test command discovery and keeping of documented build output, no test moving of surprise runtime evidence. Live skill eval prove only exercised phase in that harness. No prove Atomic discovery, no prove its human UI, no prove durable resume, no prove epic child scheduling, no prove other harness tool. Provider key and OMP needed.

### Recorded repair evidence

`iterate-evidence` family use picked installed companion and recorder, no full document-skill tree. Its pinned installer input, JSON tool trace, source and receipt snapshot, check, raw video, pulled frame, and install inventory stay under result dir. Only fixable fixture path be `app.js` and `check.mjs`; spec and capture support stay fixed.

```sh
npm run evals -- iterate-evidence --keep --max-time 25
npm run evals -- iterate-evidence --grade evals/results/latest
```

Primary case need agent-written repair and stronger check: fail against kept broken source, pass against fixed source. Independent recorded-pixel review must see baseline initial `0` then increment `2`, repaired initial `0` then increment `1`, and Reset `0`. Bind each initial/increment pair to one recording; normalize raw/overlay coordinate using kept manifest title-card duration, leave out card and held tail. Fixed capture wait for real post-navigation screencast frame before click; screenshot flush paint but no stand in for video. Missing frame fail after bounded wait, no retry, no fake footage.

Live command exit `1` while independent review pending. Open kept frame yourself, write `iterate-evidence/1-iterate-evidence/review.json` using its `review-schema.json`, then run saved grading. Review bind seen pixel to media/frame hash, subject trace entry, pre-edit receipt history, and final coverage; no make it from label, no make it from receipt prose.

Primary grading check returned image bytes, or separately looked-at and hash-bound transformed payload, no take matching path alone. Required subject inspection must use bare image-path read or bare video timestamp read for image-payload identity; `?q=` image question be text-only and count only as interpretation when paired with bare binding read. Its pre-mutation receipt must keep `in-progress`, consumed round `1`, default limit `3`, the looked-at finding, and incomplete repair step. Settle that step from receipt current structured state, no from required phrase; done or contradictory state no can set up pending reservation. Final receipt with different default limit fail. All counter-flow predicate use same receipt-local charter resolution, including mapped ID and equal Activate/Click action. Inspection-only fail case need failed Increment and passed Reset; viewer-blocked need both untested. Unmapped ID stay failure, no fold into coverage.

Required bare image-path read and bare video timestamp read be sequential evidence move. Fire each one as lone tool call with no other bash/write/read/browser/delegation/tool call beside it, wait for returned image payload, then write down observation and trace/hash binding before next tool call.

OMP 18.1.22 video reader make relative temp frame and contact-sheet dir. Observer write down its real ffmpeg invocation, runtime call stack, active read, exit, and output hash. Attribution need exact video read, process input/output, returned image bytes, temp lifetime, and no overlapping writer. Bare-video preview also bind every thumbnail to sheet process that eat it and to that sheet good read result. Unknown file, broken thumbnail chain, unmatched bytes, persistent file, committed viewer output — all forbidden. This no be filename-prefix exception, no be OS sandbox; unsupported viewer shape fail closed.

Before commit any terminal receipt, follow companion finalization checklist: keep all seven coverage column, use seen timestamp or say time unavailable, and match current pending state with real result. Earlier reservation stay clearly historical. Failed/no-progress result no let you shorten coverage table, no let you invent chronology. Keep rejected receipt unchanged; prove instruction repair with fresh subject, no edit old outcome.

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

No-progress subject hand one unused-setting edit to real bounded OMP worker. Review its kept trace and unchanged broken handler, no simulated worker result. Disclosed worker command be delegation edge: it check receipt on disk before it start anything and write no reservation itself, so missing, stale, or terminal checkpoint fail closed with exact reason kept in `worker/delegation.jsonl` and worker never run. Zero-limit subject write truthful baseline evidence, no edit source, no edit check. Four-counter case leave out explicit limit and need baseline plus three productive pass: increment value `2222`, `1222`, `1122`, `1112`; every Reset stay `0`.

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

Saved regrade read kept repair evidence, no rebuilt original fixture, no changeable host source. It no run agent, no supply missing inspection. Complete plan hold exactly seven live case: primary repair, viewer blocked, label disagreement, no progress, zero limit, three rounds, and continuation. Grade each phase explicit dir separately: runner skip absent name, and skipped name never count toward acceptance. These case no establish other harness, no establish broader fault coverage, no establish Atomic run.

## Adding a skill to the workflow

1. Add `skills/delivery/<name>/SKILL.md` and `references/` template, keep frontmatter and shared link on line 6.
2. Add its row under exact `| Skill | Artifact type | Human gate | Runs in |` header in [workflows/delivery.md](../workflows/delivery.md#phase-table).
3. Keep independent invocation and artifact-first reply. Human handoff use one text command fence naming next skill and needed artifact; terminal reply have no fence.
4. Add controller integration only when workflow should call skill. Keep graph and decision in `atomic/workflows/delivery.ts` and tight helper in `atomic/lib/`. Every skill stage use `context: "fresh"`; each bounded-loop turn make new stage identity, no graph cycle.
5. Add test only for believable seen regression. Live artifact change may need eval; workflow API change need runtime proof.
6. Run `npm test` after related edit land. During shared work, one integration owner run big check after tree be coherent.