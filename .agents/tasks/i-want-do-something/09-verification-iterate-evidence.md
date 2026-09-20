---
task: i-want-do-something
type: verification
summary: "Fresh independent verification reran repository checks and exactly seven live evidence scenarios against 86797b6. Offline checks passed, but only five live scenarios passed independent pixel/history grading: primary recording coverage and zero-limit authorization failed. Three flow predicates accept reversed verdicts, and primary grading omits two promised proof checks. The findings are feedback for implementation; no product, configuration, or test fixes were made."
status: failed
revision: 86797b6
target: origin/main
---

# Verification

## Run

- Revision: `86797b66f492ec38a8c33d33be9aeff54ad0c9ba` on `i-want-do-something`; initially clean tree. This session did not implement the change.
- Target: `origin/main`, `4458fbf21e199dad45376b8164f78c2165ac1d20`; 48 changed paths, 24 test/fixture/check paths. No existing PR. Remote main was independently confirmed with `git ls-remote origin refs/heads/main`; stale local `main` (`fd28a8e868e4aac524652d6939d10aa7e0dba2c3`) was not used.
- Inputs: complete `task.md`, newest `05-plan-iterate-evidence.md`, and all three implementation receipts (`06`, `07`, `08`); summaries of earlier design/research artifacts. Receipt checkboxes were claims, not results.
- Checks from: `package.json`, lockfile, CI workflows and build CLI. `npm test` runs validation, plugin synchronization checking and the complete offline test suite. Build requires explicit runtime/destination. CI adds commit-subject checking. No separate lint/typecheck command; deployment/release publication was not run. No PR title exists to check.
- Coverage: 20 deduplicated acceptance items; 19 claimed by a receipt, one claimed by none. All 24 changed test/fixture/check files inspected. Remaining design risks were checked as instruction/source consistency, not additional live platforms.
- Graded by: `grade-steps --kind command`, model `jev-1.13.0`, tokens **6755 in / 761 out**; `grade-steps --kind diff`, model `jev-1.13.0`, tokens **8258 in / 872 out**. Exact stderr retained. A4/A9 were deterministic failures before judgment. Helper `unclear` rows were decided by hand as listed below; it was not unavailable.
- Result: repository checks **3/3 passed**; fresh live scenarios **5/7 passed**. Item failures: **T4, T6, T8, T9, T10, A4, A9**. No external prerequisite prevents verification; status is failed, not blocked.

### Commands and retained evidence

Run from repository root:

```sh
npm test
npm run build -- --runtime oh-my-pi --dest evals/results/verification-86797b6-20260920/build-oh-my-pi
node scripts/check-commits.mjs 4458fbf21e199dad45376b8164f78c2165ac1d20..86797b66f492ec38a8c33d33be9aeff54ad0c9ba
node --test tests/install.test.mjs
node --test tests/evals.test.mjs
node scripts/sync-plugin.mjs --check
npm run evals -- iterate-evidence iterate-evidence-viewer-blocked iterate-evidence-label-disagreement iterate-evidence-no-progress iterate-evidence-zero-limit iterate-evidence-three-rounds iterate-evidence-continuation --keep --max-time 25
npm run evals -- iterate-evidence iterate-evidence-viewer-blocked iterate-evidence-label-disagreement iterate-evidence-no-progress iterate-evidence-zero-limit iterate-evidence-three-rounds iterate-evidence-continuation --grade evals/results/20260920-065126
```

The build and saved-grade invocations used the absolute equivalents of these repository-relative destinations; command JSON retains exact argv. The seven-name live invocation was bounded to 25 minutes per subject, finished all cases, and exited 1. Each subject exited 0; continuation's first process was deliberately killed. Initial reports were 0/7 pending independent reviews, with primary and zero-limit failures already present. Reviews were then written from independently opened media and complete operation/state histories; no fresh case was rerun until green.

- [Fresh live evidence](../../../evals/results/20260920-065126/): each `<scenario>/1-iterate-evidence/` retains original sessions, full traces, every observer snapshot/blob, tool image payloads, source/check identities, original/raw/rendered footage, frame derivatives, final receipt, commit history and independent `review.json`. `--keep` also retains fixture repositories; their locations remain in the original execution metadata.
- [Verification proof](../../../evals/results/verification-86797b6-20260920/): exact commands/stdout/stderr/exits, full target diff and scope identity, per-case lossless tool/result exports and complete source/receipt transitions, original-session inventories, reviewed history reports, pixel bindings, grading inputs/outputs, preservation hashes and negative controls.
- [Exact final seven-grade output](../../../evals/results/verification-86797b6-20260920/A-fresh-seven-grade.json); [original pre-review execution results](../../../evals/results/verification-86797b6-20260920/live-command.json); [final summary copy](../../../evals/results/verification-86797b6-20260920/fresh-final-summary.json).
- [All changed-check digests](../../../evals/results/verification-86797b6-20260920/diffs.json); [acceptance metadata](../../../evals/results/verification-86797b6-20260920/acceptance-items.json); [command judgment input](../../../evals/results/verification-86797b6-20260920/steps.json); [final verdicts](../../../evals/results/verification-86797b6-20260920/final-grades.json).

