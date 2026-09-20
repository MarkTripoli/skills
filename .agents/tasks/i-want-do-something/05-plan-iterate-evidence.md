---
task: i-want-do-something
type: plan
summary: "Implement iterate-evidence as an independently installed instruction skill composing the unchanged recorder. Three phases preserve exactly seven live scenarios: primary repair, viewer blocked, label disagreement, no progress, zero limit, three rounds, and continuation. This plan fixes narrow runner edits, file ownership, retained pixel evidence, and commands using inspected OMP 18.1.22 flags and versioned tool-policy sources. Only this plan is delivered here; implementation and live verification remain parent-owned fresh sessions."
repo: skills
branch: i-want-do-something
sha: 258f28d01ce5c1db3dfe7708a904375955fc1dfc
---

# Iterate Evidence Implementation Plan

## Overview

Ship one instruction skill, four references, selected-install support, and seven focused live browser scenarios. Preserve the three phases from [the approved outline](04-structure-outline-iterate-evidence.md), including its committed scope correction. Its detailed acceptance obligations remain binding.

[task.md](task.md) authorizes the parent’s full chain with `gates: none`. This session writes and commits only the plan. Later implementation, independent verification, review/repair, and PR description remain separate parent-owned sessions; nothing here starts them.

## Current State Analysis

### Key Discoveries:

- `record-evidence/SKILL.md:28-60,110-117` already provides external-video import, frame extraction, rerendering, and timing caveats. Its own terminal routing differs from this companion and must remain unchanged.
- `scripts/install.mjs:32-39,181-216` computes dependency closure and separately tracks requested uninstall ownership. Add one dependency entry, not new ownership machinery. `tests/install.test.mjs:224-261` is the isolated selected-consumer precedent.
- `scripts/validate.mjs:19,36-94,350-358` owns the current 43-skill count and terminal-answer registrations. `workflows/delivery.md:138-177` owns discovery coverage, not automatic scheduling.
- `evals/run.mjs` currently copies CLI fixtures/workers, builds every skill, launches `--no-session`, treats stdout as the answer, requires a handoff, forbids source edits, and disallows existing-receipt updates. Its saved-run grader reconstructs the original fixture, not repaired source (`69-105,125-151,186-220,239-341,356-370`).

### Verified OMP launch and trace controls

Planning inspection ran `omp --help`, `omp config --help`, and `omp config list --json`. Installed executable: `/opt/homebrew/Cellar/omp/18.1.22/bin/omp`. No model session, browser run, build, formatter, linter, or test was started.

The installed help supports `-p`, `--mode json`, `--session-dir`, `--config`, `--tools`, `--no-extensions`, explicit `--extension`, `--no-skills`, `--no-rules`, `--no-lsp`, `--no-title`, `--max-time`, and `--model`. Do not invent `--trace`, `--deny-tool`, or a video-viewing flag.

Use this launch shape from the scratch fixture directory; the runner supplies absolute `OUT`, `PROMPT`, and the caller-selected model when present:

```sh
omp -p --auto-approve --mode json --session-dir "$OUT/sessions" \
  --no-extensions --no-skills --no-rules --no-lsp --no-title \
  --extension "$PINNED/evals/iterate-evidence-hooks.mjs" \
  --max-time=25m "$PROMPT"
```

Omit `--no-session` for this family. Explicit extensions still load with `--no-extensions`; disable discovery to avoid unrelated installed tools/skills. The prompt explicitly reads the selected installed skill and pinned local guides, rather than relying on discovery.

Version-matched upstream sources establish the event and policy contracts:

- [Print mode, `printableEvent` and `runPrintMode`](https://github.com/can1357/oh-my-pi/blob/v18.1.22/packages/coding-agent/src/modes/print-mode.ts): JSON mode emits a session header and ordered events. `message_end` retains authoritative messages, including tool results; `agent_end` retains messages. Only incremental snapshots and opaque provider replay payloads are stripped. Stream stdout directly to `trace.jsonl`; do not accumulate media-bearing events in the current unbounded stdout string. Extract the terminal assistant’s text blocks into `answer.md`, excluding tool-call turns and thinking. Preserve malformed/truncated traces as failures, not repaired JSON.
- [Extension API](https://github.com/can1357/oh-my-pi/blob/v18.1.22/docs/extensions.md#tool-lifecycle): `pi.on("tool_call", ...)`, `event.toolName`, `event.input`, and `{ block: true, reason: ... }` are supported. Tool execution events provide observation points. Use these only for evidence snapshots, explicit fault isolation, and denial; never to choose repairs or supply findings.
- [Approval policy](https://github.com/can1357/oh-my-pi/blob/v18.1.22/docs/approval-mode.md#user-overrides): `tools.approval.read: deny` denies even under `--auto-approve`. Tool policy is not filesystem/process containment.
- [Read implementation](https://github.com/can1357/oh-my-pi/blob/v18.1.22/packages/coding-agent/src/tools/read.ts): `?q=` can call a separate vision model. Disabling terminal images or omitting a browser tool alone does not disable viewing.

`--session-dir` and the complete JSON stream retain complementary evidence. Save image content and referenced local/session artifacts, not only event names. A successful image-opening trace still needs an independent reviewer’s pixel observation. These are verified command/source contracts, not a claim that this live configuration has passed.

## Desired End State

An authorized caller can capture, inspect recorded pixels, repair evidenced defects, and verify fresh recordings within a recorded allowance. One append-only numbered receipt owns findings, revision identities, coverage, rounds, and the stop decision. Installation selects only the companion and recorder, without Atomic. All seven live cases retain enough source, trace, and media evidence for independent review and saved-only regrading.

## What We're NOT Doing

No changes to `atomic/`, recorder instructions/scripts/schema/defaults/routing, or existing ownership semantics. No new installed worker, diagnosis helper, repair controller, media engine, generic scenario framework, adapter registry, or service. No speculative scenario variants for native devices, hidden-state services, temporal animation, publishing, or every runtime. Those instruction contracts remain review obligations, not additional live deliverables.

## Execution Strategy

Phase 1 precedes Phases 2 and 3. Phase 2 and Phase 3 scenario files can be authored independently after Phase 1’s evidence support exists. Complete and report phases in outline order.

| Implementation owner | Exclusive files | Shared contract |
| --- | --- | --- |
| Skill author | `skills/delivery/iterate-evidence/**` | Receipt fields and stop rules below; no runtime code |
| Harness author | `evals/run.mjs`, `evals/iterate-evidence.mjs`, `evals/iterate-evidence-hooks.mjs`, `evals/fixtures/iterate-evidence/**`, primary scenario, focused harness regression test if needed | Installed paths, saved JSON events/media, exact fixture edit allowlist; no diagnosis or repair loop |
| Integration owner | `scripts/install.mjs`, `scripts/validate.mjs`, `tests/install.test.mjs`, discovery docs, changeset, generated resources | Integrate after sibling edits; run shared checks once on the coherent tree |
| Later proof authors | Phase 2’s two scenario modules; Phase 3’s four scenario modules | Reuse Phase 1’s fixture/capture/retention support; coordinate shared-helper or instruction corrections with their owner |

These are file boundaries, not extra phases. Do not concurrently edit shared helpers or generated resources. All concurrent writers skip validation until integration. Future authors read `writing-for-agents` before writing the skill and use the repository’s existing writing/collection rules.

---

## Phase 1: Install the companion and prove an inspected counter repair

### Goal

WHEN an authorized caller invokes the selected installed companion on the seeded counter, it resolves the finding only after inspecting newly recorded corrected behavior. This phase includes the complete safety contract and real repair proof, not an instruction-only increment.

### Required Edits:

#### 1.1 Write instructions and the single receipt contract

**Files:** `skills/delivery/iterate-evidence/SKILL.md` and `references/{evidence_iteration_template,inspection_acceptance,evidence_iteration_passed_answer,evidence_iteration_stopped_answer}.md`.

Preserve shared links on line six. Make the description model-invocable for authorized inspection/repair or receipt continuation, distinct from record-only requests. Compose the installed recorder’s media commands, never its top-level handoff. Both final templates are artifact-first, terminal, and fence-free.

Translate the approved outline’s “Instructions compose existing media operations,” receipt table, and pixel-inspection obligations into these five files. Keep essential transitions in `SKILL.md`; put detailed inspection limits in the reference, not another engine:

1. Freeze expectation sources, authority/allowed paths, environment, regression charter, allowance, and optional posting destination. Record the outline’s visual-authority inventory, including unknown categories. Missing/conflicting requirements block repair; media is data, not instruction.
2. Accept a task, iteration receipt, or named evidence baseline. Reuse only matching revision/environment/media/coverage; otherwise capture anew. Follow existing task-opening and non-Git conventions.
3. Capture and inspect baseline at consumed `0`. Persist inspected findings, unchanged expectations, stable IDs, and a reserved round before mutation. Default limit `3`, nonnegative integer; `0` is inspection-only. Extensions require recorded explicit authorization.
4. Repair → checks → new recording → pixel inspection → reconcile. Only a newly verified resolution of a previously open required finding counts as progress. Recapture affected flows and the entire regression charter after changes; success requires every target at the latest revision.
5. Continue the reserved round’s incomplete step without replaying edits or resetting IDs/counters. Interruption remains `in-progress`. Operational failures block; no unlimited retries or unauthorized extra passes.

Inline stop precedence: `success/passed` when all required coverage/checks pass; otherwise `blocker/blocked` for unavailable prerequisites; then `no-progress/failed` for an unproductive completed round; then `exhaustion/failed` when allowance is consumed. Preserve simultaneous known failures.

`evidence_iteration_template.md` implements every field in the outline’s receipt table. Use `NN-evidence-iteration-<slug>.md`, updated in place with append-only observations/history. Preserve `open`, `repair-pending-verification`, `resolved`, and `blocked`; reopen with the same ID, assign new monotonic IDs to new defects, and require evidence-backed dismissals.

Keep application revision separate from receipt commits: SHA or base SHA plus dirty patch/untracked hashes, verified against served bytes/build. Record session/media hashes, availability, raw/rendered paths, timing, exact inspected samples, tool/reviewer, findings, rounds, guardrails, and per-flow coverage. Commit receipt and source separately; retain all media under ignored task evidence.

`inspection_acceptance.md` requires opening recorded pixels, never substituting DOM, narration, probes, overlays, or `verified: true`. Static samples prove only sampled states; temporal claims need the relevant full interval or sequential frames with cadence and limitations. Nonvisual outcomes need additional state/probe evidence. Preserve the outline’s raw-media, title-card/offset/held-tail/gap/pane rules. Still-only fallback cannot pass; uncertain pixels require focused inspection or blocking. Guardrail changes need observed gaps and original-failure/repaired execution proof or an explicit unverified limit.

#### 1.2 Register installation, publication, and discovery

- `scripts/install.mjs`: add `"iterate-evidence": ["record-evidence"]` to `SKILL_DEPENDENCIES`; leave `removeNames: requestedNames` unchanged.
- `scripts/validate.mjs`: increment expected inventory to 44, register both new answer files as `TERMINAL_ANSWER`. Do not add handoff exceptions or exempt the skill from workflow coverage.
- `tests/install.test.mjs`: extend the selected-consumer pattern with isolated home/project destinations outside this checkout. Prove only the two selected resources are installed, all companion references and recorder entry are readable, unrelated sentinel/task state survives, and no Atomic tree appears. Selected uninstall removes only the companion and preserves the recorder, including an independently installed recorder. Use existing `install`, `uninstall`, and `tmpdir` helpers.
- Update `workflows/delivery.md` independent-use prose and phase-table row (`evidence-iteration`, no human gate, independent authorized loop), `docs/getting-started.md`, `docs/cheatsheet.md`, and `docs/testing.md` together. README has no skill inventory: add only a short independent-use pointer, not a new catalog. Document the selected repository-installer command, since generic skills copying does not promise dependency closure.
- Add `.changeset/iterate-evidence.md` for `@marktripoli/skills`. Regenerate publication resources with `node scripts/sync-plugin.mjs`; never edit generated copies by hand.

#### 1.3 Add a tiny counter fixture and reuse browser recording

**Files:** `evals/fixtures/iterate-evidence/` with `index.html`, `app.js`, `spec.md`, `check.mjs`, and a small `server.mjs`; `evals/scenarios/iterate-evidence.mjs`.

Serve on an owned allocated loopback port with caching disabled and a fixed 1280×720 viewport. Show count, **Add one**, and **Reset**. Seed only the handler’s `+2` defect. Pin separate cases: activation from zero gives `1`; Reset from nonzero gives `0`. Initial browser check exercises Add one but only verifies a positive count.

Define the new fixture commands as `node server.mjs` (prints its allocated URL) and `node check.mjs URL` (checks that served app). Give the subject commands, flows, specification, and allowed paths, not diagnosis or patch.

Reuse Playwright `recordVideo` from `record-evidence/references/device_setup.md:75-118`. Install Playwright beside the ignored recording script. Execute a byte-identical copy of the subject’s `check.mjs` there so Node resolves that same browser dependency; retain its source hash. A fixed-flow capture entry performs real clicks and returns paths/timing, never findings or repairs. The subject owns recording, inspection, diagnosis, repair, and stopping.

Reuse `evidence.py start --source external`, `annotate`, `stop --video`, and `frames`; preserve `video-started-at`, close the recording context, and allocate distinct baseline/post-repair sessions. Only `app.js` and `check.mjs` are repairable. Pin task/specification/server/capture code and save served script bytes/hash with each source identity.

#### 1.4 Make only the runner exceptions this family consumes

**Files:** `evals/run.mjs`, one family helper `evals/iterate-evidence.mjs`, and one narrowly scoped OMP observation/fault extension `evals/iterate-evidence-hooks.mjs`.

Use existing scenario fields (`slug`, `fixtures`, `request`, `phases`, `skill`, `artifactType`, `template`, `check`). Select the special execution path only for this companion family; do not add a generic runner lifecycle or adapter API. Existing document scenarios keep their current defaults.

| Existing location | Minimal change |
| --- | --- |
| `snapshotSources`, run setup | Pin installer source plus `scripts/lib`, canonical skills, runtime adapters, shared guides, package/lock files, and this family’s helper/extension before execution. Resolve installer dependencies within that snapshot using `npm ci --omit=dev --ignore-scripts`; do not import build code from the mutable host. For evidence-only runs, do not build the full OMP skill tree. |
| `prepareRepo`, `copyFixtures` | This family uses the counter fixture without the unrelated `repo-cli` overlay or full worker tree. Run the pinned installer with `oh-my-pi --skill iterate-evidence --project --yes` from scratch project/home. Retain inventory, sentinel, installation output, installed bytes, and no-Atomic checks. Invoke `.omp/skills/iterate-evidence/SKILL.md`. |
| `runOmp` | For this family, use the verified JSON/session launch above. Stream trace/stderr to files; retain session artifacts and image payloads. Extract final answer separately. Preserve current text/ephemeral behavior for document scenarios. |
| `commonChecks`, `headArtifactCommitProblems` | Companion answers must link the receipt and have no handoff fence. Keep frontmatter/placeholder/task protection and artifact-only receipt commits. Check all changed paths and commit history, not only final diff, against exact scenario source/check allowlists and ignored evidence paths. Reject mixed source/receipt commits. Only continuation may update its explicitly named receipt, preserving prior history. |
| `runScenario`, family extension | Retain receipt/source snapshots before mutation and after completed tool calls, with ordered trace references. Observe all mutation-capable tools, including shell commands; a final snapshot alone cannot prove pre-edit persistence. Keep base/repair patches, untracked source hashes, served identities, check outputs, videos, frames, manifests, installed resources, and runtime/model metadata under the result directory even on success. |
| `gradeScenario` | This family regrades saved receipt versions, source states, exit codes, traces, media, and independent inspection notes. Never reconstruct only the original faulty fixture or consult current host source. Missing required material blocks/fails acceptance; `--grade` is not execution and does not fabricate review evidence. |

Pin evidence provenance by hash and copied paths. Keep the exact original strengthened-check input: run the agent-authored strengthened `check.mjs` against a preserved faulty-source server and the repaired server, retaining exit code/stdout/stderr for each. The helper executes the supplied check, not a second diagnosis algorithm. Require failure against the faulty source and pass against repaired source; reject weakened expectations/spec changes.

The independent evaluating agent opens retained media after the subject finishes. Save its observed values, exact frame/video timestamps, hashes, and subject trace entries in the run’s review notes. Do not grade semantic success from receipt prose, event presence, filenames, or overlay labels alone. Automated checks may report pending independent inspection; the live acceptance cannot pass until that review exists.

Only add a focused offline harness test where a plausible regression warrants it: strict document defaults versus companion exceptions, forbidden source/spec writes, or missing/truncated trace evidence. Use Node’s existing `node:test` conventions; do not assert prose or duplicate the instruction loop. If needed, place this in `tests/evals.test.mjs` and exercise the family helper with temporary saved evidence.

### Success Criteria:

#### Automated Verification:

Run these during implementation, not during planning:

```sh
node --test tests/install.test.mjs
node scripts/sync-plugin.mjs
node scripts/sync-plugin.mjs --check
npm test
npm run evals -- iterate-evidence --keep --max-time 25
npm run evals -- iterate-evidence --grade evals/results/latest
```

- [x] Isolated selected installation preserves unrelated resources and dependency ownership; offline checks pass.
- [x] Live baseline shows `2`; subject pixel-opening trace precedes persisted `IE-001` and round reservation, which precede source mutation.
- [x] Agent-authored source/check changes retain unchanged specification; the strengthened check fails against preserved defective source and passes after repair.
- [x] Distinct fresh recorded sessions/hashes and independent pixel review show increment `1` and Reset `0` at the repaired served identity. Final required coverage passes.
- [x] Saved regrade uses retained repair evidence and cannot pass when required inspection evidence is missing.

human-gated: false

**Required executing-agent review:** Open baseline and post-repair footage/frames and record `2`, `1`, and Reset `0` with timestamps in the retained run review. This is mandatory live proof, not deferred human approval. Record unavailable provider, image support, Chromium/Playwright, Python, ffmpeg/ffprobe, or recorder overlay prerequisites as explicit blockers. Preserve successful and failed media with `--keep`.

**Phase 1 execution evidence:** [06-implementation-iterate-evidence.md](06-implementation-iterate-evidence.md) records code commit `f3ce9d8`, 15 passing installer tests, 138 passing aggregate tests, and retained run `evals/results/20260920-051455/`. The live command exited `1` solely for pending independent review; after the executing agent opened the retained frames and video samples, saved grading passed `1/1`. Removing `review.json` failed grading; restoring the identical review passed. Exact commands, hashes, trace/snapshot order, timing limits, and compatible runner adjustments are in the receipt and retained review. Phases 2 and 3 remain unstarted.

---

## Phase 2: Prove unavailable or contradictory evidence cannot pass

### Goal

IF viewing is unavailable or pixels contradict success metadata, the companion withholds success without changing expectations or making unsupported repairs.

### Required Edits:

Add only `evals/scenarios/iterate-evidence-viewer-blocked.mjs` and `evals/scenarios/iterate-evidence-label-disagreement.mjs`. Reuse Phase 1’s fixture and support. Correct instructions only for evidence-backed gaps; do not modify the recorder.

#### 2.1 Deny viewing through supported controls

For `viewer-blocked`, keep browser capture usable through the fixed Playwright capture entry. Start a fresh isolated OMP configuration, retaining its effective capability inventory and the overlay file. Add these supported flags:

```sh
--tools read,grep,glob,write,bash,todo --config "$OUT/viewer-blocked.yml"
```

The overlay uses verified keys:

```yaml
tools:
  approval:
    read: deny
    eval: deny
    task: deny
  xdev: false
eval:
  py: false
  js: false
browser:
  enabled: false
computer:
  enabled: false
images:
  blockImages: true
  describeForTextModels: false
mcp:
  enableProjectConfig: false
```

Use the isolated profile/home with no external MCP/custom tools; do not mutate global settings or copy credentials into retained evidence. Supply configured provider access through the caller’s supported authentication arrangement. A missing authenticated isolated setup is an acceptance blocker, not a successful denied-view case.

Denying `read` deliberately also denies textual reads. Let the subject read installed instructions/specification through permitted text-only reads instead. The existing family extension must restrict this case’s shell to exact predeclared text-read, fixed capture/finalization, and receipt-only Git commands. Restrict `write` to the named receipt. Block other tools and alternate shell/eval/model-launch routes; no arbitrary scripts, outbound vision requests, or image-returning extensions. Keep the fixed capture script immutable. This finite fault boundary is not a shell sandbox or a new command framework.

Have the subject capture the real Add one flow and attempt opening a recorded frame/video with `read`. Retain the real denied tool result, reachable video, and absence of source/check mutations. The subject must conclude `blocked/blocker`, with untested inspection coverage. The evaluator can inspect the video afterward but must never feed its view into the blocked subject session. If tool inventory or trace shows another viewing route remained available, the scenario setup is blocked, not passed.

#### 2.2 Inject misleading labels, not a finding

For `label-disagreement`, use real defective browser footage and the recorder’s existing `annotate SESSION --type assertion --result passed --message ...`. Disclose this injection in evaluator setup records, not as diagnosis in the subject prompt. Finalize through the unchanged recorder, retain its standalone output/schema, and supply a valid external evidence baseline plus limit `0` to a fresh companion invocation.

The subject opens accessible media and records the visible `2` against specification `1`, retaining a stable finding and failed flow. Expected outcome: `failed/exhaustion`, consumed `0`, unchanged source/checks/specification, and unchanged passed labels. Keep raw footage available if the overlay covers the count. This also proves valid external-baseline reuse without trusting metadata.

### Success Criteria:

#### Automated Verification:

```sh
npm run evals -- iterate-evidence-viewer-blocked iterate-evidence-label-disagreement --keep --max-time 25
npm test
```

- [x] Blocked case contains an actual denied opening attempt after real capture, no usable alternative subject viewer, `blocked/blocker`, and no source mutation.
- [x] Disagreement case contains a pixel-opening trace, independently observed `2`, preserved passed metadata, failed flow, and `failed/exhaustion` at zero allowance.
- [x] Recorder source/routing/schema remain unchanged. Missing setup evidence cannot be accepted as the expected non-success branch.

human-gated: false

**Required executing-agent review:** Inspect the denial trace and capability restrictions, then independently open the disagreement footage and compare pixels with retained labels. Record observations in each retained run, not only a process exit code.

**Phase 2 execution evidence:** [07-implementation-iterate-evidence.md](07-implementation-iterate-evidence.md) records code commit `05ae6eb`, 140 passing offline tests, and accepted evidence under `evals/results/20260920-054114/`. Both live subjects exited 0; original runner output retains pending-review and denial-boundary grading failures. The executing agent inspected the denial/capability records and independently opened disagreement frames/video, then saved grading passed `2/2` with the evidence-backed boundary correction. Negative controls reject missing review, mismatched image-result identity, and missing effective restrictions; restoring identical evidence passes. Initial diagnostic run `evals/results/20260920-053803/` remains retained and is not the accepted proof. Phase 3 remains unstarted.

---

## Phase 3: Prove bounded progress and continuation retain history

### Goal

WHILE required defects remain, the companion stops at the authorized progress/round boundary without erasing findings or consumed work.

### Required Edits:

Add the four exact scenario modules below. Reuse Phase 1’s support; only `three-rounds` needs the four-counter fixture variant. Each case executes the installed instruction skill; setup helpers cannot decide findings, repair source, reconcile progress, or generate the subject receipt.

| Scenario module under `evals/scenarios/` | Setup and actual execution | Required evidence and decision |
| --- | --- | --- |
| `iterate-evidence-no-progress.mjs` | Parent-delegated repair with one disclosed, deliberately ineffective worker action: a real worker edits an unused increment setting, leaving the served handler defective. Persist inspected baseline and reservation before delegation. Use a real OMP worker/tool trace, not a fabricated worker result. Worker fault instructions contain only that bounded edit; they cannot change expectations or close findings. The companion serves the changed identity and records/inspects again. | Both videos and source snapshots show the attempted edit and continuing `2`. Same finding remains open, consumed round is recorded, no required finding resolves. `failed/no-progress` wins before exhaustion; no second repair. |
| `iterate-evidence-zero-limit.mjs` | Fresh defective counter, ordinary truthful narration, explicit limit `0`. Subject captures and inspects for itself. | Failed coverage and stable finding; `failed/exhaustion`, consumed `0`; source and checks byte-identical. No misleading-label injection. |
| `iterate-evidence-three-rounds.mjs` | Four independent visible counters A-D, each specified to increment one and reset zero. Require one finding repaired per round in A-D order; leave limit unspecified. Baseline and every subsequent capture cover all four target flows and Reset. | Baseline visibly establishes four defects. Rounds 1-3 each resolve one required finding through new inspected media. D remains failed at consumed `3`; `failed/exhaustion`, no fourth reservation, mutation, or capture pass. No-progress cannot substitute for this productive-round boundary. |
| `iterate-evidence-continuation.mjs` | Use the primary real repair until source/check work completes and the reserved round awaits capture. Pause the fixture’s own capture entry before that post-repair capture. Confirm the receipt reservation and source edit from trace/snapshots, then terminate only the owned subject process. Preserve source/receipt and release the pause. Start a fresh OMP invocation naming that receipt, not `--resume` of old conversation. | Keep both session traces and boundary snapshots. Resume completes the existing round against repaired served identity; `IE-001`, earlier observations, and consumed count survive. No source edit replay or new reservation for the same work. Resolution occurs only after new inspected pixels; report a resume failure rather than synthesizing completion. |

The continuation hook only pauses a capture operation and lets the harness terminate its owned process at an observed boundary. It does not implement product state transitions or recovery. Keep interruption evidence even when the first process has an expected nonzero exit; only the later validated continuation can establish completion.

Only these seven names are live acceptance scope, including Phase 1 and Phase 2. Review the remaining identity, authority, temporal-inspection, and history rules statically for consistency; do not add scenario variants to claim broader runtime coverage.

### Success Criteria:

#### Automated Verification:

```sh
npm run evals -- iterate-evidence-no-progress iterate-evidence-zero-limit iterate-evidence-three-rounds iterate-evidence-continuation --keep --max-time 25
npm test
npm run evals -- iterate-evidence-no-progress iterate-evidence-zero-limit iterate-evidence-three-rounds iterate-evidence-continuation --grade evals/results/latest
```

Retain each phase’s explicit result directory in the implementation receipt and regrade those directories separately. Missing names are skipped by the existing runner; skipped names never count toward the seven live acceptances.

- [ ] Ineffective repair stops after one unproductive round, retaining the original finding and failed pixels.
- [ ] Zero allowance preserves source/checks and consumes no round despite an inspected defect.
- [ ] Default allowance permits exactly three productive rounds; retained baseline plus three passes show D still failing and no fourth attempt.
- [ ] A fresh continuation session completes the reserved round without replay, ID loss, history replacement, or counter reset.

human-gated: false

**Required executing-agent review:** Open no-progress post-repair footage, the zero-limit baseline, all four bounded-case passes, and resumed footage. Compare actual resolved sets, remaining D, source histories, and both continuation traces. Save exact observations and limitations in the retained results. Neither automated grading nor `npm test` substitutes for this review.

## Human Review

### Review targets

- Three original phase boundaries and exactly seven scenarios; complete Phase 1 safety contract and inspected repair proof.
- Narrow runner exceptions, immutable expectations, separate source/receipt commits, selected installation ownership, and saved-only evidence grading.
- Real viewing denial, independent pixel review, productive-round exhaustion, and interruption without an added repair controller.

### Verify

- [x] Plan preserves the approved three phases and seven scenarios, names concrete file ownership and future verification commands, and grounds OMP trace/denial controls in installed help plus version-matched sources.

### Known limits

- CLI/configuration and source inspection only. No implementation, live session, browser proof, formatter, linter, build, or test ran during planning; execution must prove capture, denial, image retention, and all seven behaviors. Normal commit hooks remain enabled.
