---
date: 2026-09-20T04:27:55Z
git_commit: 95ef3145c2a5b3970aa3057dc1b97599b532d25d
branch: i-want-do-something
repository: skills
topic: "Existing video evidence and repair feedback workflows"
type: research
summary: "The collection records live sessions and supplies timestamped still-review material, while assertion truth remains the caller's responsibility. Existing artifact-backed repair and re-verification loops are separate from recording; the inspected controller does not schedule a record-video, inspect-video, repair-code cycle. This research maps the seven questions, including tests, retained failure-to-guardrail records, design-system discovery, and skill integration, without selecting a design. task.md authorizes gates=none; the existing parent retains orchestration."
tags: [research, codebase, evidence, video, repair]
status: complete
---

# Research: Existing video evidence and repair feedback workflows

**Date**: 2026-09-20T04:27:55Z
**Git Commit**: 95ef3145c2a5b3970aa3057dc1b97599b532d25d
**Branch**: i-want-do-something
**Repository**: skills
**Research questions**: `01-research-questions-video-feedback-loop.md`

## Research Question

1. Where are the current skills, templates, scripts, documentation, and evaluations for recording evidence, inspecting application behavior, reviewing defects, and repairing code?
2. How does `record-evidence` currently connect live actions, assertions, narration, recording, and saved reports across supported capture targets, including failures and unavailable prerequisites?
3. What existing video-inspection capabilities and documented limitations govern how agents view recordings, identify defects, and link findings to timestamps, observed behavior, and expected behavior?
4. What existing workflow patterns connect findings, code repairs, re-verification, and repeated review, including artifact handoffs, human gates, stop conditions, and interrupted or unsuccessful runs?
5. How do existing tests, live evaluations, and repository guardrails establish correctness for evidence and repair workflows, and what records connect observed failures to changes in those checks?
6. What existing conventions identify a recorded application's design system, component library, color tokens or literal hex colors, typography, spacing, radius, elevation, layout, responsive behavior, theming hooks, CSS variables, framework utilities, accessibility requirements, and visual regression assets?
7. How are delivery skills and their supporting resources registered, installed, adapted across runtimes, and mechanically validated, including independent invocation and optional orchestration?

## Research Methodology

This document records current behavior only. It does not recommend implementation work, refactors, optimizations, or future changes.

Five read-only scout lanes inspected capture/inspection, repair workflows, checks and retained results, visual discovery, and installation. Source, templates, docs, and test definitions are primary evidence; retained results are prior observations, not fresh execution. No external dependency claim required web research. No sources artifact existed in this task directory.

The current task records `workflow: full`, `gates: none`, the existing parent as orchestrator, and explicitly autonomous continuation. (`.agents/tasks/i-want-do-something/task.md:4-13`)

The user explicitly supersedes the older research-question artifact's `gates: all` wording and confines this session to research, artifact commit, and handoff.

Citation checking used `judge.mjs cite` on 48 cited statements: 42 supported, six unclear, none unsupported. Manual source review retained all facts and narrowed attribution where a paragraph combined source evidence with session/search observations; no claims were dropped. Initial unclear probabilities were 0.40 (task authority), 0.71 (frame-review/schema boundary), 0.47 (gate/session boundary), 0.43 (handoff records), 0.58 (runtime/scenario boundary), and 0.65 (consumer-test scope). All six clarified statements were supported on recheck (probabilities 0.93, 0.86, 0.93, 0.93, 0.96, 0.84). Model: `jev-1.13.0`; initial batches used 62,805 input / 916 output tokens; recheck used 4,663 / 112.

`judge.mjs coverage` marked all seven questions answered: Q1 0.97, Q2 0.97, Q3 0.96, Q4 0.96, Q5 0.96, Q6 0.96, Q7 0.92. Model: `jev-1.13.0`; 8,568 input / 130 output tokens. No missing or partial question required a second research pass.

### Known limits

- Static research only: no formatters, linters, builds, tests, live evaluations, recordings, or application runs were executed. Prior execution records were not replayed.
- No target application or recording was supplied. Product design tokens, actual defects, runtime viewing support, capture permissions, timestamp fidelity, and upload playback remain unverified.
- Searches found no semantic video-defect detector or persisted per-frame review verdict in the inspected collection paths. This is a repository finding, not a limit on external agent tools.