## Items

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | Offline repository checks | npm test | Exits 0 with no failing test. | Exit 0; "tests 140", "pass 140", "fail 0", "skipped 0"; validator "ok: 44 skills"; plugin "in sync". | pass | 0.94 | 0 |
| C2 | Runtime build | npm run build -- --runtime oh-my-pi --dest evals/results/verification-86797b6-20260920/build-oh-my-pi | Exits 0 and builds the selected runtime. | Exit 0; "built oh-my-pi: 44 skills, 7 workers". | pass | 0.89 | 0 |
| C3 | CI commit-subject check | node scripts/check-commits.mjs 4458fbf21e199dad45376b8164f78c2165ac1d20..86797b66f492ec38a8c33d33be9aeff54ad0c9ba | Exits 0 with all branch subjects accepted. | Exit 0; "ok: 14 subjects". | pass | 0.92 | 0 |
| T1 | tests/evals.test.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | Eight new regression checks; no deletions or skips. Tests authorization across commits and intermediate snapshots, mixed commits, malformed traces, terminal answers, viewer restrictions and actual denial linkage. | pass | 0.87 | 0 |
| T2 | tests/install.test.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | Two new home/project install tests; no old assertion changes. Exact selected resources, readable references, unrelated resource/task preservation, no Atomic, selected uninstall and independently installed recorder byte preservation. | pass | 0.90 | 0 |
| T3 | evals/run.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | Adds evidence-family dispatch and pinned inputs; existing document checks unchanged. Conditional build and explicit existing grade path support. Missing evidence goes through failing family grader. | pass | 0.84 | 0 |
| T4 | evals/iterate-evidence.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New family harness retains source, tool, receipt, recording and guardrail evidence. Primary review checks opening path but omits subject image-byte correspondence, persisted consumed reservation, and exact default allowance. Other branches include stronger checks. No existing check deleted. | fail | hand | 2 |
| T5 | evals/iterate-evidence-hooks.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New tool-boundary observer and finite viewer-fault restrictions; actual approval denial delegated to runtime and verified from results. Alternate tools and undeclared shell commands rejected. | pass | 0.81 | 0 |
| T6 | evals/scenarios/iterate-evidence.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New primary scenario checks receipt type and delegates behavior to family grader. Default allowance and persisted reservation are requested but not fully checked by primary grader. | fail | hand | 2 |
| T7 | evals/scenarios/iterate-evidence-viewer-blocked.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New denied-view scenario checks blocked outcome, zero consumption/default allowance and named Increment/Reset untested coverage. Family grader requires real recording and denied opening. | pass | hand | 0 |
| T8 | evals/scenarios/iterate-evidence-label-disagreement.mjs | Actual origin/main...HEAD diff; full diff and source inspection; swapped-coverage negative control | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New disagreement check requires any passed and any failed row, not their flow identity. Independent negative execution returned ACCEPTED: zero problems for Increment passed and Reset failed, contrary to its promised outcomes. | fail | 0.05 | 3 |
| T9 | evals/scenarios/iterate-evidence-zero-limit.mjs | Actual origin/main...HEAD diff; full diff and source inspection; swapped-coverage negative control | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New zero-limit check requires zero allowance, open finding, any passed/failed rows. Independent negative execution returned ACCEPTED: zero problems for swapped Increment/Reset outcomes. | fail | 0.10 | 3 |
| T10 | evals/scenarios/iterate-evidence-no-progress.mjs | Actual origin/main...HEAD diff; full diff and source inspection; swapped-coverage negative control | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New no-progress check requires one consumed round, open finding, any passed/failed rows. Independent negative execution returned ACCEPTED: zero problems for swapped Increment/Reset outcomes. | fail | 0.09 | 3 |
| T11 | evals/scenarios/iterate-evidence-three-rounds.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New three-round scenario checks failed exhaustion and exactly three consumed/default rounds. Family grader requires four source/capture identities and 32 independently reviewed flow/pass observations. | pass | hand | 0 |
| T12 | evals/scenarios/iterate-evidence-continuation.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New continuation scenario checks success, same single receipt/finding and one consumed/default-three allowance. Family requires real interrupted/fresh sessions, no replay and faulty-fail/repaired-pass guardrail. | pass | hand | 0 |
| T13 | evals/fixtures/iterate-evidence/app.js | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New intentionally defective single-counter application increments two and resets zero, matching planned seeded bug; no artificial success path. | pass | hand | 0 |
| T14 | evals/fixtures/iterate-evidence/capture.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New immutable capture clicks real browser controls, records actual video and served-source hashes. Planned continuation pause does not perform repairs or acceptance. | pass | hand | 0 |
| T15 | evals/fixtures/iterate-evidence/check.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New deliberately weak initial positive-count check supplies the planned observed guardrail gap. Acceptance separately requires strengthened exact check faulty-fail/repaired-pass. | pass | hand | 0 |
| T16 | evals/fixtures/iterate-evidence/index.html | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New fixed visible counter and native controls. No expectation relaxation or hidden success rendering. | pass | hand | 0 |
| T17 | evals/fixtures/iterate-evidence/server.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New loopback ephemeral HTTP fixture server uses fixed files and no-store responses; no scenario-dependent application result. | pass | hand | 0 |
| T18 | evals/fixtures/iterate-evidence/spec.md | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New immutable specification requires increment exactly one, Reset zero and final same-revision coverage. | pass | hand | 0 |
| T19 | evals/fixtures/iterate-evidence-three-rounds/app.js | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New four-counter application contains four independent planned increment-two faults and working Reset handlers. | pass | hand | 0 |
| T20 | evals/fixtures/iterate-evidence-three-rounds/capture.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New fixed capture exercises all four increments before every Reset, retains initial paint/dwell and served/video identities. No diagnosis/repair algorithm. | pass | hand | 0 |
| T21 | evals/fixtures/iterate-evidence-three-rounds/check.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New deliberately weak positive-count checks cover all four counters as planned. Independent recorded coverage remains required; not final acceptance alone. | pass | hand | 0 |
| T22 | evals/fixtures/iterate-evidence-three-rounds/index.html | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New four-counter fixed UI supplies separate visible values and controls; no synthetic result switching. | pass | hand | 0 |
| T23 | evals/fixtures/iterate-evidence-three-rounds/spec.md | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | New immutable eight-flow specification requires exact outcomes, independent counters and full regression each revision. | pass | hand | 0 |
| T24 | scripts/validate.mjs | Actual origin/main...HEAD diff; full diff and source inspection | The change keeps this check's strength and rejects violations of its declared acceptance contract. | Only inventory count increases from 43 to 44 and two answers use existing terminal-template rules. No validation exemption, assertion removal or skip. | pass | 0.87 | 0 |
| A1 | Independent selected install and generated publication; 05-plan-iterate-evidence.md:162; 06-implementation-iterate-evidence.md:35-37; claimed: yes | node --test tests/install.test.mjs; node scripts/sync-plugin.mjs --check | Install selects companion plus recorder, preserves unrelated resources and ownership; no implicit Atomic. | node --test tests/install.test.mjs exit0: 15 tests,15pass,0fail. Home/project selected resources and sentinel/recorder preservation assertions pass. node scripts/sync-plugin.mjs --check exit0: plugin in sync. | pass | 0.87 | 0 |
| A2 | Baseline inspection precedes consumed reservation; 05-plan-iterate-evidence.md:163; claimed: yes | Fresh live command; complete tool/source/receipt histories and snapshot ordering | Recorded failing pixels and inspected finding persist before inline/delegated source or check changes. | Primary baseline initial0/increment2 independently opened; image results2390/2471 precede snapshot133 consumed1, then check136/app148. No-progress reservation121 before worker mutation7(parent127); three-round reservations106<109,151<157,187<193; continuation136<139. | pass | 0.81 | 0 |
| A3 | Same strengthened guardrail fails faulty and passes repaired; 05-plan-iterate-evidence.md:164; claimed: yes | Fresh live command; recorded exact check invocations, retained checks.json, source hashes | Preserve expected inputs/outcomes; identical strengthened check fails original and passes repaired served source. | Primary check hash5a075b92 unchanged across executions: original positive-only exit0; strengthened original exit1 "AssertionError [ERR_ASSERTION]: One Add one activation produces exactly one", actual2 expected1; repaired exit0 "Counter check passed". Original assertion retained, initial0/exact1/Reset0 added. Continuation independently records same red/green boundary. | pass | 0.89 | 0 |
| A4 | Primary fresh full-flow success; 05-plan-iterate-evidence.md:165; claimed: yes | Fresh primary run; raw/frame pixel inspection; current saved grader | Fresh final recording proves initial0 then one Add activation1 then Reset0; required findings resolved and passed/success. | Saved grade exit1: "receipt: expected passed/success with a summary"; "inspection: independent receipt, expectation, history, and mutation-tool review required". Main opened raw-first=1, raw1.5=1, raw2.5=0 and65-frame early sheet(first53=1,remaining12=0). Initialzero absent. Receipt truthfully blocked/blocker1/3; review coverage/resolution false. | fail | 1.00 | 2 |
| A5 | Missing required review/provenance fails closed; 05-plan-iterate-evidence.md:166,238-240,286; claimed: yes | Seven npm run evals -- NAME --grade negative-controls invocations; exact arguments/output in negative-controls.json | Saved grading rejects missing reviewer, incorrect image binding, missing actual capability/worker/interrupted/payload evidence and omitted required pass. | Seven controls on copied fresh evidence each exit1,0/1: missing review; wrong image line; missing effective-config.json; missing worker/trace.jsonl; missing interrupted/trace.jsonl; missing trace-images/9380-1.webp; omitted pass2 yields eight "one pass 2 ... observation required" errors. Valid originals unchanged. | pass | 0.85 | 0 |
| A6 | Actual viewing denial without repair; 05-plan-iterate-evidence.md:238; 07-implementation-iterate-evidence.md:33; claimed: yes | Fresh viewer-blocked run, effective configuration, denied result and complete history | Successful recording but actual viewer denial causes blocked0/3, both flows untested and no source changes. | "[iterate-evidence-viewer-blocked] saved evidence: ok". Trace2538 "Tool "read" is blocked by user policy." after capture/stop/frames. All38tools/115snapshots reviewed, zero image deliveries; effective denial/alternate restrictions retained. App/check unchanged, receipt-only commit, blocked/blocker0/3. | pass | 0.87 | 0 |
| A7 | Pixels override contradictory passed labels; 05-plan-iterate-evidence.md:239; 07-implementation-iterate-evidence.md:34; claimed: yes | Fresh label-disagreement run, original event/raw pixels and full history | Preserved passed annotations do not override faulty increment; required flow fails with stable finding and no repair. | "[iterate-evidence-label-disagreement] saved evidence: ok". Original/raw pair0→2→0 independently opened; Increment2 fails unchanged expected1, Reset0 passes. StableIE001open,0/0. All59tools and original baseline retained. Late injected Add PASS occurs after Reset start, not directly over count2. | pass | 0.87 | 0 |
| A8 | Ineffective delegated repair stops no-progress; 05-plan-iterate-evidence.md:283; 08-implementation-iterate-evidence.md:37; claimed: yes | Fresh no-progress run, actual worker trace, both recordings and full history | One real worker edit, fresh coverage, unchanged unresolved set; stop no-progress without another round. | "[iterate-evidence-no-progress] saved evidence: ok".64parent+2worker calls; only unused constant2→1; handler+2/check unchanged. Both passes0→2→0; IE001stillopen; no-progress wins simultaneous exhaustion1/1. No extra worker/capture. | pass | 0.86 | 0 |
| A9 | Zero allowance end-to-end inspection-only scenario; 05-plan-iterate-evidence.md:284; 08-implementation-iterate-evidence.md:38; claimed: yes | Fresh zero-limit run, snapshot101, parallel video-read history, source hashes, current saved grader | Fresh inspection with0/0 allowance, no repair/reservation or unauthorized changes; failed/exhaustion and open finding. | Saved grade exit1, twice "authorization: forbidden change omp-video-frame-wZlceo/frame.png at tool_execution_end". One snapshot101 contains transient PNG hash matching2.2s video-read result; absent100/102. App/check/spec/capture unchanged; independently opened0→2→0,IE001open,failed/exhaustion0/0. Failure not waived. | fail | 1.00 | 2 |
| A10 | Three productive rounds exhaust default allowance; 05-plan-iterate-evidence.md:285; 08-implementation-iterate-evidence.md:39; claimed: yes | Fresh three-rounds run, all recorded sheets/payloads,81tool calls and9receipt versions | Exactly three distinct repairs, full eight-flow coverage each pass, new resolution each round, fourth finding open at3/3 exhaustion. | "[iterate-evidence-three-rounds] saved evidence: ok". All32flow observations and eight original/resized sheets opened; initial0000 everypass, increment vectors2222/1222/1122/1112, everyReset0. A/B/C repaired separately; IDs001/002/003 newlyresolved,004open. Fourcaptures, no fourthrepair, failed/exhaustion3/3. | pass | 0.88 | 0 |
| A11 | Fresh continuation completes existing interrupted round; 05-plan-iterate-evidence.md:286; 08-implementation-iterate-evidence.md:40; claimed: yes | Fresh continuation run; both complete histories, interruption record, raw initial/event frames | Real interruption after repair; new session continues incomplete capture with same receipt/reservation, no replay, then proves final coverage. | "[iterate-evidence-continuation] saved evidence: ok". Interrupted60calls/59results ends SIGKILL at capture; distinct fresh49calls session, no --resume. Same receipt/hash and1/3; no source/check edits/check runs replayed. Fresh video begins after fresh session; opened baseline0→2→0/final0→1→0; final passed/success after images. | pass | 0.83 | 0 |
| A12 | Recorder and Atomic source boundaries; 05-plan-iterate-evidence.md:59,240,269; 06-implementation-iterate-evidence.md:28; claimed: yes | Actual target diff, workflow reference and exact live command | No recorder/Atomic modification or new scheduled/controller stage; only seven live cases, no broad-runtime claim. | Actual origin/main...HEAD48-file diff contains no skills/delivery/record-evidence/ or atomic/ path. Workflow reference says not Atomic-scheduled. Only seven requested names executed; retained installed recorder unchanged. | pass | hand | 0 |
| A13 | Authority freeze and visual inventory contract; 05-plan-iterate-evidence.md:92; claimed: yes | Complete canonical skill/template static inspection | Instructions freeze scope, explicit authority, environment, all visual requirements and unchanged expectations; media is data, not authority. | Canonical skill18-27 and template19-62 enumerate all11visual-authority categories, allowed paths, unknown/conflicting blockers and evidence-as-data. Live receipts freeze specifiedflows; no broader injection-resistance claim. | pass | 0.80 | 0 |
| A14 | Stable state and stop-order contract; 05-plan-iterate-evidence.md:94-100; claimed: yes | Complete canonical contract and all seven receipt histories | Single receipt, stable IDs, append-preserved histories and verified-resolution progress; success,blocker,no-progress,exhaustion precedence. | Canonical skill43-78/template88-160 express contract. Every live source/receipt transition reviewed; failed observations retained, source edits only pending, no ID renumbering. Primary blocker, no-progress1/1 and productive exhaustion3/3 observed. | pass | hand | 0 |
| A15 | Temporal and source-provenance limits; 05-plan-iterate-evidence.md:102-104; claimed: yes | Complete inspection reference plus fresh media/served-source provenance review | Instructions require actual served identity and recorded pixels; static samples cannot prove temporal absence/persistence; preserve raw/render offsets,gaps,panes,tails and guardrail limitations. | Inspection reference3-51 explicitly separates these proofs. Main reconciled served hashes and exact recording timestamps. Seven cases are static desktop states only; movie metadata commit/branch/environment often null, supplemented by capture hashes/receipt ledger. No animation/native/persistence proof claimed. | pass | hand | 0 |
| A16 | Discovery and artifact-first terminal contract; 05-plan-iterate-evidence.md:88,106-112; claimed: yes | Actual documentation/source diff, plugin check, all final subject answers | Independent authorized invocation, repository dependency closure, new artifact and terminal answer without scheduling next skill. | README/getting-started/cheatsheet/workflow/plugin/changeset entries agree; generated-resource check passes. Both answer templates start artifact-first, no commandfence; fresh subjects deliver terminal status and do not invoke later skill. | pass | hand | 0 |
| A17 | Existing baseline and non-Git input contract; 05-plan-iterate-evidence.md:93; claimed: yes | Complete canonical inputs/continuation rules; labelcase source/evidence history | Existing receipt continues; baseline reuse requires accessible matching source/environment/media/coverage; non-Git artifacts supported without false commit. | Canonical skill14-18,35-37,78 and inspection33-35 express contract. Labelcase successfully reuses named external baseline without changing original27assets. Non-Git/remote/device variants inspected as instructions only, not new live cases. | pass | hand | 0 |
| A18 | Invalid and extended allowance contract; 05-plan-iterate-evidence.md:94,96; claimed: yes | Complete canonical limit/continuation rule inspection, existing seven budget histories | Nonnegative integer allowance default3; baseline0; explicit extensions preserve consumed work/history; no extra retry outside allowance. | Canonical skill24,45,59-76/template58-62,106-114 specify invalid-limit handling, explicit extension and preservation. Observed0/0,1/1,3/3 and continued1/3 match; invalid/extension branches are static consistency checks only per bounded plan. | pass | 0.83 | 0 |
| A19 | Prior and fresh evidence preservation; User verification request; 05-plan-iterate-evidence.md:138-145; claimed: no | SHA256 comparison in old-evidence-preservation-final.json; current retained grader inventory | Keep rejected and prior evidence; retain fresh traces, media, checks and independent reviews explicitly. | 29original review/report/summary/control files across five prior runs retain exact hashes. Seven fresh complete evidence trees and review.json files retained; seven negativecontrols used separate copies; product/config/tests untouched. | pass | 0.86 | 0 |
| A20 | Separate source and receipt delivery commits; 05-plan-iterate-evidence.md:102; 06-implementation-iterate-evidence.md:24; claimed: yes | Original history.json/tool arguments/final source identities for all seven | Local requester-only evidence, source commits separate from receipt-only commits; application identity not replaced with docs commit. | All seven complete commit/tool histories reviewed. Primary,worker,three-rounds,continuation have separate source and receipt commits; zero/viewer/labels receipt-only. No media commit or PR posting. Zero subject also used harness xd://report_issue for tool mismatch; no product edit. Main commits only verification artifact. | pass | 0.84 | 0 |

