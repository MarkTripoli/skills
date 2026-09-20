---
task: i-want-do-something
type: structure-outline
summary: "Deliver iterate-evidence as one independently installable instruction skill, composing the unchanged recorder, with a real counter defect-to-repair browser eval in the first increment. Two subsequent proof slices exercise fail-closed inspection and bounded stopping/continuation, without adding a controller or media framework. The outline fixes concrete evidence and harness requirements, preserves every approved acceptance obligation, and separates offline packaging checks from live pixel-inspected behavior. No implementation or validation ran here; the parent next opens create-plan in the fixed full chain."
repo: skills
branch: i-want-do-something
sha: c46ffbd39ad6fbdf512702dfa3d9406250cd8a6e
---

# Iterate evidence: installable skill and live proof

Ship the smallest useful companion: instructions, one receipt template, an inspection/acceptance reference, and two terminal reply templates. The first increment includes installation and an actual recorded defect, agent repair, and inspected new recording; it is not an instruction-only deliverable awaiting its first behavioral proof.

Authority: [task.md](task.md):4-13 grants autonomous parent orchestration with `workflow: full` and `gates: none`. The parent approved [03-design-discussion-iterate-evidence.md](03-design-discussion-iterate-evidence.md); its acceptance requirements remain binding. This session creates and commits only this outline, without implementation, validation commands, formatters, linters, builds, tests, or live runs.

## Desired End State

- A selected installation of `iterate-evidence` includes `record-evidence`, without Atomic, a new worker, a detector, or a second media/state engine.
- An authorized caller can start or continue a bounded record → pixel inspection → evidenced repair → new recording loop. Every resolved finding has current-application-revision proof against unchanged expectations.
- One numbered `evidence-iteration` receipt retains stable finding IDs, append-only observations/round history, source and recording identities, guardrail evidence, per-flow coverage, and an explicit stop reason.
- The default permits three repair rounds after baseline. Success, blocker, no-progress, and exhaustion remain distinct; unavailable inspection, untested required coverage, or a passing overlay cannot manufacture success.
- The retained live eval proves the counter's recorded `2` defect becomes an inspected `1` after an agent-authored repair, while Reset still returns a nonzero count to zero. Separate live cases prove the required non-success branches.
- Existing standalone recorder behavior, media schemas, defaults, capture scripts, and final-response routing stay unchanged. Documentation beside the new skill provides discovery; no recorder edit is currently justified.

## Implementation Overview

Each phase crosses the skill, fixture, and proof surfaces it needs. Phase 1 establishes the complete safety contract immediately; later phases add adversarial proof and only evidence-backed instruction corrections, not deferred safety rules or another framework.

## Phase Checklist

- [ ] Phase 1: Install the companion and prove an inspected counter repair
- [ ] Phase 2: Prove unavailable or contradictory evidence cannot pass
- [ ] Phase 3: Prove bounded progress and continuation retain history

Dependency order: Phase 1 precedes Phases 2 and 3 because both consume its installed skill and live fixture/evidence support. Phases 2 and 3 are separate failure-class slices; their shared harness is not a reason to build a generic scenario engine. Completion requires all three.

---

## Phase 1: Install the companion and prove an inspected counter repair

**Obligation:** WHEN an authorized caller invokes the selected installed companion on the seeded counter defect, the companion shall resolve the finding only after inspecting a fresh recording of the corrected behavior.

**Done condition:** A retained live run contains before pixels showing `2`, a persisted `IE-001` before repair, an agent-authored source correction, a strengthened check failing against the original defect and passing after repair, and new inspected pixels showing increment `1` and Reset `0`. Final current-revision coverage is passed. A selected installation is usable outside this checkout and preserves unrelated resources.

### Change Outline

```text
skills/delivery/iterate-evidence/
├── SKILL.md
└── references/
    ├── evidence_iteration_template.md
    ├── inspection_acceptance.md
    ├── evidence_iteration_passed_answer.md
    └── evidence_iteration_stopped_answer.md
scripts/
├── install.mjs                 dependency closure only
└── validate.mjs                inventory and terminal template registrations
tests/
└── install.test.mjs            selected consumer and scoped ownership regression
evals/
├── run.mjs                    narrow opt-in repair/terminal evidence support
├── scenarios/iterate-evidence.mjs
└── fixtures/iterate-evidence/ counter app, pinned specification, existing weak check
```