## Summary

Recording, live-state inspection, code repair, and independent verification already have separate owners. `record-evidence` produces media and review stills; the operator supplies assertion outcomes. Artifact-backed loops carry failures into repair and new verification, but recording is not a scheduled phase in the inspected Atomic controller.

Design discovery is explicitly prescribed, including every requested visual category. Existing template styles are explanation helpers, not evidence of a recorded application's design system. Offline checks, live skill evaluations, and optional Atomic runtime proof have distinct documented boundaries.

## Detailed Findings

### 1. Evidence capture owns media, not application assertions

The canonical entry is `skills/delivery/record-evidence/SKILL.md`; its sibling `scripts/evidence.py` owns recording and media processing. The operator starts capture, drives the live app, narrates, and asserts observed outcomes. A recording of something other than that live test session is not accepted evidence. (`skills/delivery/record-evidence/SKILL.md:10-14`)

`finalize_session` imports or locates raw capture, checks readability, corrects timing, renders overlays, probes the output, and writes manifest/report/session state. Empty capture and rendering failures preserve a failed finalization state. (`skills/delivery/record-evidence/scripts/evidence.py:1820-1853`, `skills/delivery/record-evidence/scripts/evidence.py:1954-2008`)

Before an action, the agent narrates what the viewer will see. `test_start` names the expectation; after observing the screen, the agent submits `passed`, `failed`, or `untested`. Narration is limited to 280 characters and test-event messages to 80. The timestamp establishes when an assertion was made, not its truth. (`skills/delivery/record-evidence/SKILL.md:38-39`, `skills/delivery/record-evidence/SKILL.md:98-108`)

The annotation function validates message/result and session state, then stores `{type, message, t, at, result?, hold?}`. It does not observe the app. Test grouping gives failures precedence, then marks missing/untested assertions untested; otherwise the test passes. There is no separately structured expected-state field in these events. (`skills/delivery/record-evidence/scripts/evidence.py:1679-1706`, `skills/delivery/record-evidence/scripts/evidence.py:631-652`)

| Surface | Current capture and prerequisites |
| --- | --- |
| Desktop | macOS avfoundation with Screen Recording permission; Linux X11 or wlroots-compatible wf-recorder. Geometry/offset can crop capture. |
| Android | Explicit device/emulator, or the only connected target; scrcpy when available, otherwise adb screenrecord in 180-second segments. |
| iOS | Booted simulator through xcrun simctl recordVideo; a separate Maestro/idb/XCUITest actuator drives interactions. |
| Headless browser | Caller records with Playwright and imports the resulting file through source `external`. |
| Synthetic | Source `test` exercises the recorder toolchain and is explicitly not application evidence. |

These supported paths and their actuator split are documented together. Python 3.8+, ffmpeg/ffprobe and an H.264 encoder are required; Pillow or ImageMagick supplies text overlays. (`skills/delivery/record-evidence/SKILL.md:30-54`, `skills/delivery/record-evidence/SKILL.md:78-83`)

Desktop setup documents unavailable GNOME/KDE Wayland capture through this wf-recorder path, an ffmpeg-9 build limitation, and monitor-less compositor limits. Browser recording can run without a display; `video-started-at` aligns its independent recording clock. These are documented support boundaries, not probes of this workstation. (`skills/delivery/record-evidence/references/device_setup.md:67-79`)

A supervisor owns the recorder. Stop requests finish it gracefully rather than signaling a bare PID; lost supervision and untracked recorders require explicit handling. `finalization_failed` can be retried without stopping twice. Missing overlays can leave a video with assertions retained in the report; missing actuators or prohibited data produce `untested` with reasons. Only when nothing can record does the skill fall back to numbered stills, a capture script, and the same report table. (`skills/delivery/record-evidence/SKILL.md:58-60`, `skills/delivery/record-evidence/SKILL.md:74-74`, `skills/delivery/record-evidence/SKILL.md:106-117`, `skills/delivery/record-evidence/SKILL.md:137-148`)