Confidence retains the helper's **satisfied probability**, including low values for failed items; it is not inverted into confidence-in-failure. `hand` identifies manual decisions after `unclear`. Deterministic failures use 1.00. No item is untested within this plan's expressly bounded live/static verification scope; excluded platform and temporal claims remain limits, not inferred passes.

## Findings

### A4 — Primary recording cannot establish required fresh full-flow success

- Severity: **2**. Expected final initial0 → one Add activation1 → Reset0, both required flows at the repaired revision, resolved findings and passed/success (`05-plan-iterate-evidence.md:165`).
- Fresh current saved grader returned exit1: `receipt: expected passed/success with a summary` and `inspection: independent receipt, expectation, history, and mutation-tool review required`.
- Main independently opened postrepair `frames/raw-first.png` (count1), `raw-1.500.png` (1), `raw-2.500.png` (0), the full-page labeled samples, and the 65-frame early sequence sheet. Frames 1–53 show1; frames54–65 show0. There is no recorded initial-zero precondition in that capture. The event-labeled increment frame is not a substitute for it.
- Arithmetic was repaired and the identical strengthened guardrail genuinely failed original/passed repaired. This is **not** a repaired-check failure. Subject correctly stopped `blocked/blocker`, consumed1/3, IE-001 blocked and IE-002 pending. Independent review deliberately records `requiredCoveragePassed:false` and `findingsResolved:false`, rather than satisfying the grader with false booleans. The broad second diagnostic reflects that honest review, not an omitted history audit.
- Evidence: `iterate-evidence/1-iterate-evidence/task/evidence/round-1/`, `checks.json`, `review.json`; reservation snapshot133, check mutation136, app mutation148, final receipt snapshot250. Fresh raw SHA256 `35612abfbd15f9168463cf428dcfeb6c9a87090f9344e0346930e52ce6e53fef`; first-frame SHA256 `8188a8a6179a3f2f4bc2cdfb059477f4198e4baa7c727826966f4d20c44b1249`.
- Recording-start/paint alignment is a possible cause, not proven here. No application initialization defect is inferred and no recorder/capture code was changed.