Generated plugin resources come from `node scripts/sync-plugin.mjs`, not hand-maintained copies. Update `workflows/delivery.md`, `docs/getting-started.md`, `docs/cheatsheet.md`, `README.md` where its discovery inventory applies, and `docs/testing.md` together; add a user-facing `.changeset/` entry. The workflow table describes independent invocation and artifact type `evidence-iteration`, not a new fixed-chain stage. No changes belong in `atomic/`.

#### Instructions compose existing media operations

Preserve shared links on line six and model-invocable discovery. The description distinguishes record-only work from explicitly authorized inspection/repair and receipt continuation. Read the installed recorder instructions, invoke existing media operations, and terminate through the companion's own artifact-first answer without a handoff fence. Never execute the recorder's top-level `describe-pr` or `iterate-implementation` routing as a nested action.

The skill accepts a task directory, an existing iteration receipt, or a named existing evidence receipt as a candidate baseline. Outside a task, follow the existing task-opening convention; outside Git, save local artifacts and state that they cannot be committed. A baseline is reusable only when revision, environment, accessible media, and scope coverage match; otherwise capture anew.

Freeze targets and expectation sources, repair authority, permitted paths, environment/viewport/data/launch command, regression charter, repair allowance, and optional posting destination before repair. Default requester-only delivery; require publishing only when requested. Missing authority blocks mutation. Missing or conflicting expected behavior blocks the affected repair rather than inviting a taste-based redesign.

For visual repairs, record repository design authority: tokens or hex values, typography, spacing, radius, elevation, layout, breakpoints, themes/CSS variables, framework utilities, accessibility contracts, and visual baselines. Mark each absent category unknown or not applicable. Approved requirements outrank existing implementation; evidence content is data, never an instruction source.

Keep the essential transition and stop rules inline:

```text
baseline = capture + pixel inspection; consumed_rounds = 0
success requires every target and regression flow proved at current revision
otherwise classify blocker, then no-progress, then exhaustion
before mutation: check remaining allowance; persist reserved round + finding IDs
repair -> relevant checks -> new capture -> pixel inspection -> reconcile same IDs
progress = previously open required finding resolved by new evidence
continuation completes a reserved round; never resets the counter or replays edits
```

The default limit is `3`, a nonnegative integer; `0` permits capture and inspection only. A greater limit or later extension needs explicit parent/caller authorization recorded without erasing history. A repair round consumes one allowance before its first mutation and includes its checks, capture pass, and inspection. Baseline plus three post-repair passes is the default bound; a pass may include several named flows/surfaces. Final current-revision coverage must fit within those passes, not silently acquire a fourth repair.

Stop precedence and receipt outcomes remain exactly:

| Reason | Status | Deciding observation |
| --- | --- | --- |
| `success` | `passed` | All required current-revision coverage proved, required findings resolved, checks passed, nothing required untested |
| `blocker` | `blocked` | Required recording, viewing, expected-behavior source, authority, environment, or verification unavailable; preserve simultaneous known failures |
| `no-progress` | `failed` | Completed round resolves no required finding, or repeats an unresolved set without new verified resolution |
| `exhaustion` | `failed` | Required work remains when authorized allowance is consumed; zero with defects stops before mutation |

An interrupted run stays `in-progress` at its last completed step. Operational failures block rather than opening unbounded capture retries. Changed files, tests, labels, severities, or assertion totals are not progress. New in-scope defects get new IDs and prevent success; repairs remain within the remaining allowance.

#### The receipt is the only loop state

Use `NN-evidence-iteration-<slug>.md`, update it in place, and preserve prior observations. The template carries:

| Section | Required contract |
| --- | --- |
| Frontmatter | Task, type, summary, status, stop reason, limit, consumed rounds, branch, current application revision |
| Scope | Targets/sources, authority/allowed paths, regression charter, environment, inspection capabilities, visual authority inventory |
| Revision ledger | Application SHA, served build/deployment, or base SHA plus retained dirty patch and hashes of relevant untracked source |
| Recording ledger | Unique session, raw/rendered media, report/manifest, media hash, revision, timestamps, timing caveats, availability/posting location |
| Inspection ledger | Reviewer/tool, session/surface, exact sampled timestamps or interval/cadence, pixels observed, expectation, conclusion, gaps |
| Findings | Stable monotonic ID, flow, actual/expected/source, before evidence, severity, state, repair paths/revision, after evidence, disposition |
| Round history | Reserved number and attempted IDs before mutation; edits/checks with exact results; inspected sessions; resolved/reopened/new findings; progress and next action |
| Guardrails | Finding and observed gap, changed check/rule, why it catches the original failure, before/after execution or an explicit unverified limit |
| Final coverage | Each required target and regression flow, latest revision, inspected evidence, `passed`/`failed`/`untested`, reason |