Task sessions live under `evidence/<session>/` with raw capture, `events.jsonl`, `manifest.json`, `report.md`, rendered MP4, and review frames. A separate numbered receipt records revision, session paths, worst test result, video times, caveats, and posting destinations. Recordings are excluded from commits; the receipt is committed. Upload success requires reopening the posted video and confirming playback. (`skills/delivery/record-evidence/SKILL.md:22-26`, `skills/delivery/record-evidence/SKILL.md:129-135`, `skills/delivery/record-evidence/references/evidence_template.md:9-35`)

#### Testing patterns

`test_evidence.py` uses temporary synthetic/imported media. It checks annotation/report/timing behavior, rerendered caveats, composite tallies, and invalid input rejection. Its import test explicitly expects verified media with a failed assertion. It requires ffmpeg/ffprobe; this Python suite is not explicitly invoked by the package's aggregate test command. (`skills/delivery/record-evidence/scripts/test_evidence.py:36-132`, `package.json:18-23`)

### 2. Video inspection samples timestamped images; verified is a media property

`verified` is computed from ffprobe output with positive duration and width. It is not a judgment of assertion truth, a semantic defect finding, or proof of posted playback. The manifest separately retains events, assertion/test tallies, timing information, warnings, and this media flag. (`skills/delivery/record-evidence/scripts/evidence.py:1965-2001`)

Timing retains both `adjusted_t` and `video_t`, with capture-start correction and title-card shift. Sparse mobile capture may hold a missing static tail; long missing tails and segmented Android gaps become warnings. Re-rendering or external offset correction changes presentation alignment, not the recorded app behavior. (`skills/delivery/record-evidence/scripts/evidence.py:1784-1793`, `skills/delivery/record-evidence/scripts/evidence.py:1855-1905`, `skills/delivery/record-evidence/scripts/evidence.py:2089-2104`)

| Command | Inspection material | Boundary |
| --- | --- | --- |
| `frames` | PNGs from rendered video, with event time/message/result/pane | Default samples are assertion and test-start events, delayed 0.6 seconds. This is not continuous inspection. |
| `pair` | Labeled raw before/after stills selected by seconds, event index, or image files | Presents two images; it does not calculate a visual difference or judge a fix. |
| `render` | New presentation from retained raw capture/events | Does not repeat application actions. |
| `compose` | Wall-clock-aligned multi-surface recording with per-pane events and shared narration | Presents captures together; does not establish equivalent behavior across devices. |

The extraction implementation returns only successfully written frames; the default filter/delay is explicit. Pair resolves raw moments and builds a labeled image. Compose's documented alignment and tally behavior remain presentation operations. (`skills/delivery/record-evidence/scripts/evidence.py:2110-2143`, `skills/delivery/record-evidence/scripts/evidence.py:2563-2568`, `skills/delivery/record-evidence/scripts/evidence.py:2149-2158`, `skills/delivery/record-evidence/scripts/evidence.py:2171-2249`, `skills/delivery/record-evidence/SKILL.md:119-127`)

The prescribed reviewer opens every extracted PNG and confirms that state and label are visible. Narration, test chip, and toast must agree with the screen. The inspected manifest/receipt schemas have no separate per-frame review verdict or semantic detector output. (`skills/delivery/record-evidence/SKILL.md:110-117`, `skills/delivery/record-evidence/references/narration_guide.md:43-43`, `skills/delivery/record-evidence/scripts/evidence.py:1967-2001`, `skills/delivery/record-evidence/references/evidence_template.md:1-35`)

Related live inspection does not read video pixels: `test-app` records expected/observed screen text or native hierarchy, then grades those rows. `jev-ui` excludes screenshots and recordings from JEV state and requires independently observed non-editable postconditions. Its generic controller does not start recording. (`skills/delivery/test-app/SKILL.md:26-40`, `skills/delivery/jev-ui/SKILL.md:10-14`)

Evidence of non-UI behavior can instead be measured probe output, rendered frames with pixel assertions, or tool-call transcripts. For bug fixes, the recording skill requires capturing the original failure before the fix and showing or referencing it beside success. (`skills/delivery/record-evidence/SKILL.md:150-164`)

#### Testing patterns