### A9 — Zero-limit grader rejects a transient video-viewer file

- Severity: **2**. Expected inspection-only0/0 with no repair, reservation or unauthorized changes and failed/exhaustion (`05-plan-iterate-evidence.md:284`).
- Fresh saved grade exit1 printed twice: `authorization: forbidden change omp-video-frame-wZlceo/frame.png at tool_execution_end`.
- Both diagnostics refer to the same snapshot101, not two source mutations. At 06:54:33.472Z it contains a32295-byte PNG outside allowed receipt/ignored evidence. Snapshots100/102 do not. The PNG hash `fda8972bd1d880766c314dde004d352e6b5ab342181644ccb8ffc0f66b8c7654` exactly equals the concurrent raw2.2s read result (`trace-images/3405-1.png`). The observer boundary belongs to the concurrent0.7s read. Another temporary frame name exists only in the untracked list.
- Complete56-call history contains no explicit source/capture write creating either path. [INFERENCE] The video-viewing operation generated the transient files; the reader's internal implementation was not inspected. The actual authorization failure is retained, not waived merely because the likely producer is a tool.
- Application/check/spec/capture hashes remained unchanged; one baseline capture, no reservation, correct recorded0→2→0 and final failed/exhaustion0/0 with IE-001 open. These correct behaviors do not make the whole end-to-end scenario pass.
- Evidence: zero-limit `snapshots/000101-tool_execution_end.json`, adjacent snapshots, raw read results3402/3405/3408, original session78–84, `review.json`, and consolidated `ZeroHistory-review.json` in verification proof.