Finding states are `open`, `repair-pending-verification`, `resolved`, and `blocked`. Duplicates reference the original ID; reopenings retain it. Unsupported suspicions remain observations; `not-a-defect` requires an evidence-backed dismissal with source/reason, not deletion or severity reduction.

Use a new recorder session directory per capture under ignored task evidence storage. Preserve baseline and failed media; optional paired images never replace source videos. Commit receipt and source changes separately. Distinguish the application revision from a subsequent receipt-only commit, and verify the actual served source/build after restart or reload. Dirty code is not its base SHA alone. Local media is labeled local-only; missing media elsewhere means unavailable inspection.

#### Pixel inspection limits are executable obligations

Use the recorder's existing `external` import path and frame extraction. Open recorded media through a video-capable viewer or extracted frames through an image-capable tool. DOM/accessibility observations, probes, narration, `verified: true`, and overlay assertions only corroborate; they do not replace opening pixels.

- Static claims name readable frame timestamps and only prove those sampled states.
- Temporal claims require the relevant whole recorded interval or sequential frames, with start/end, playback rate or frame cadence and capture limitations. Sparse event frames do not establish absence of flicker or persistence.
- Nonvisual/business outcomes additionally need independently observed application state or a probe; a success toast is insufficient.
- Inspect raw media or an alternate existing render when overlays obscure state. Account for title cards, `video_t`, offsets, held tails, segment gaps, and pane identity. Missing/held footage cannot establish continued behavior.
- Capture/viewing unavailable means blocked. Still-only fallback documents observations but cannot pass the video contract. Uncertain pixels require focused inspection or a blocker, not a guessed edit.

Before changing source, persist the inspected defect and source of expected behavior. Run relevant existing checks and reject weakened expectations. After source or check changes, re-record affected flows and the entire agreed regression charter; final success also needs every other required target at that same revision. Re-rendering old footage does not qualify. A guardrail change must address an observed gap; preserve failing inputs, thresholds, expected behavior, and required coverage.

#### Narrow harness adaptation, not an eval framework

The existing runner is document-oriented: it builds all skills, requires a next-skill fence, forbids source changes, rejects existing-artifact updates, and launches OMP with `--no-session` (`evals/run.mjs:85-105,125-151,186-220,239-289,295-341,356-364`). The new live scenario cannot pass honestly through those defaults unchanged.

Add only opt-in support consumed by this scenario family in the same increment:

1. Install only `iterate-evidence` with its dependency through the existing installer into a scratch project/home. Use the pinned run snapshot as the installation source, including installer/build dependencies needed there, rather than a mutable host checkout. Invoke that installed path, not the harness's full skill tree. Retain the selected installed inventory and no-Atomic evidence.
2. Permit a terminal artifact-first answer and narrowly allowlisted fixture/check edits, while preserving the task/specification and unrelated paths. Keep existing document scenario defaults strict. Receipt commits remain artifact-only and source commits separate. Continuation may update only the named iteration receipt while preserving its history.
3. Retain actual OMP tool invocations/results and their order, including image/video opening. Use a supported session or structured-output mechanism after checking the installed OMP CLI in implementation; do not invent flags or trust final-answer prose as a trace. Keep `answer.md` as the final answer, separate from the trace. If this runtime cannot provide inspection evidence, record the live acceptance as blocked.
4. Retain fixture base and repair snapshots/patches, unchanged specification hash, installed resources, served identity, check outputs, videos/frames/manifests, receipt versions at mutation boundaries, and trace under `evals/results/<stamp>/`. Preserve media even on successful runs and use `--keep`. Regrading must use these saved materials rather than reconstructing only the originally defective fixture or reading current host source.
5. Use a small scenario-specific helper if needed for owned server/capture lifecycle, trace extraction, and grading. It stays under `evals/`, has no runtime skill API, and must not implement the repair loop or supply findings/fixes. No generalized adapter registry, event bus, scheduler, persistence layer, or orchestration service.

