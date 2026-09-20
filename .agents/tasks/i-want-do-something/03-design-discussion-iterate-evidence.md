---
task: i-want-do-something
type: design-discussion
summary: "Add iterate-evidence as an independently invocable companion that reuses record-evidence and owns a bounded, artifact-backed inspect-repair-re-record loop. Parent decisions fix three repair rounds by default, stable finding IDs, revision-linked evidence, pixel inspection, explicit stopping, and no Atomic integration. The design defines installation ownership and a live browser fixture acceptance run; neither implementation nor behavioral validation occurred in this design session."
repo: skills
branch: i-want-do-something
sha: 264a039e0df5ba34842b0866b676e4b85dc33833
---

### Summary of change request

Add `iterate-evidence` to record live behavior, inspect the captured pixels, repair evidenced defects, and repeat within a fixed bound. Improvements to repository tests or guardrails must address observed gaps rather than manufacture passing results.

Authority: `task.md:4-13` sets `workflow: full`, `gates: none`, and parent-owned autonomous delivery. The current instruction fixes the companion name and core constraints, delegates conservative design choices, and limits this session to this artifact and its commit.

Primary input: [Existing video evidence and repair feedback workflows](02-research-video-feedback-loop.md). Parent decisions below are settled authority, not questions awaiting another user approval.

### Current State

- Agents can record live interactions, narrate expectations, and preserve timestamped assertion results. The caller supplies those results; a playable recording does not establish their truth.
- Reviewers can open extracted stills and construct before/after pairs. Event-based sampling does not establish behavior between those frames.
- Recording and repair are separate activities. Users currently supply the coordination, finding continuity, and decision to record again after a repair.

These boundaries come from the research sections on capture, inspection, and artifact-backed repair loops. They are not observations of a target application.

### Desired End State

- A user or parent agent can invoke one companion with testable flows and repair authority, without installing or invoking a controller.
- Every repair traces to a stable finding, inspected evidence, an expected-behavior source, and a new recording of the changed application.
- The receipt distinguishes completed repairs from verified outcomes. It reports success, a blocker, no progress, or exhausted repair allowance without treating untested work as passed.
- Test and guardrail improvements preserve the original expectations and cite the missed defect or process failure they address.

### What we're not doing

- Changing standalone `record-evidence` defaults, capture behavior, media schemas, or its existing final-response routing.
- Adding a media engine, semantic detector, service, scheduler, new controller abstraction, Atomic stage, or workflow route.
- Unbounded recursion, autonomous scope expansion, general UI redesign, speculative test hardening, or global self-modification of agent instructions.
- Claiming comprehensive accessibility, temporal correctness, native-device support, or cross-runtime execution from one browser fixture.
- Implementing skills, fixtures, installation edits, release notes, or later delivery phases in this session. Formatters, linters, builds, tests, and live runs are intentionally not executed here.

### Proposed End State Architecture

#### The companion owns the loop; the recorder owns media

`iterate-evidence` is a canonical skill with references, not an executable controller. Its agent performs the following sequence and persists the receipt before each change boundary:

```text
scope + expectations + repair authority + regression charter
    -> baseline live recording through record-evidence
    -> inspect recorded pixels and record findings
    -> choose explicit stop OR reserve a repair round
    -> repair evidenced defects and run relevant repository checks
    -> new live recording of affected flows + regression charter
    -> inspect new pixels and reconcile the same finding IDs
    -> choose explicit stop OR next bounded repair round
```

The companion reads the installed `record-evidence` instructions and uses its existing capture, narration, finalization, frame, and pairing operations. This is composition of those operations, not automatic invocation of its terminal handoff. Only a top-level `record-evidence` invocation follows that skill's current final-response routing. The companion writes its own terminal receipt and returns control to its caller; it never starts `describe-pr` or another delivery phase implicitly.

Repairs occur inline by default. An existing parent may delegate a bounded repair with the finding IDs, evidence, expectation sources, and allowed paths. The companion remains the integration owner and inspects the new evidence before closing findings. A worker's success message is not verification. No new worker role or dependency on implementation-phase skills is required.

#### Invocation freezes the scope before the first recording

Accept a task directory or an existing `evidence-iteration` receipt for continuation. A named existing `evidence` receipt can supply the baseline only after checking its revision, environment, accessible media, and coverage; otherwise record a fresh baseline.

For an invocation outside a task, use the existing task-opening convention to establish a committed receipt home. This is independently invocable without a plan, research chain, or Atomic installation. Outside Git, preserve artifacts locally and report that they cannot be committed.

The invocation records:

| Input | Rule |
| --- | --- |
| Test targets | Required observable flows with expected outcomes and their sources. Resolve from supplied request or task artifacts; do not infer success from current implementation. |
| Surface and environment | Reuse recorder discovery, but pin the application, browser/device, viewport, relevant data, and launch command actually used. |
| Repair authority | Explicitly granted by the request or parent. This task grants autonomous repair in later phases; missing authority in another invocation is a blocker before mutation. |
| Regression charter | Named neighboring flows and supported configurations agreed by the caller, or conservatively selected under delegated authority and persisted before repair. |
| Repair limit | Nonnegative integer, default `3`; `0` records and inspects only. A higher limit requires explicit caller or parent authorization, not automatic renewal. |
| Posting destination | Optional and inherited from the request; default requester-only. Publishing is not a prerequisite for local success unless explicitly required. |

For visual expectations, inspect the target repository's component library and design sources before repair. Record relevant color tokens or literal hex values, typography, spacing, radius, elevation, layout, breakpoints, themes/CSS variables, framework utilities, accessibility requirements, and visual baselines. Mark absent categories unknown or not applicable. Use approved requirements first, then established repository contracts and design references; conflicting or absent authority blocks the affected repair. Personal taste is not an expected-behavior source.

#### One receipt holds identity, findings, and append-only round history

Allocate `NN-evidence-iteration-<slug>.md`, with `type: evidence-iteration`, using the existing numbered task-artifact convention. Update that receipt in place; preserve earlier observations and round records rather than rewriting failed history into success. Its template owns the following data contract, without a parallel JSON state store:

| Section | Required content |
| --- | --- |
| Frontmatter | Task, type, summary, `status`, `stop_reason`, repair limit, consumed rounds, branch, current application revision. |
| Scope | Targets, expected-behavior sources, regression charter, authority, environment, and media-inspection capabilities. |
| Revision ledger | Application commit and deployment/build identity for each capture; exact source snapshot identity when the worktree is dirty. |
| Recording ledger | Unique session path, raw/rendered media, recorder report and manifest, media hash, capture revision, timestamps, timing caveats, and availability or posting location. |
| Inspection ledger | Reviewer/tool, session and surface, frame timestamps or inspected interval boundaries, pixel observations, relevant expectation, conclusion, and explicit gaps. |
| Findings | Stable ID, flow, observed defect, expected behavior and source, before-evidence reference, severity, status, repair revision/paths, after-evidence reference, and disposition. |
| Round history | Reserved round number, findings attempted, edits/checks and exact results, recordings inspected, findings closed/reopened/new, progress comparison, next action or stop reason. |
| Guardrail changes | Finding ID, observed gap, changed check/rule, why it catches the original failure, and before/after execution evidence or a stated verification limit. |
| Final coverage | Every required target and regression flow with latest revision, inspected evidence, result `passed`, `failed`, or `untested`, and reason. |

A clean commit identifies application code, not necessarily the later receipt-only commit. With uncommitted source changes, pair the base SHA with a retained patch and content hashes for relevant untracked source. Do not label dirty code as its base SHA alone. Record the served build/deployment and restart or reload it as needed; a Git change does not prove the browser loaded that change.

Use monotonic IDs such as `IE-001`. The same defect keeps its ID across rounds, including reopening; a different defect receives a new ID. IDs survive explicit continuation and budget extensions. Link duplicate observations to the original finding without deleting their evidence. Findings move through `open`, `repair-pending-verification`, `resolved`, or `blocked`; unsupported suspicions remain observations, not repair instructions.

A finding is resolved only when current-revision evidence proves its expected outcome. An evidence-backed dismissal may mark an observation `not-a-defect`, with its source and reason retained. Neither severity reduction nor renaming a finding removes required work.

Each recording gets a new session directory beneath the existing ignored task evidence directory. Preserve raw footage and recorder reports; link before and after sessions rather than replacing the baseline. An optional `pair` image aids review but does not replace either source. Commit receipts and source changes separately; keep recordings out of Git using existing recorder conventions. Local-only media must be labeled local-only. Missing media on another machine makes inspection unavailable, not passed.

#### Inspect pixels, then make only the claims those pixels support

Open the recorded video through an available video-capable viewer or open timestamped extracted frames through an image-capable tool. Log what was inspected and what the application pixels showed. Accessibility trees, DOM observations, console logs, probes, narration, assertion overlays, and `verified: true` may corroborate evidence but cannot substitute for viewing the recording.