### T4 — Primary grader leaves image/reservation proof to unchecked reviewer assertions

- Severity: **2**, hand-decided after helper `unclear`. Expected real pixel identity and consumed reservation proof, not path-only assertions (`05-plan-iterate-evidence.md:138-145,163,166`).
- `evals/iterate-evidence.mjs:330-333` checks a successful image result and matching frame path but not that returned image bytes match the independently opened frame or a separately reviewed transformed payload. The other branches explicitly check this at453-457 and581-590.
- `:344-353` checks ordering and that the reserved receipt contains IE-001, but does not check its persisted `consumed_rounds` or reservation state. Bounded cases explicitly check consumption at603-608.
- These are static acceptance gaps in a new grader; no existing check was deleted. The fresh primary actually had valid ordering and truthful failure. No claim is made that a forged full evidence tree was accepted: only the missing conditions are established by source inspection. Wrong-image and missing-evidence negative controls passed on branches that do implement those checks.

### T6 — Primary default allowance is requested but not independently checked

- Severity: **2**, hand-decided after helper `unclear`. Expected default three-round contract remains verified (`05-plan-iterate-evidence.md:94,163`).
- `evals/scenarios/iterate-evidence.mjs:11` checks only artifact type and delegates to the family grader. The primary family check at `evals/iterate-evidence.mjs:664` compares consumed count with the receipt's own limit; it does not require default3. The scenario therefore cannot reject a wrong self-reported primary allowance on that condition alone.
- The fresh receipt did retain3. This finding concerns missing checking strength, not a observed allowance reset or a demonstrated full-grader forgery.