The harness grades actual facts, not wording: a tool trace proves that pixels were opened, but not that the claimed interpretation was correct. Pair it with an independent evaluator opening the retained frames/video and recording the observed counter values. Missing either component prevents a behavioral pass. `--grade` re-assesses saved evidence only; it is not a new live run.

#### Primary live fixture and installation proof

Use a tiny static local app served on an owned loopback port with cache disabled, a deterministic viewport, visible count, **Add one**, and **Reset**. Separate specification cases: one activation from zero gives `1`; Reset from nonzero gives `0`. Seed only the add handler's `+2` defect. The initial check exercises the action but misses the exact resulting count, making the guardrail gap observable. Use an actual browser and real clicks, with Playwright recording as in `record-evidence/references/device_setup.md:75-118` and the existing recorder import/finalization.

The agent receives flows, specification, authority, source boundary, and launch/check instructions, not the diagnosis, finding, or finished patch. It must capture the faulty increment, open that recording, save `IE-001`, reserve a round, diagnose and edit source, and strengthen the check. Execute the strengthened check against a preserved defective-source snapshot and the repaired source; retain exit/output from both. Never modify the specification or baseline expectation.

Record a new zero-to-one activation and Reset from nonzero after serving the repaired identity. Open the recorded pixels for both, retain before/after videos with distinct hashes/session paths, and resolve `IE-001` only after that inspection. Record per-flow results separately so Reset cannot hide a failed increment.

Extend the selected-consumer precedent in `tests/install.test.mjs:224-261`: isolated home/project, only the selected skill and dependency present, referenced files readable outside this checkout, unrelated sentinel untouched, no Atomic tree. Scoped uninstall removes the selected skill without deleting unrelated state or independently owned dependencies. Do not change existing dependency ownership semantics to clean up media or task history.

### Validation

All commands and observations below are future implementation work, not results from this outline session.

#### Automated Verification

- [ ] `node --test tests/install.test.mjs` proves selected installation/ownership in scratch destinations. This is offline packaging evidence only.
- [ ] `node scripts/sync-plugin.mjs` regenerates publication resources; `node scripts/sync-plugin.mjs --check` verifies synchronization. Neither proves agent behavior.
- [ ] `npm test` verifies the coherent repository after changes, including canonical inventory and registered terminal templates. Do not disable existing validation to accept the new skill.
- [ ] `npm run evals -- iterate-evidence --keep --max-time 25` runs the new live scenario with OMP's configured image-capable model; optionally supply `--model` with a supported selector. Prerequisites: configured provider, actual image-opening support, Chromium/Playwright, Python, ffmpeg/ffprobe, and recorder overlay support or disclosed recorder-compatible absence.

human-gated: false

**Required live evidence review:** The executing/evaluating agent opens retained before/after media, observes `2`, then `1`, then Reset `0`, and cites timestamps plus trace entries. The run receipt records exact commands, model/runtime, served identities, check failure/pass, and file locations. This review is mandatory behavioral proof, not deferred human approval and not replaced by `npm test`.

---

## Phase 2: Prove unavailable or contradictory evidence cannot pass

**Obligation:** IF recording inspection is unavailable or contradicts a success label, THEN the companion shall withhold success without changing the expected behavior.

**Done condition:** Separate live cases retain a real unavailable-viewing failure and real defective pixels behind passed recorder labels; their receipts are respectively `blocked/blocker` and `failed/exhaustion` at zero repair allowance. Neither performs an unsupported repair or reports the defect passed.

### Change Outline

Add `evals/scenarios/iterate-evidence-viewer-blocked.mjs` and `iterate-evidence-label-disagreement.mjs`, reusing the counter fixture and the small Phase 1 evidence helper. Amend the companion instructions/reference only when these observations reveal a gap; do not modify the recorder to generate special outcomes.