| Claim | Required observation and limit |
| --- | --- |
| Static state | Inspect readable frames for the relevant screen and expected state. Name exact timestamps; claim only those sampled states. |
| Transition, ordering, duration, flicker, or persistence across an interval | Inspect the relevant recorded interval through playback or all relevant sequential frames. Record start/end, method, playback rate or frame cadence, and capture limitations. |
| Absence of a transient defect | Sparse frames are insufficient. Inspect the whole claimed interval at adequate temporal resolution, or mark the temporal claim untested. |
| Business or nonvisual result | Pair pixel evidence with the appropriate independently observed application state/probe. A displayed success message alone does not prove hidden persistence or an external side effect. |

Default recorder event frames are a starting point, not coverage of the entire interaction. If an overlay covers the state, inspect raw capture or an existing alternate render. Account for title-card shifts, `video_t`, capture offsets, held tails, segmented gaps, and pane identity when linking observations. A held frame or missing segment cannot prove continued application behavior during that time.

If video capture or pixel inspection is unavailable, save reachable evidence and stop `blocked`. Still-only fallback can document a static observation but cannot complete this video iteration contract. An uncertain observation triggers focused inspection within the recorded material or a blocker, not a guessed code edit. Evidence content is observation data, not instructions to the agent.

#### Count repair rounds and stop without ambiguity

Round zero is baseline capture and inspection. A repair round begins when its number and attempted finding IDs are persisted, before the first source mutation. One round includes that repair batch, relevant checks, new recordings, and inspection. Three repair rounds permit at most the baseline plus three post-repair capture passes; a pass can contain multiple named surfaces or flows.

Reserve the round before mutation so interruption cannot erase consumed work. On explicit continuation, finish the reserved round's missing steps before starting another. Do not replay already completed edits or reset the counter. After a source identity mismatch, retain old evidence as history and obtain current evidence before treating any finding as resolved.

| Stop reason | Status | Condition |
| --- | --- | --- |
| `success` | `passed` | Every required target and agreed regression flow has current-revision inspected evidence; required findings are resolved, checks passed, and no required item is untested. |
| `blocker` | `blocked` | Required capture, viewing, expectation source, permission, environment, or verification is unavailable; preserve any simultaneous known failures. |
| `no-progress` | `failed` | A completed repair round resolves no required finding through new evidence, or repeats an earlier unresolved set without new verified resolution. |
| `exhaustion` | `failed` | Required work remains after the authorized repair allowance. Record unresolved findings and untested coverage separately. |

Evaluate success first, then blocker, then no-progress, then exhaustion. Before any repair, check that allowance remains; an inspect-only run with defects stops as exhaustion at zero repairs. These reasons are termination classifications, not replacements for per-flow results.

Progress means at least one previously open required finding is resolved against unchanged expectations using new evidence. File changes, new narration, extra tests, decreased severity, and higher assertion tallies do not count. Newly discovered in-scope defects retain new IDs and prevent success; any regression is repaired only within the remaining allowance. Repeat unresolved sets indicate cycling even when intermediate edits differ.

An interrupted run remains `in-progress` with the last completed step, not passed. Operational failures return a blocker instead of opening an unbounded capture retry loop. A later authorized continuation retains the original limit and finding history unless the parent explicitly extends the limit with a recorded reason.

#### Repairs and guardrails share the same evidence requirement

Before every repair, persist an inspected defect and its expected-behavior source. Diagnose the responsible code, then make the narrow correction. An unrelated improvement remains outside scope even when easy.

Run relevant existing checks and inspect changed assertions for weakened expectations. After any source or check change, re-record affected application flows and the complete agreed regression charter against the resulting revision. For final success, other required targets also need current-revision evidence; the final pass fills any remaining coverage gap. Re-rendering old footage cannot satisfy this step.

A test or repository rule change needs a linked observed gap. Prefer a check that fails for the original defect and passes after repair; retain exact execution evidence. If that proof is impractical, state the limit and use direct behavioral evidence without claiming the guardrail is validated. Preserve failing inputs, thresholds, required coverage, and expected behavior. Updating baselines or suppressing failures to obtain green is not a repair.

#### A live browser fixture is the required behavioral acceptance run

The implementation phase must add and execute an isolated live skill scenario using the existing eval harness. This is a requirement, not a run result from this session.

Use a small real local web application with a visible counter, an **Add one** control, and **Reset**. Its pinned fixture specification says one activation increments by exactly one and reset returns the count to zero. Seed one source defect: the add handler increments by two. Use an actual browser, real clicks, and a real served application; do not simulate browser observations or feed prerecorded findings to the agent.

The acceptance scenario proves the companion's complete defect-to-reverified-repair behavior. Its application charter contains separate cases for increment and reset, preserving one expected behavior per case.