The recorder suite checks frame extraction and presentation dimensions, not whether application pixels prove the caller's assertion. Related `jev-ui` tests reject editable input echo as completion and preserve failed assertions or blocked finalization. They inject controller/recorder behavior, so they do not themselves prove live playback or native capture. (`skills/delivery/record-evidence/scripts/test_evidence.py:58-84`, `skills/delivery/jev-ui/scripts/test-acceptance.mjs:18-55`)

### 3. Findings already cross artifact-backed repair loops

| Existing path | Persisted feedback | Continuation and stopping rule |
| --- | --- | --- |
| `record-evidence` | `evidence` receipt and reports with failed tests/times/caveats | Failure hands to `iterate-implementation` with the plan; passed or untested hands to `describe-pr`; standalone recording ends without another phase. |
| `review-code` → `fix-code-review` | Pinned review scope; critical/major finding IDs, location, failure evidence; fixer disposition | Each required finding is fixed, declined with evidence, or blocked. A fresh review follows even after every fix. |
| `reproduce-bug` → `fix-bug` | Observed/expected behavior, failing command/test, cause, short fix steps | At most three distinct reproduction attempts; not-reproduced records missing inputs, not a guessed cause. Fix makes the reproduction pass. |
| `test-app` → `iterate-implementation` | Step ID, action, expected/observed, severity, expectation source | Failed observations become repair feedback; a rerun repeats every charter step. Missing launch/control prerequisites are blocked. |
| `verify-implementation` → `iterate-implementation` | Repository checks, test-strength review, acceptance expectations and quoted output | Code-caused failure remains failed; external missing prerequisites are blocked. Reruns repeat every item. |

Recording handoffs are explicit in its final-response contract. Review repair requires focused checks and a new review, rather than treating a completed fixes receipt as a clean review. (`skills/delivery/record-evidence/SKILL.md:174-178`, `skills/delivery/fix-code-review/SKILL.md:18-38`)

Reproduction distinguishes failing evidence from unsuccessful attempts; the fixer follows the saved steps and retains a test reproduction as regression coverage. (`skills/delivery/reproduce-bug/SKILL.md:18-31`, `skills/delivery/fix-bug/SKILL.md:14-19`)

App and verification templates preserve expected/observed/source evidence rather than only a success summary. Their rerun instructions revise the existing artifact in place and repeat all items. (`skills/delivery/test-app/references/app_test_template.md:19-37`, `skills/delivery/verify-implementation/references/verification_template.md:20-40`, `skills/delivery/test-app/SKILL.md:18-18`, `skills/delivery/verify-implementation/SKILL.md:18-18`)

Review reads previous required finding identifiers/titles, then decides their disposition from the current diff and recorded fixer reason. Still-open findings receive new IDs. Critical/major severity gates the fix round; lower-severity advisories do not prevent clean status. (`skills/delivery/review-code/SKILL.md:26-26`, `skills/delivery/review-code/SKILL.md:42-49`)

Optional Atomic orchestration adds stricter proof identity: generation, code revision, and artifact hash must match. Mutating phases advance generation, invalidating earlier verification/app-test/review proof; current failed verification and app-test artifacts become fully-read repair feedback. (`atomic/lib/controller.mjs:170-186`, `atomic/lib/controller.mjs:227-251`)

Its routing order is enabled independent verification, enabled app testing, clean code review, PR description, then completion. Failed proof routes to repair, blocked proof stops, and absent/currently invalid proof is collected again. Recording is absent from the controller's closed skill map; the phase table labels it a by-hand phase. (`atomic/lib/controller.mjs:116-132`, `atomic/lib/controller.mjs:9-20`, `workflows/delivery.md:168-168`)

Manual and controller contracts are not identical. Terminal `iterate-implementation` hands to `describe-pr`, whereas controller routing enforces its proof chain. Standalone verification permits passed status with documented untested items; Atomic's parser rejects a passed verification/app-test unless every actual table row is pass. (`skills/delivery/iterate-implementation/SKILL.md:57-72`, `skills/delivery/verify-implementation/SKILL.md:32-35`, `atomic/lib/artifacts.mjs:46-55`)