| Live case | Concrete setup and execution | Required retained proof |
| --- | --- | --- |
| Viewing unavailable | Launch an OMP session with image/video viewing genuinely unavailable or denied through supported runtime tool controls, while browser capture remains usable. Exercise Add one and retain the resulting video. A real failed/denied pixel-opening attempt establishes the missing capability; a prompt merely saying the viewer is unavailable is insufficient. If all alternative viewers cannot be disabled, use an isolated supported runtime profile without them and report unavailable setup as an acceptance blocker. | Capability/tool trace, preserved reachable capture, `blocked/blocker`, untested inspection coverage, no source mutation. An independent evaluator may view retained video later; it must not provide that view to the blocked subject session. |
| Passed label contradicts pixels | Capture the real defective app using external-source recording; deliberately annotate that known fixture event passed through existing recorder commands. Keep this disclosed fault injection in the eval setup. Supply the resulting baseline receipt/session to a fresh companion invocation with limit `0`; the subject must inspect the accessible media, not receive a finding. | Pixel-opening trace and independent observation of `2` against specification `1`, passed label/manifest retained unchanged, failed flow and stable finding, `failed/exhaustion`, zero source mutations. Raw footage remains available if the overlay covers the count. |

The second case also proves reuse of a valid external baseline and rejection of metadata as semantic truth. Verify compatibility by recording the standalone recorder's original finalization output and unmodified media schema, not by changing its rules.

### Validation

#### Automated Verification

- [ ] `npm run evals -- iterate-evidence-viewer-blocked iterate-evidence-label-disagreement --keep --max-time 25` runs the two scenarios independently.
- [ ] `npm test` checks any integrated instruction/template or runner corrections after the tree is coherent. Its result remains offline evidence.

human-gated: false

**Required live evidence review:** Inspect the actual capability-denial trace, then open the label-disagreement video's counter pixels and retained labels. An expected non-success receipt can make an eval pass, but a missing prerequisite that prevents exercising the intended case is an unexecuted/blocked acceptance case, not an expected success for the grader.

---

## Phase 3: Prove bounded progress and continuation retain history

**Obligation:** WHILE required defects remain, the companion shall stop at the authorized progress/round boundary without erasing findings or consumed work.

**Done condition:** Live cases prove ineffective repair stops as no-progress, zero allowance stops before mutation, default allowance ends after three productive rounds without a fourth repair, and a fresh session resumes a reserved round without replaying source edits or resetting IDs/counters.

### Change Outline

Add scenario modules under `evals/scenarios/` with the command names below. Reuse the Phase 1 fixture; the bounded case adds four independent visible counters in a fixture variant, not product features. Any scenario helper only establishes controlled conditions and grades; the installed skill still owns recording, inspection, diagnosis, reconciliation, and stopping.

| Scenario suffix | Concrete setup | Observable decision |
| --- | --- | --- |
| `no-progress` | Use the approved parent-delegated repair path with one deliberately ineffective bounded worker result: an actual source edit to an unused increment setting, leaving the served add handler defective. Persist the baseline inspected finding and reserved round before delegating. The parent supplies no new expected value and cannot close the finding. This disclosed repair fault injection is separate from the primary autonomous diagnosis case. Serve the resulting source identity and let the companion perform fresh capture/inspection. | New pixels still show `2`; same required ID remains open; completed round resolves nothing; `failed/no-progress` precedes exhaustion; no second repair. Keep actual worker/edit trace, source snapshot, and both videos. |
| `zero-limit` | Fresh real faulty counter, limit `0`, ordinary truthful narration. Companion records and inspects the defect itself. | `failed/exhaustion`, consumed rounds `0`, retained finding and failed coverage, source/checks unchanged. Unlike disagreement, this tests allowance independently of misleading labels. |
| `three-rounds` | Four independently defective counters A-D, each specified to increment exactly one and reset to zero. Authorized scope requires one finding repaired per round in fixed A-D order, with all four flows and Reset in every capture pass. Leave limit unspecified to exercise default `3`. Baseline must visibly establish all four defects. | Each of rounds 1-3 resolves a previously open finding through fresh inspected video. D remains failed after round 3; receipt is `failed/exhaustion`, consumed `3`, no fourth reservation/mutation/capture pass. Retain baseline plus three passes. Earlier no-progress is not accepted as proof of this boundary. |
| `continuation` | Run the real primary fixture until source repair is complete but the reserved round lacks recapture/inspection; stop the owned session at that observed boundary and preserve the saved receipt/source. Start a fresh OMP invocation naming that receipt. Do not synthesize a passed round. | Existing round completes against served repaired source, stable `IE-001` and consumed count survive, edits are not replayed, findings close only after new pixels. Retain both sessions and receipt snapshots. Resume failure remains visible. |