1. **Establish the fixture and authority.** Install only `iterate-evidence` through selected installation, which must bring `record-evidence`. Grant repair authority for fixture source and checks, freeze the specification, set a deterministic viewport and starting state, and identify the served revision. Use a temporary repository and evidence directory, not the collection's source tree.
2. **Record the failure.** Start real browser video capture and import it through the recorder's existing external-source path. Activate **Add one** once from zero. Retain a before recording that visibly shows `2` where the unchanged specification requires `1`.
3. **Inspect and save the finding before repair.** Open the recorded pixels and write `IE-001` with the actual session, revision, timestamp/frame, observed `2`, expected `1`, and source citation. Retain tool-call or viewer evidence that image/video inspection occurred. A recorder `FAIL` toast alone does not satisfy this step.
4. **Repair and defend the observed gap.** Let the skill diagnose and change fixture source without supplying a finished patch. Where the fixture's existing check misses the counter result, strengthen it to assert the specified outcome. Demonstrate its failure against the defect and success after repair; keep the fixture specification unchanged.
5. **Re-record and inspect.** Serve the repaired source. Record a new activation from zero showing `1`, and run the agreed reset regression case from a nonzero state. Inspect both results from the new capture, link them to the repair revision, and resolve `IE-001` only now.
6. **Grade retained evidence.** The evaluator checks separate before/after videos, their pixel content and source identities, the persistent finding, actual source repair, unchanged expectations, executed checks, and final coverage. Both videos must remain available for review. A receipt claiming inspection without a pixel-opening tool trace is insufficient. End `success` only when those facts hold.

The primary fixture uses settled-state claims, not inferred timing or absence of flicker. If additional temporal behavior is claimed, its acceptance case must retain and inspect the whole relevant interval.

Exercise non-success branches separately: unavailable pixel viewing yields `blocked`; an ineffective repair with the same visible defect yields `no-progress`; a zero-repair run with a visible defect yields `exhaustion`. A bounded multi-round case must prove the default stops before a fourth repair. An overlay/manifest disagreement case must remain failed when pixels show the defect despite a passed label. These scenarios must preserve the failure rather than alter expectations. Offline checks may verify artifact and installation contracts; they do not prove these live branches executed.

### Design Questions

None requiring a user response. The explicit parent choices are binding; the following conservative choices are recorded under delegated autonomy. Any later change belongs to the parent's artifact revision, not an implicit implementation decision.

### Resolved Design Questions

#### Add a companion instead of changing capture defaults

**Chosen by the parent:** independently invocable `iterate-evidence`, reusing `record-evidence`, without Atomic integration. A separate entry preserves existing recording-only use and avoids a new media owner. Rejected: making every recording mutate code, or implementing another capture/controller stack. Research sections 1, 3, and 6 establish the existing ownership boundaries.

#### Keep orchestration in instructions and artifact history

**Chosen under delegated autonomy:** one skill, a receipt template, an inspection/acceptance reference, and terminal answer templates for success versus non-success. Keep universal stop conditions inline; disclose detailed inspection rules and fixture instructions through explicit step pointers. This applies `writing-for-agents` progressive disclosure without hiding completion criteria.

Retain model-invocable discovery so a parent can reach the skill, while documenting the direct `/iterate-evidence` invocation. Its description should distinguish record-only work from an explicitly authorized record-inspect-repair request and receipt continuation. Rejected: a user-only entry that the parent cannot invoke, and a generic router or persisted controller that duplicates the artifact.

#### Use stable findings and one authoritative receipt

**Chosen by the parent:** stable finding IDs and revision-linked before/after evidence. **Chosen under delegated autonomy:** an in-place `evidence-iteration` receipt with preserved round history and links to unchanged recorder sessions. Rejected: renumbering findings each review or using only the latest passing screenshot. The existing review pattern supplies artifact-backed disposition, but its ID renewal is deliberately not copied for this loop.

#### Bound repairs independently from proof

**Chosen by the parent:** default three repair rounds and explicit success, blocker, no-progress, and exhaustion. **Chosen under delegated autonomy:** zero permits inspection-only use; verified finding resolution defines progress, and consumed rounds survive interruption. Rejected: unlimited retries and treating a completed code edit as forward progress. This can stop a difficult repair early; the parent may extend scope or allowance explicitly without rewriting failure history.

#### Prefer inspected evidence over machine-readable confidence

**Chosen by the parent:** inspect video/pixels; require inspected intervals for temporal claims and disclose still-sampling limits. **Chosen under delegated autonomy:** viewing or capture failure blocks completion, with useful partial observations retained. Rejected: `verified`, passing overlays, metadata, or sparse stills as semantic or continuous-time proof. The recorder's existing fallback remains unchanged for standalone users.