Stages use fresh contexts and require a new or revised artifact, not conversational success. Unchanged implementation checklists produce persisted recovery evidence. The controller bounds all stages, repairs included, with `max_steps`; unfinished work at the bound is blocked. (`atomic/lib/controller.mjs:227-251`, `atomic/lib/artifacts.mjs:102-105`, `atomic/workflows/delivery.ts:166-171`)

General gate policies are `all`, `plan`, `pr`, and `none`; `none` avoids human UI but does not bypass failed evidence or missing prerequisites. Native pause/quit/resume preserves task/worktree state; quit is a graceful pause. (`workflows/delivery.md:72-92`) 

#### Testing patterns

`tests/atomic-controller.test.mjs` covers persisted no-progress recovery and stale proofs, requires reproduced status before fixing, and rejects passed verification with unreachable or unknown verdicts. These are source-defined helper tests, not proof of a live Atomic run. (`tests/atomic-controller.test.mjs:62-110`, `tests/atomic-controller.test.mjs:167-188`)

### 4. Checks distinguish execution evidence from claims and preserve failures

The aggregate package command runs static validation, plugin synchronization checking, Node tests, and the `jev-ui` acceptance test file. Live OMP evaluations are a separate command. Documentation explicitly separates offline checks, live skill scenarios, and optional Atomic runtime evidence. (`package.json:18-28`, `docs/testing.md:3-23`)

Independent verification derives repository checks from manifests and CI, resolves required command arguments before grading, and records each execution's output. It inspects changed tests for weakened assertions or avoided failing inputs. Neither receipts nor a passing CI badge substitute for current-session evidence. (`skills/delivery/verify-implementation/SKILL.md:20-30`)

The evaluation harness snapshots fixtures and shared guides, runs fresh OMP phase sessions in throwaway repositories, and retains prompts, answers, stderr, artifacts, and grades. Scenarios check source-backed claims, handoffs, unchanged prior artifacts, and focused valid artifact commits. The fixture is the only codebase an artifact may describe. (`docs/testing.md:59-65`)

Representative failure-to-check records establish how this collection has changed its guardrails:

| Recorded observation | Current rule or change | Evidence boundary |
| --- | --- | --- |
| Research handoffs could omit the required artifact or execution location | Released change adds artifact-argument inventory and nonempty location-bearing handoff checks | Changelog states the change; a retained research eval failed the immediate preamble check. No new replay occurred. |
| Independent verification created untracked build/recording output inside product source | Revision guard detects the changed tree; retention guidance preserves newly generated evidence byte-identically under task evidence | Failed attempts remain failed; cleaning the tree does not establish its earlier fingerprint. |
| Fresh attempt IDs changed completed workspace checkpoint identity | Workspace checkpoint arguments no longer contain attempt ID; cached output retains ownership | Retained later continuation proves narrow internal replay, not full delivery or cached-child replay. |
| Repair needed current failed verification/app-test findings | Required feedback includes current failures and excludes stale proofs | Retained native repair worker fixed a padded channel selector; this proves the repair-input contract, not an entire workflow route. |

The changelog records artifact-argument and execution-location guards. The saved research grade records failure of the required location-bearing preamble check. (`CHANGELOG.md:41-47`, `evals/results/20260919-035059/summary.json:18-24`)

The runtime records explicitly connect generated-output failures, replay identity, and repair feedback to their handling. The release notes preserve the corresponding retention, feedback, and checkpoint changes. (`docs/testing.md:50-55`, `CHANGELOG.md:19-21`)

A retained `verify-required-arguments` run records one successful verification phase in 261 seconds. Its scenario requires the supported `npm run build -- RUNTIME=node` invocation and live output `dist/runtime.txt` containing `built for node`. This proves the exercised command-discovery scenario, not evidence relocation or full controller delivery. (`evals/results/20260919-170601/summary.json:3-13`, `evals/scenarios/verify-required-arguments.mjs:17-35`, `docs/testing.md:67-73`)

Full-controller end-to-end delivery across every route and durable control remains documented as unverified. (`docs/testing.md:57-57`)

No dedicated `record-evidence` live scenario was found among the inspected `evals/scenarios/` files. Existing Python recorder tests and Node recorder-consumer tests remain separate evidence.