For deterministic interruption, use the scenario's own capture entry to pause before the post-repair capture, after confirming the persisted reserved round and source edit in the trace. The harness terminates the owned OMP process and releases that fixture pause for the fresh invocation. This is a fixture-local fault hook, not a product resume controller.

The three-round case exercises allowance only because each completed round proves progress. Repeating one unfixable counter three times would instead require stopping after round one and cannot establish default exhaustion.

### Keep proof focused on the requested loop

The seven named scenarios above are the live acceptance scope: primary repair, unavailable viewing, contradictory labels, no progress, zero allowance, default three-round bound, and interrupted continuation. Preserve the design's remaining authority, identity, temporal-inspection, and history rules in the skill and receipt; inspect their consistency during code review.

Do not add separate application features or a broad scenario matrix for hidden-state servers, temporal animation, publishing, every runtime, or every invocation variant. Those are not additional deliverables requested by the user. Report exactly which branches ran; neither the focused live proof nor static review establishes unexercised runtime behavior.

Parent scope correction: this replaces the outline's speculative extra live variations, not any user requirement or the approved design's named acceptance cases.

### Validation

#### Automated Verification

- [ ] `npm run evals -- iterate-evidence-no-progress iterate-evidence-zero-limit iterate-evidence-three-rounds iterate-evidence-continuation --keep --max-time 25` exercises the named live scenarios.
- [ ] `npm test` validates final packaging and harness compatibility after integrated changes. It cannot substitute for any named live scenario.

human-gated: false

**Required live evidence review:** Open the post-ineffective-repair video, the zero-limit baseline, and all bounded-case passes. Verify actual resolved sets and remaining D against unchanged expectations. Compare interrupted/resumed traces and source histories to decide replay/count/ID behavior. An eval process exiting zero without this retained inspection evidence is insufficient.

---

## Verification boundary and delivery chain

| Evidence class | What it can establish | What it cannot establish |
| --- | --- | --- |
| Offline `npm test`, installer tests, plugin sync | Layout, templates, dependency/resource ownership, generated resources, narrow harness regression contracts | Agent diagnosis, pixel inspection, browser repair, live stop branches |
| Live OMP/browser eval plus independent recorded-pixel review | The specific fixture flows, agent/tool actions, repaired served revision, and exercised stop/continuation cases | Every model/runtime, native devices, general accessibility, unsampled temporal behavior |
| Saved-run regrade | Conclusions supported by retained snapshots, traces, and media | A new execution, missing footage, or facts never retained |

Preserve evidence under the existing eval retention convention. Any narrowly needed offline harness tests defend changed default-versus-opt-in behavior, source allowlists, or loss of required evidence; do not assert incidental prose or implement the skill's reasoning as a parallel test controller.

The fixed chain is unchanged:

```text
research questions -> research -> approved design -> this structure outline
-> create-plan -> implement-plan -> independent verify-implementation
-> review/repair loop -> describe-pr
```

The parent owns later fresh sessions and approval authority; `gates: none` removes approval pauses, not proof requirements. The next actual stage is `/create-plan @04-structure-outline-iterate-evidence.md`. The installed outline reply template's generic manual `/implement-outline` shortcut belongs to a different chain and must not cause this parent to skip planning. No orchestration integration or later stage is launched here.

## Open Questions

None requiring a user decision. Installed OMP trace retention/tool-denial details and browser prerequisites must be established in the implementation plan and exercised later; they are explicit verification dependencies, not permission to replace live proof with metadata. Phase 1 must remain a small installable instruction skill plus its fixture; if a proposed harness abstraction grows beyond the listed opt-in needs, remove the abstraction rather than expanding this feature into a framework.

## Human Review

### Review targets

- Phase 1's installable skill-to-recorded-repair slice and the two distinct adversarial proof slices.
- Narrow eval-runner exceptions that preserve current document scenarios and produce actual tool/pixel evidence.
- Acceptance coverage, recorder non-change boundary, stop precedence, current-revision identity, and fixed full-chain handoff.

### Verify

- [x] The outline preserves the approved companion contract and gives the primary live repair and every named non-success branch a concrete verification path.
- [x] Offline packaging checks are separated from genuine recorded-pixel proof; later fresh sessions remain parent-owned in the fixed full chain.

### Known limits

- This session created only the outline; no implementation, validation command, formatter, linter, build, test, or live proof ran. Browser/tool prerequisites and cross-runtime/native behavior remain unverified.