### T8 — Label-disagreement coverage predicate accepts reversed flow verdicts

- Severity: **3**, helper fail. Expected Increment failed and Reset independently passed (`05-plan-iterate-evidence.md:239`).
- `evals/scenarios/iterate-evidence-label-disagreement.mjs:23-26` checks any failed row and any passed row without flow identity.
- Executed current predicate with valid required receipt fields but Increment passed/Reset failed. Exact result: `ACCEPTED: zero problems`. The real fresh subject classified flows correctly; this negative control establishes a checker gap, not a subject failure.

### T9 — Zero-limit coverage predicate accepts reversed flow verdicts

- Severity: **3**, helper fail. Expected Increment failed and Reset passed at0/0 (`05-plan-iterate-evidence.md:284`).
- `evals/scenarios/iterate-evidence-zero-limit.mjs:32-35` has the same unbound row checks. Current predicate accepted swapped outcomes: `ACCEPTED: zero problems`.
- Separate from A9's transient-file failure; neither invalid receipt coverage nor the authorization failure was waived.

### T10 — No-progress coverage predicate accepts reversed flow verdicts

- Severity: **3**, helper fail. Expected unchanged failed Increment and independently passed Reset after ineffective repair (`05-plan-iterate-evidence.md:283`).
- `evals/scenarios/iterate-evidence-no-progress.mjs:32-35` checks any failed/passed rows. Current predicate accepted the swapped outcomes: `ACCEPTED: zero problems`.
- T8/T9/T10 control command was `node /tmp/iterate-verification.fkKZX1/coverage-negative.mjs <repository-root>`, exit1 because rejection was expected but all three predicates accepted. The retained script and exact output are `coverage-negative.mjs` and `T-coverage-negative.json` in verification proof. This was a predicate-level negative control of existing seven cases, not an extra live scenario or a full-grader bypass claim.

## Evidence review

### Complete histories, not selected favorable tool calls

All completed tool arguments/results, every distinct tracked source/check/spec transition and every receipt version were inspected, with original session/trace cross-checks. Main opened the pixels; read-only history reviewers audited independent completed cases. The lossless exports retain source coordinates. No reviewer inferred numeric pixels from filenames, receipts or labels.

| Scenario/session | Calls/results | Image results | Observer snapshots | Receipt versions | Actual outcome |
|---|---:|---:|---:|---:|---|
| Primary |85/85|17|259|5|blocked/blocker1/3; scenario failed |
| Viewer blocked |38/38|0|115|2|blocked/blocker0/3; scenario passed |
| Label disagreement |59/59|8|182|2|failed/exhaustion0/0; scenario passed |
| No-progress parent |64/64|10|194|5|failed/no-progress1/1; scenario passed |
| No-progress worker |2/2|0|8|unchanged reserved receipt|one exact ineffective edit |
| Zero limit |56/56|11|170|2|failed/exhaustion0/0; scenario failed authorization |
| Three rounds |81/81|14|245|9|failed/exhaustion3/3; scenario passed |
| Continuation interrupted |60/59|5|180|4|SIGKILL during capture call |
| Continuation fresh |49/49|5|149|4 including inherited version|passed/success1/3; scenario passed |

The missing interrupted result is the killed operation, not a silently skipped completed call. Continuation has seven unique receipt contents across its two sessions. Counts exclude duplicate base/final export snapshots. Normalized original session records preserve original line numbers and image hashes while omitting opaque encrypted provider replay fields; complete authoritative tool arguments/results and original JSONL files remain retained. Repeated streaming deltas, redundant metadata envelopes and every duplicate snapshot body were not individually reread; all state transitions and snapshot integrity were covered by the audits and current grader.

### Pixel and timing observations