#### Testing patterns

Recorder-consumer tests defend independent outcome checks, failed-assertion preservation, identity/model metadata, and non-green finalization. The documented installer tests use temporary homes and projects. These mechanisms cover bounded contracts; synthetic recordings and injected recorder results do not prove a real app behaved correctly. (`skills/delivery/jev-ui/scripts/test-acceptance.mjs:18-55`, `docs/testing.md:13-23`)

### 5. Design-system discovery is required, but no application's values are known

Research-question instructions explicitly require discovering the design system/component library/token layer, color tokens or literal hex colors, typography, spacing, radius, elevation, layout, responsiveness, theming hooks, CSS variables, framework utilities, and visual regression assets. This applies even when frontend details are vague. Accessibility and interaction work also trigger it. (`skills/delivery/create-research-questions/SKILL.md:31-31`)

PRD mockups must use the product's colors, type, spacing, components, and theming. If research lacks these facts, the skill calls for design-system analysis before mockups. These are discovery obligations, not known values for this task. (`skills/delivery/create-prd/SKILL.md:47-47`)

The request names no application, screen, framework, recording, or defect. Accordingly, no component library, palette/hex values, typography or spacing scale, radius/elevation scale, breakpoints, theme hooks, utility framework, accessibility conformance target, or visual baseline can be attributed to a target app here. (`.agents/tasks/i-want-do-something/task.md:15-23`)

The HTML explanation template demonstrates collection-owned styling: dark CSS variables such as `--bg:#16181f`, system fonts, square corners, and an 850px grid breakpoint. Its owning skill uses it for focused conceptual visuals beside the artifact. These values are not product design authority. (`skills/delivery/create-design-discussion/references/artifact_template.html:6-23`, `skills/delivery/create-design-discussion/SKILL.md:18-18`)

Interface review explicitly covers accessibility, keyboard/pointer operation, responsiveness, and screenshot/manual evidence. Screen-text inspection and retained screenshots support this process; neither establishes comprehensive accessibility conformance or a visual-regression baseline. (`skills/delivery/review-code/SKILL.md:38-38`, `docs/app-testing.md:9-12`, `docs/app-testing.md:40-47`)

#### Testing patterns

Searches in current skills, shared guides, docs, tests, scenarios, and the root manifest found no named WCAG level, axe integration, Storybook/Tailwind configuration, or golden-image comparison implementation. No design-system discovery test was located. Recorder image tests cover helper output, not product visual fidelity. This absence statement excludes external installations, target applications, and unrelated task history.

### 6. Canonical skills install independently; orchestration is an explicit addition

Skill discovery recognizes direct `skills/<name>/SKILL.md` and grouped `skills/<group>/<name>/SKILL.md`, with unique flattened names. Selected skill directories are recursively copied, preserving sibling scripts and references. Portable installation keeps canonical content; runtime builds insert adapter notes after the shared line-six links. (`scripts/lib/layout.mjs:1-50`, `scripts/lib/build.mjs:70-99`, `scripts/install.mjs:359-373`)

Runtime builds support Claude Code, Codex, OMP, and Pi. Worker names use the `agent-` prefix: Claude/OMP receive Markdown definitions, Codex receives TOML and config snippets, and Pi has no generated worker format. Codex skills also receive `agents/openai.yaml`. (`scripts/lib/build.mjs:15-18`, `scripts/lib/build.mjs:101-119`)

Installer destinations distinguish global and project scope: portable/Codex skills use `.agents/skills`, Claude uses `.claude/skills`, OMP uses its `.omp` paths, and Pi uses `.pi`. Project Codex omits worker/config installation. Selected-path operations preserve unrelated skill/config state; uninstall removes requested skills rather than automatically removing dependency-expanded skills. (`scripts/install.mjs:146-169`, `scripts/install.mjs:276-334`)

The explicit dependency map currently installs `typed-judgment` and `record-evidence` with `jev-ui`. Optional `--atomic` requires the complete collection and writes canonical portable skills plus the workflow tree. A top-level `skills-delivery.mjs` discovery entry re-exports the nested workflow. Ordinary installation adds no orchestration dependency. (`scripts/install.mjs:32-39`, `scripts/install.mjs:181-215`, `scripts/install.mjs:335-350`)