#### Require a real acceptance run without broadening platform promises

**Chosen by the parent:** real browser defect video, inspected finding, code repair, and new evidence. **Chosen under delegated autonomy:** a deterministic counter fixture plus reset regression, using existing live eval and installer patterns. Rejected: synthetic media and static validation as behavioral proof, and native-device coverage before its runtime prerequisites are available. Native capture paths remain reusable, but support claims must name their actual verification boundary.

### Patterns to follow

| Concern | Local pattern and proposed use |
| --- | --- |
| Artifact and invocation | `shared/CONVENTIONS.md:55-67,108-120,142-148`: numbered artifacts, in-place revisions, terminal replies without handoff fences, explicit-path artifact commits. |
| Capture composition | `skills/delivery/record-evidence/SKILL.md:22-54,98-127,150-164`: existing sessions, commands, assertion limits, pixel review, and original-failure evidence. |
| Evidence links | `skills/delivery/record-evidence/references/evidence_template.md:11-35`: revision, sessions, results, caveats, posting destinations; add loop-specific history in the companion, not the recorder schema. |
| Dependency expansion | `scripts/install.mjs:32-38`: extend `SKILL_DEPENDENCIES` with `"iterate-evidence": ["record-evidence"]`; reuse closure and selected-resource ownership. No typed-judgment or controller dependency. |
| Portable packaging | Research section 6 maps canonical discovery, copied sibling references, runtime adaptation, and generated plugin resources. Keep one canonical skill and preserve the shared links on line six. |
| Mechanical integration | `docs/testing.md:75-82`: add the phase-table row as independently invoked, artifact-first answers, and integration checks. Update the canonical inventory expectation rather than disabling validation. |
| Proof separation | `docs/testing.md:1-23,59-65`: distinguish offline validation from live skill runs; preserve fixture, prompt, tool transcript, media, receipt, and outcome. |

Implementation should update `workflows/delivery.md` and its quick-start pointers together, synchronize generated plugin inventory through the existing tool, and add a user-facing changeset. Those are future implementation surfaces, not changes made here. No edits belong in `atomic/` for this feature.

The acceptance rationale also uses the **Software Testing** notebook (`e92721ab-3f64-4a07-a084-be907138a8a9`): **BDD 101: Writing Good Gherkin | Automation Panda** supports separate behavior cases; **A Comprehensive Treatise on Automated Software Testing: Theoretical Frameworks, Deterministic Pipeline Architectures, and Autonomous AI Orchestration** supports stable expected outcomes during repair. [Notebook and source verification](https://notebooklm.google.com/notebook/e92721ab-3f64-4a07-a084-be907138a8a9). Repository evidence and the explicit user requirements control this design; notebook guidance does not establish runtime behavior.

### Execution DAG

No execution-plan artifact exists. The fixed `full` chain from `workflows/delivery.md:62` is: research questions → research → design discussion → structure outline → implementation plan → implementation → independent verification → review/repair loop → PR description.

Research and this design are artifact-producing stages. The parent owns the remaining fresh sessions, including structure outline before implementation plan, later implementation, the live fixture acceptance run, independent verification, review, and PR description. `gates: none` means no approval pause; failed proof and missing prerequisites still stop the affected work. No phases are probabilistically dropped and no controller integration is implied.

This child session ends after committing this design artifact and emitting the requested marker. Its standard skill reply may advertise a manual next command; that does not launch it or override the parent's fixed chain.

## Human Review

### Review targets

- Parent decisions and the companion/recorder ownership boundary.
- Finding identity, current-revision proof, bounded progress rules, and non-success outcomes.
- Live fixture evidence requirements, installation dependency, and unchanged acceptance expectations.

### Verify

- [x] Parent constraints are represented: standalone companion, recorder reuse, three-round default, stable IDs, pixel inspection, bounded stopping, and no Atomic integration.
- [x] The design requires expectation-backed repairs, current-revision recapture, agreed regression coverage, and evidence-backed guardrail changes.
- [x] The live browser acceptance run specifies defect video, inspected finding, source repair, and new evidence; it is not claimed as executed.

### Known limits

- No skill implementation, formatter, linter, build, test, recording, or live browser acceptance run occurred in this design session.
- No target application or product design system was supplied. Its expectations, tokens, permissions, viewing support, and temporal capture quality remain runtime prerequisites.
- The browser acceptance design does not prove native-device behavior, every runtime's pixel-viewing capability, or any Atomic execution. The parent owns later verification and phase coordination.