Every review observation records exact capture/media/frame path, SHA256, media-coordinate timestamp, numeric observation and original subject result line. The following is a reading index; full per-flow bindings are in each `review.json`.

| Scenario/pass | Independent recorded observation | Example subject result / time |
|---|---|---|
| Primary baseline |initial0; Increment2|2390 at rendered6.864s; initial2471 at raw0.500s |
| Primary repaired |first frame1, then1→0; no initialzero|8377 at raw1.500s;8371 at raw2.500s; early65-tile sheet8915 |
| Viewer blocked |subject receives actual denial; Main separately sees recorded2|denial2538; Main's later opening was not fed to subject |
| Label baseline |raw0→2→0, despite preserved passed metadata|increment3567 at rendered6.883s; Reset3573 at9.364s; exact raw-pair payloads3585/3582 |
| Zero baseline |raw0→2→0|increment3815 at6.858s; Reset3824 at8.978s; initialraw0.700s and exact Reset pair4136 |
| No-progress baseline / round1 |both0→2→0|baseline3086/3092 at6.863/8.993s; round110120/10117 at7.054/9.183s; raw precondition pairs3442/10126 |
| Three-round baseline/R1/R2/R3 |initial0000 each; increments2222/1222/1122/1112; all four Resets0 each|all eight original sheets and exact resized payloads2915/2912,6577/6574,9380/9377,11537/11534; all four raw1.5s initial frames |
| Continuation baseline/fresh |0→2→0 then0→1→0|interrupted3170/3164 at6.928/9.055s; fresh3136/3139 at6.874/9.026s; both raw0.800s initial frames |

Three-round sheets were opened as both original JPEG and actual resized WebP result. Each of32 observations identifies the exact right-column assertion tile; reviewer image hashes are not confused with original sheet hashes. All four counts coexist before Reset sequence. Initial raw frames establish preconditions that delayed test-start frames cannot.

Rendered samples generally include four-second title cards and default event extraction delay0.600s. Per-session offsets and zero held-tail values were read, not inferred from labels. Continuation's offset108.517s reflects an older external session clock and genuinely later fresh video start; it does not mean reused old capture. These observations establish specified static states, not complete temporal absence, animation, persistence or business effects.

Label-disagreement's injected Add PASS was appended after Reset began and its late frame shows0, not count2 under a simultaneous green PASS. Zero-limit's retrospective failed/pass labels likewise group under Reset and are clamped late; original inconsistent labels/reports were preserved. Independent early pixels, not recorder aggregates, decide actual flow outcomes.

### Saved-grader negative controls

Seven controls used copies under `verification-86797b6-20260920/negative-controls`, never original prior/fresh inputs. Each command was `npm run evals -- <scenario> --grade <absolute-control-root>`, with one removed/changed proof field and bytes restored afterward. Exact argv and output are retained in `negative-controls.json`; copied report files reflect the last control and are not fresh subject results.

| Control | Scenario | Exact decisive rejection; all exit1 |
|---|---|---|
|Missing review|label-disagreement|`inspection: pending independent review; open retained evidence and complete review.json`|
|Wrong image-result line|label-disagreement|`inspection-only: subject image bytes differ from the independently opened frame`|
|Missing effective settings|viewer-blocked|`retention/setup: Missing retained file: effective-config.json`|
|Missing worker trace|no-progress|`retention/setup: Missing retained file: worker/trace.jsonl`|
|Missing interrupted trace|continuation|`retention/setup: Missing retained file: interrupted/trace.jsonl`|
|Missing resized payload|three-rounds|`retention/setup: Missing retained file: trace-images/9380-1.webp`|
|Omitted entire round2 observations|three-rounds|eight `bounded: one pass 2 <flow> observation required` errors|

These successful rejection controls do not repair or negate T4/T6/T8/T9/T10. No acceptance condition or grader input was weakened to produce the final5/7 result.

### Preservation and verification boundaries

- Prior evidence directories retained untouched: `20260920-051455`, `20260920-053803`, `20260920-054114`, `20260920-060301`, `20260920-061857`. All29 inventoried original review/report/summary/control files matched their initial SHA256 after this verification. Historical successful checkboxes were never substituted for fresh execution.
- Fresh run `20260920-065126` and all verifier evidence are retained in ignored `evals/results/`; previous/latest aliases were not used to select grading inputs. User-requested retention includes rejected evidence and original subject repositories.
- Product/configuration/test paths were read-only. The only tracked deliverable is this verification artifact. Mutating plugin generation was not run; `--check` plus validator proved current generated state. No new permanent test was added.
- The owned live supervisor terminated exit1 after all seven cases. Main started no additional server/container/emulator; existing user services were not stopped. The harness's fixture teardown and recorded owned child stops remain in execution histories. Temporary external grading files were removed after retaining their inputs/scripts/results.

## Missing

None.

## Human Review

### Review targets

- The complete C/T/A table, then all seven findings. Do not replace fresh failures with earlier implementation receipts or old graded results.
- Original media and exact transformed payloads alongside hash-bound reviews, complete source/receipt transitions, denied-tool/effective-policy proof and both continuation histories.
- Distinguish correct subject fail-closed behavior from failed end-to-end scenario acceptance; distinguish a predicate-level negative control from a demonstrated complete-grader bypass.

### Verify