Plugin synchronization separately derives its non-worker skill list and generated `agents/` definitions from canonical discovery. `--check` reports drift without applying changes. Manual skills remain independently invocable, and printed handoff fences are not executed by the controller. (`scripts/sync-plugin.mjs:18-63`, `shared/CONVENTIONS.md:5-9`, `shared/CONVENTIONS.md:108-114`)

Mechanical validation expects 43 skills, exact name/description frontmatter, shared links on line six, existing referenced templates, declared answer inventory, and valid handoff targets/arguments/location. It also checks workflow mentions, the phase-table header, and static Atomic registration. Generated-tree validation expects the complete canonical inventory, unlike selected installation. (`scripts/validate.mjs:19-25`, `scripts/validate.mjs:287-338`, `scripts/validate.mjs:350-387`, `scripts/validate.mjs:509-553`)

The integration guide requires a canonical skill and references, a phase-table row, independent invocation, and artifact-first replies. Controller integration is separate and applies only when the workflow should invoke the skill. Its static registration/import boundary is not live stage execution proof. (`docs/testing.md:75-82`, `docs/testing.md:25-36`)

#### Testing patterns

Installer tests cover independent selected installation, unrelated-resource preservation, full-collection Atomic selection, scoped uninstall, and copied sibling resources. The `jev-ui` installed-resource test exercises its CLI/module with injected behavior outside the repository; it is not a live device/provider test. (`tests/install.test.mjs:91-116`, `tests/install.test.mjs:148-190`, `tests/install.test.mjs:224-261`)

## Code References

The following is a representative map of the researched area, not every collection file. Detailed findings above provide claim-level line references.

| Subsystem | Primary sources and supporting resources |
| --- | --- |
| Capture and inspection | `skills/delivery/record-evidence/SKILL.md`; `scripts/evidence.py`, `scripts/test_evidence.py`; `references/device_setup.md`, `narration_guide.md`, `evidence_template.md`, and the three evidence answer templates beneath that skill |
| Review and repair | `skills/delivery/{review-code,fix-code-review,reproduce-bug,fix-bug,iterate-implementation}/SKILL.md`; sibling review, fixes, reproduction, fix, and implementation templates |
| Live app and independent verification | `skills/delivery/{test-app,verify-implementation}/SKILL.md`; their receipt/status templates; `docs/app-testing.md`; `docs/verification.md`; `skills/delivery/jev-ui/SKILL.md` and `scripts/test-acceptance.mjs` |
| Optional routing | `atomic/workflows/delivery.ts`; `atomic/lib/{controller,artifacts,workspace}.mjs`; `workflows/delivery.md`; `tests/atomic-controller.test.mjs` |
| Checks and retained observations | `package.json`; `scripts/validate.mjs`; `docs/testing.md`; `evals/run.mjs`; `evals/scenarios/verify-required-arguments.mjs`; cited `evals/results/` summaries; `CHANGELOG.md` |
| Visual discovery | `skills/delivery/create-research-questions/SKILL.md`; `skills/delivery/create-prd/SKILL.md`; `skills/delivery/create-design-discussion/references/artifact_template.html` |
| Packaging and portability | `scripts/lib/{layout,build}.mjs`; `scripts/{install,sync-plugin}.mjs`; `runtimes/`; `.claude-plugin/plugin.json`; generated `agents/`; `tests/install.test.mjs`; `shared/CONVENTIONS.md` |

## Architecture Documentation

The evidence boundary is split across three layers: live interaction supplies observations, media tooling persists/presents them, and delivery artifacts carry findings into separate repair/verification phases. Sections 1–3 describe their current contracts; none makes the recorder a semantic judge.

`workflows/delivery.md` owns optional routing and manual chains; `shared/CONVENTIONS.md` owns artifacts, invocation, commits, and fresh-session handoffs. `docs/testing.md` owns the distinction between static contracts, live skill scenarios, and runtime evidence. This research selects neither a new skill nor an enhancement to an existing one.

## Open Questions

None within the seven current-state questions. Missing target-application facts and unexercised runtime behavior are explicit scope limits, not inferred implementation requirements.