- [ ] Re-run `npm test`; Exits 0 with no failing test.
- [ ] Re-run `npm run build -- --runtime oh-my-pi --dest evals/results/verification-86797b6-20260920/build-oh-my-pi`; Exits 0 and builds the selected runtime.
- [ ] Re-run `node scripts/check-commits.mjs 4458fbf21e199dad45376b8164f78c2165ac1d20..86797b66f492ec38a8c33d33be9aeff54ad0c9ba`; Exits 0 with all branch subjects accepted.
- [ ] Re-decide **A4**: Primary fresh full-flow success; 05-plan-iterate-evidence.md:165; claimed: yes. Expected: Fresh final recording proves initial0 then one Add activation1 then Reset0; required findings resolved and passed/success.
- [ ] Re-decide **A9**: Zero allowance end-to-end inspection-only scenario; 05-plan-iterate-evidence.md:284; 08-implementation-iterate-evidence.md:38; claimed: yes. Expected: Fresh inspection with0/0 allowance, no repair/reservation or unauthorized changes; failed/exhaustion and open finding.
- [ ] Re-decide **A12**: Recorder and Atomic source boundaries; 05-plan-iterate-evidence.md:59,240,269; 06-implementation-iterate-evidence.md:28; claimed: yes. Expected: No recorder/Atomic modification or new scheduled/controller stage; only seven live cases, no broad-runtime claim.
- [ ] Re-decide **A14**: Stable state and stop-order contract; 05-plan-iterate-evidence.md:94-100; claimed: yes. Expected: Single receipt, stable IDs, append-preserved histories and verified-resolution progress; success,blocker,no-progress,exhaustion precedence.
- [ ] Re-decide **A15**: Temporal and source-provenance limits; 05-plan-iterate-evidence.md:102-104; claimed: yes. Expected: Instructions require actual served identity and recorded pixels; static samples cannot prove temporal absence/persistence; preserve raw/render offsets,gaps,panes,tails and guardrail limitations.
- [ ] Re-decide **A16**: Discovery and artifact-first terminal contract; 05-plan-iterate-evidence.md:88,106-112; claimed: yes. Expected: Independent authorized invocation, repository dependency closure, new artifact and terminal answer without scheduling next skill.
- [ ] Re-decide **A17**: Existing baseline and non-Git input contract; 05-plan-iterate-evidence.md:93; claimed: yes. Expected: Existing receipt continues; baseline reuse requires accessible matching source/environment/media/coverage; non-Git artifacts supported without false commit.
- [ ] Re-decide **T4**: evals/iterate-evidence.mjs. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T6**: evals/scenarios/iterate-evidence.mjs. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T7**: evals/scenarios/iterate-evidence-viewer-blocked.mjs. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T8**: evals/scenarios/iterate-evidence-label-disagreement.mjs. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T9**: evals/scenarios/iterate-evidence-zero-limit.mjs. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T10**: evals/scenarios/iterate-evidence-no-progress.mjs. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T11**: evals/scenarios/iterate-evidence-three-rounds.mjs. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T12**: evals/scenarios/iterate-evidence-continuation.mjs. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T13**: evals/fixtures/iterate-evidence/app.js. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T14**: evals/fixtures/iterate-evidence/capture.mjs. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T15**: evals/fixtures/iterate-evidence/check.mjs. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T16**: evals/fixtures/iterate-evidence/index.html. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T17**: evals/fixtures/iterate-evidence/server.mjs. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T18**: evals/fixtures/iterate-evidence/spec.md. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T19**: evals/fixtures/iterate-evidence-three-rounds/app.js. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T20**: evals/fixtures/iterate-evidence-three-rounds/capture.mjs. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T21**: evals/fixtures/iterate-evidence-three-rounds/check.mjs. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T22**: evals/fixtures/iterate-evidence-three-rounds/index.html. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.
- [ ] Re-decide **T23**: evals/fixtures/iterate-evidence-three-rounds/spec.md. Expected: The change keeps this check's strength and rejects violations of its declared acceptance contract.

### Known limits

- Helper returned `unclear` for `A12`, `A14`, `A15`, `A16`, `A17`, `T4`, `T6`, `T7`, `T11`, `T12`, `T13`, `T14`, `T15`, `T16`, `T17`, `T18`, `T19`, `T20`, `T21`, `T22`, `T23`. T4/T6 are hand-failed from missing primary checks; other unclear rows hand-pass within their explicit source/static scope. Intentional seeded faults and initial weak checks are plan inputs, not weakened final acceptance. Each hand item has a review checkbox.
- The seven selected scenarios prove only these recorded static desktop cases. No additional live native/device, responsive, temporal/flicker, persistence, media-instruction injection, invalid/extended allowance, non-Git, remote/deployment, upload/playback or Atomic-controller behavior was exercised. Those remaining written-contract risks were inspected for consistency as required by the bounded plan; no broad runtime readiness is claimed.
- Primary capture's missing initialzero remains a real unmet criterion; root cause is unproven. Zero-limit temporary-file attribution is strongly supported by matching viewer payload hashes but remains an inference about reader internals. No retries or exceptions were added.
- Several recorder manifests omit optional commit/branch/environment labels; capture response hashes, source snapshots and receipt revision ledgers supply identity instead. Sparse image samples cannot establish absence between samples.
- Historical intermediate receipt prose sometimes remains under old current-summary headings. Complete later histories/frontmatter establish the final state; old failed/pending observations were not erased. No unresolved final broken-spec link was found in no-progress.
- Evidence is local and ignored, not committed or published. Another machine needs these retained directories to reproduce saved grading and inspect the movies. This artifact identifies them explicitly; Git alone does not transport them.
- Tree was clean at verification start; no product/config/test edits were made. Only this artifact is committed, with normal hooks. The next implementation/review/PR phase was not started.
