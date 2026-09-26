# @marktripoli/skills

## 4.1.0

### Minor Changes

- [#112](https://github.com/MarkTripoli/skills/pull/112) [`e36116d`](https://github.com/MarkTripoli/skills/commit/e36116dfb71a1db02eeac5c3930cc5263456f230) Thanks [@Triippz](https://github.com/Triippz)! - Add optional First Sergent quota-aware routing and a fail-closed context boundary. OMP-native usage filtering runs before Jev when explicitly enabled, but does not reserve capacity or select a login; external agent-router launch remains blocked where worktree or account binding cannot be proven. A strict 60% context policy requires a live child metric and stops before Atomic dispatch because that metric is not exposed.

  Add an optional First Sergent choice at `/deliver` start. Opted-in delivery uses a chat liaison with the native Atomic controller or delegated fresh manual workers, while declined and default oneshot requests retain the existing delivery path. Document gate feedback, artifact-backed continuation, model routing, and transport limits.

- [#111](https://github.com/MarkTripoli/skills/pull/111) [`52d7896`](https://github.com/MarkTripoli/skills/commit/52d7896d6ebc3c518622c5f603b12eed69df183c) Thanks [@Triippz](https://github.com/Triippz)! - Add the video-iterative development and orchestration skills plus an agent Slack control-plane skill, and update the personal install and quick-start guides to make them discoverable.

### Patch Changes

- [#109](https://github.com/MarkTripoli/skills/pull/109) [`732c9e1`](https://github.com/MarkTripoli/skills/commit/732c9e14f9760a9c75deb66a924dca1c3b192668) Thanks [@Triippz](https://github.com/Triippz)! - The slack-coordinator skill now lives at `skills/slack-coordinator`, beside the delivery group. Delivery skills may use it, and none of them require it.

## 4.0.0

### Major Changes

- [#36](https://github.com/MarkTripoli/skills/pull/36) [`338aa70`](https://github.com/MarkTripoli/skills/commit/338aa70e027769af90768433a01e07a35ffa2371) Thanks [@Triippz](https://github.com/Triippz)! - Initialize new tasks with semantic artifact indexes and immutable iterations, support repository-configured task roots without migrating legacy tasks, install the portable index helper beside every skill, and require Atomic stages to register their output iterations.

### Minor Changes

- [#89](https://github.com/MarkTripoli/skills/pull/89) [`15dafeb`](https://github.com/MarkTripoli/skills/commit/15dafeb9fd3c9e9170d767590f679458a363332b) Thanks [@Triippz](https://github.com/Triippz)! - slack-coordinator runs queued owner DM requests through the configured agent, three at a time: the dispatcher writes `prompt.md` (with the embedded assistant skill text) and an empty `messages.jsonl` into the run directory, edits a `Queued behind` ack to `Working on it` when the run starts, and on a clean exit replaces the ack with the agent's answer (or posts a long answer under a `Done` ack); a non-zero exit, timeout, or empty result marks the run `failed` and leaves the ack alone.

- [#81](https://github.com/MarkTripoli/skills/pull/81) [`71681a0`](https://github.com/MarkTripoli/skills/commit/71681a00098826cb4afbc8adef77df4c89e383b0) Thanks [@Triippz](https://github.com/Triippz)! - slack-coordinator answers a non-owner's first DM with one refusal naming the owner, records the sender in `refused_users`, and drops their later DMs silently.

- [#74](https://github.com/MarkTripoli/skills/pull/74) [`fba7982`](https://github.com/MarkTripoli/skills/commit/fba7982438ff36f7dcf470a0723407ed0c01de00) Thanks [@Triippz](https://github.com/Triippz)! - Remove `run start --owner` from slack-coordinator; every run's owner is the `setup --owner` value the daemon holds.

- [#105](https://github.com/MarkTripoli/skills/pull/105) [`367e1ec`](https://github.com/MarkTripoli/skills/commit/367e1ec89009c972c6ce77e9f2b4b2ebe68a3b9e) Thanks [@Triippz](https://github.com/Triippz)! - Add owner DMs, standing tasks, and `onboard` to the Slack coordinator.

- [#39](https://github.com/MarkTripoli/skills/pull/39) [`f1309ee`](https://github.com/MarkTripoli/skills/commit/f1309eededc5a4c482f4c4dfbb5eeb70cb5130a0) Thanks [@Triippz](https://github.com/Triippz)! - Add the slack-coordinator daemon, CLI, and agent skill for one Slack thread per run with owner steering.

### Patch Changes

- [#108](https://github.com/MarkTripoli/skills/pull/108) [`489de5e`](https://github.com/MarkTripoli/skills/commit/489de5eb39f98ea331335925890cac7bd41195af) Thanks [@Triippz](https://github.com/Triippz)! - Document Slack coordinator install, service maintenance, and the agent-to-daemon contract.

- [#38](https://github.com/MarkTripoli/skills/pull/38) [`2b7705f`](https://github.com/MarkTripoli/skills/commit/2b7705f371702f32ab8ad4086fec83a7a77a9d52) Thanks [@Triippz](https://github.com/Triippz)! - Slice future work into granular, reviewable pull requests: add an advisory size-signal pre-check to
  shared/SLICING.md, make create-plan a slicing-guide follower with a per-phase four-tests re-check,
  add the size signal and a prefer-shared-contract-over-depends_on rule to create-epic-plan, reference
  the size signal in create-structure-outline, and cite the guide when start-epic-delivery re-validates
  a materialized slice.

## 3.3.0

### Minor Changes

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`797751f`](https://github.com/MarkTripoli/skills/commit/797751f70460f6fbb3842425e36631907745a093) Thanks [@Triippz](https://github.com/Triippz)! - Add `iterate-evidence`, an independently installed companion to `record-evidence` for authorized, bounded recorded-pixel inspection and repair. Preserve findings, source and media identities, round history, checks, and current-revision coverage in one receipt. Selected installation includes the recorder without Atomic.

- [#34](https://github.com/MarkTripoli/skills/pull/34) [`81db0c2`](https://github.com/MarkTripoli/skills/commit/81db0c25365d4f2493d06f47de9b775495fc43ee) Thanks [@Triippz](https://github.com/Triippz)! - Add the Safety Dance local Git gate tool and canonical operating skill.

### Patch Changes

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`22f08b2`](https://github.com/MarkTripoli/skills/commit/22f08b21ca3b275f108bb4aa977ee13094337143) Thanks [@Triippz](https://github.com/Triippz)! - Compress iterate-evidence guidance and related documentation without changing behavior.

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`bb6fb3c`](https://github.com/MarkTripoli/skills/commit/bb6fb3c78d6dee555c190737de58a648a20c42af) Thanks [@Triippz](https://github.com/Triippz)! - fix(iterate-evidence): require bare image payload reads

  Clarify iterate-evidence inspection instructions and eval guidance so required frame evidence binds to returned image bytes through bare retained image-path reads or bare video timestamp reads. `?q=` image questions are text-only interpretation and must be paired with a bare binding read of the same retained sample.

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`7768147`](https://github.com/MarkTripoli/skills/commit/7768147382f2ff6ad8ba3a1920736098dd8a6633) Thanks [@Triippz](https://github.com/Triippz)! - Prove bounded recorded-evidence repair with real OMP no-progress, zero-limit, three-productive-round, and fresh-receipt continuation scenarios. Retain worker and interrupted-session traces, source histories, recordings, and independently inspected image identities for saved grading.

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`4751d7f`](https://github.com/MarkTripoli/skills/commit/4751d7f5a8de59e36c9415188e3ed1a51868c7e5) Thanks [@Triippz](https://github.com/Triippz)! - Add live `iterate-evidence` evaluations for unavailable viewing and recorded pixels that contradict passed labels. Retain isolated capability restrictions, real denied reads, unchanged source histories, external baseline media, and independent pixel review before accepting either stopped outcome.

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`5f83811`](https://github.com/MarkTripoli/skills/commit/5f838119b2db570338686b0379cc49db846d5ed2) Thanks [@Triippz](https://github.com/Triippz)! - Wait for real initial video frames before counter interactions. Strengthen evidence grading for image bytes, consumed reservations, default limits, and flow identity; attribute transient viewer output through observed process provenance rather than filename exceptions.

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`4fb0816`](https://github.com/MarkTripoli/skills/commit/4fb0816bac30c9ad46316ab09b931dec982049fe) Thanks [@Triippz](https://github.com/Triippz)! - fix(iterate-evidence): structural reserved, reservation gate, frame self-check

  F_NEW_PRIM: replace last-completed-step positive list in reserved() with structural rule —
  accept any wording unless it explicitly declares the repair completed/done/resolved/finalized.
  Parenthetical and prose forms (e.g., "reservation (consumed_rounds set to 1...)") accepted;
  "repair completed" and "repair done" rejected.

  F_CONT_V7: add reservation write checkpoint hard gate to SKILL.md step 4.1 — after writing
  all reservation fields, save the receipt, read it back, confirm consumed_rounds before any
  source/check edit or worker delegation; add "Reservation persisted before any edit: yes"
  field to round record template; repeat gate in step 5 for continuation.

  F_3R_BRESET: add frame completion self-check to SKILL.md steps 3 and 4.4 — before writing
  any coverage or inspection row, enumerate every required frame (1 initial-zero + 1 per flow),
  count them, and confirm the count matches; add self-check table to round history template.

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`53be916`](https://github.com/MarkTripoli/skills/commit/53be916adf6506cfd4aea78daaebbff429791160) Thanks [@Triippz](https://github.com/Triippz)! - fix(iterate-evidence): structural pending, concurrent lifetime, :Ts

  pending(): remove includes()/exact-equality positive list; strip
  parenthetical/bracketed annotations before evaluating step wording; a
  step qualifies if it mentions repair or diagnos\*; rejected only when
  it explicitly declares repair completion. Table row handler updated to
  structural repair mention and non-terminal state checks.

  viewerTemporaryProof: bind temp-file lifetime to the owning read;
  appearances in concurrent in-flight reads (reads whose start snapshot
  precedes the owning read's end) are authorized regardless of boundary
  type; non-concurrent appearances past owner's end still rejected; make
  the seconds suffix optional in the timestamp regex so both
  'video:3.297s' and 'video:3.297' are recognized as timestamp selectors.

  tests: 185/185. Add concurrent overlapping-reads regression. Add R11
  regressions for parenthetical next-incomplete-step accepted, non-repair
  next-incomplete rejected, finalized table state rejected.

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`d9fd7ca`](https://github.com/MarkTripoli/skills/commit/d9fd7ca2ecdb0b4e7c92bbd3bc4a38f945495e9f) Thanks [@Triippz](https://github.com/Triippz)! - fix(iterate-evidence): serialize media evidence reads

  Clarify iterate-evidence inspection guidance so every required bare image-path or video-timestamp read is a standalone sequential viewer call, and recognize action-labelled counter flow IDs such as `F-INC Add one once from zero` without weakening conflict-closed coverage parsing.

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`1fde8be`](https://github.com/MarkTripoli/skills/commit/1fde8bed742c4fabd1b179ac5a72e40c8b1b5902) Thanks [@Triippz](https://github.com/Triippz)! - fix(iterate-evidence): F1 frontmatter append-only + initial-zero frame; F2 quoted action labels; F3 structural continuation pause

  F1: SKILL.md and receipt template now explicitly require frontmatter to be updated in place (never collapse existing fields including `type` and `limit`); both baseline and repair passes now require an initial-zero state frame opened as a separate named viewer call before any action.

  F2: `actionFlow()` in `evals/evidence-flows.mjs` strips matching surrounding quotes (single, double, backtick) from charter action labels so `Click "Add one" once`, `Click 'Reset'`, and backtick forms resolve to the same flows as unquoted forms. Regression tests added for quoted, mixed, and unknown-quoted forms.

  F3: Continuation pause predicate in `evals/iterate-evidence.mjs` now locates the receipt by filename pattern (`NN-evidence-iteration-*.md`) rather than `newest(..., "evidence-iteration")`, which required `type: evidence-iteration` in frontmatter. Validation uses `activeReservation` — the same structural predicate the grader uses — so a missing or misspelled `type` field no longer causes the pause to report `valid: false`. Retained control scripts `primary-controls-final.mjs` and `retained-controls-final.mjs` now accept an optional output directory argument to avoid EEXIST on re-run.

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`19b4b39`](https://github.com/MarkTripoli/skills/commit/19b4b39d86cf34b43e5431a11d6ff916be2220a1) Thanks [@Triippz](https://github.com/Triippz)! - fix(iterate-evidence): R6 structural fixes for reservation step fields, grader scoping, answer link form, and worker commit guidance

  **activeReservation (evals/iterate-evidence.mjs)**: The combined "current step / last completed step / next incomplete step" handler no longer pushes false when parts.length===1. In that case the semicolon-split pattern already extracts labeled sub-lines ("last completed:", "next incomplete:") which are handled by the individual key handlers. Regressions added for the semicolon/colon form and the canonical three-labeled-lines form.

  **Continuation grader (evals/scenarios/iterate-evidence-continuation.mjs)**: IE-001 resolution is now read only from the `## Findings` section. Guardrail table rows that mention IE-001 no longer shadow a resolved Findings row. Regression added covering a guardrail-only IE-001 mention after a resolved Findings row.

  **Answer templates**: Both passed and stopped templates now show `[{artifact_file}]({artifact_link})` as the first line, making the markdown link form explicit and forbidding bare/backtick paths.

  **SKILL.md**: Step 4.2 now requires committing delegated source changes as a separate source commit before the receipt commit, even when the round yields no progress. Terminal delivery section now specifies the markdown link requirement for the artifact link. Delegation step is clear that tracked source files must not remain uncommitted.

  **Template (evidence_iteration_template.md)**: "Delivery and known limits" section replaces the combined "Current step / last completed step / next incomplete step" line with three explicit labeled lines as the canonical form.

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`8e5bb60`](https://github.com/MarkTripoli/skills/commit/8e5bb6095e0d2b00823752eb09898d3c7eb40cfc) Thanks [@Triippz](https://github.com/Triippz)! - fix(iterate-evidence): R7 enumerate allowed frontmatter values, forbid preamble, add continuation terminal rules

  SKILL.md section 5 (continuation): states that a resumed session applies the same terminal rules — allowed `status` and `stop_reason` values are enumerated explicitly; any other value (e.g. `completed`, prose) is invalid; the final answer must be the selected template filled verbatim with nothing before its first line.

  SKILL.md finalization section: adds a bolded "Allowed frontmatter values" block directly before the finalization steps, listing the only valid strings for `status` and `stop_reason` and explicitly calling out that any other value is invalid.

  SKILL.md terminal delivery sentence: clarifies "nothing appears before its first line" and "the markdown receipt link is the first character of the reply."

  Receipt template preamble: `status` and `stop_reason` descriptions now use pipe-separated exhaustive lists with an explicit "ONLY valid values; any other string is invalid" statement.

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`99e9cb0`](https://github.com/MarkTripoli/skills/commit/99e9cb0f97c9e7626a6beecda7dfde77109ff6f4) Thanks [@Triippz](https://github.com/Triippz)! - fix(iterate-evidence): R8 initial-frame structural binding (F4), reservation step recognition (F5), three-rounds min budget

  **F4 — initial frames now structurally bound to pre-click time:**

  - Both capture fixtures (`iterate-evidence` and `iterate-evidence-three-rounds`) add a 1-second dwell after `mark("initial")` so the video encodes at least one clean counter-zero frame before the first click.
  - `SKILL.md` steps 3 and 4 now require extracting the initial-zero frame at the manifest's `initial` action `videoTime` (from `capture.json`'s `actions` array) using an explicit timestamp selector (e.g., `read video.webm:Ts`); the recorder-generated `test_start` frame is explicitly forbidden as the initial-zero frame.
  - `inspection_acceptance.md` adds a dedicated bullet under timing rules: the initial-zero frame must be extracted strictly before the first click action's `videoTime`; name the file to include `initial` and cite the timestamp.
  - Grader (`reviewProblems`) now requires: (a) `baseline-initial` and `repaired-initial` frame filenames must contain `initial`; (b) when `capture.actions` is present, `rawTimestamp` must be strictly before the first non-initial action's `videoTime`.

  **F5 — `reservation` recognized as valid pending-repair current step:**

  - `activeReservation` individual `current step` handler now accepts `clean(value) === "reservation"` in addition to `pending(value)`.
  - Combined three-way key handler accepts `clean(parts[0]) === "reservation"` when `pending(parts[2])` (next incomplete step is repair).
  - Rejected when next step is not repair (individual `next incomplete step` handler pushes false).
  - Regressions added: two accepted forms (three-labeled-line and combined slash form with `reservation` current step + `repair` next step); two rejected forms (`reservation` with `checks` or other non-repair next step).

  **Three-rounds — per-scenario minimum budget:**

  - `iterate-evidence-three-rounds.mjs` declares `minMinutes: 45`.
  - `evals/run.mjs` computes `max(--max-time, scenario.minMinutes ?? 0)` before passing to `runEvidenceScenario`; the 25-minute CLI default no longer undercuts the proven three-rounds minimum.
  - `docs/testing.md` documents the `minMinutes` field and the three-rounds 45-minute requirement.

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`721afd6`](https://github.com/MarkTripoli/skills/commit/721afd6c6e8c4d5649d5e8ea310646df9bc7fc0a) Thanks [@Triippz](https://github.com/Triippz)! - fix(iterate-evidence): F_PRIM structural reservation rule, F_CONT uniform frame identity

  F_PRIM: replace activeReservation exact-match list with structural rule — pending repair holds
  when (a) next incomplete step names repair and (b) no declaration says repair is
  completed/done/resolved/finalized/terminal. Current step may be any reservation/reserved/pending/
  repair-pending wording. The combined slash line no longer pushes false when three labeled lines
  are present and consistent; when only the combined line exists, parse by position.

  F_CONT: make frame identity uniform across all consumers (reviewProblems, boundedEvidenceProblems,
  stoppedEvidenceProblems). An observation binds either a retained PNG/JPEG frame path or a video
  path with an explicit timestamp selector; both are verified through the returned image hash.
  Non-initial video timestamps must fall within the flow's action window.

  Receipt 16: add missing type:implementation frontmatter field.

  Regressions: 'reservation persisted', 'reserved', arbitrary current-step prose with next=repair
  accepted; 'repair completed' in any field rejected; video+timestamp form accepted; mismatched
  hash/timestamp rejected.

- [#33](https://github.com/MarkTripoli/skills/pull/33) [`45a4af9`](https://github.com/MarkTripoli/skills/commit/45a4af9e03308bf650033e21eef4a4bc9aa8c89c) Thanks [@Triippz](https://github.com/Triippz)! - Finalize evidence-iteration receipts with complete coverage, observed timestamps, and reconciled terminal state while retaining historical reservations. Resolve pending reservations and mapped counter actions consistently, and attribute native video-preview thumbnails through their returned contact sheet's process and read provenance.

## 3.2.1

### Patch Changes

- [#31](https://github.com/MarkTripoli/skills/pull/31) [`e0468a4`](https://github.com/MarkTripoli/skills/commit/e0468a4d76a7d0035991e5fdc1f15a351515cd9f) Thanks [@Triippz](https://github.com/Triippz)! - Add a portable Node route-model helper that chooses the cheapest adequate caller-supplied candidate through JEV, and make Atomic consume the shared policy. Document exact candidate contracts and Herdr model handoffs across supported harnesses. Add the model-invoked `/configure-model-routing` setup skill for one-question profile creation and helper verification.

## 3.2.0

### Minor Changes

- [#29](https://github.com/MarkTripoli/skills/pull/29) [`0396eb0`](https://github.com/MarkTripoli/skills/commit/0396eb0a2a523f761a4286a720ba40b3c4bad2d9) Thanks [@Triippz](https://github.com/Triippz)! - Add the explicitly selected iOS simulator surface to the standalone `jev-ui` skill: idb-backed adapter, disposable fixture, identity and cleanup checks, and documented integration, accepted through independent native UI observations.

## 3.1.0

### Minor Changes

- [#26](https://github.com/MarkTripoli/skills/pull/26) [`8cb65bc`](https://github.com/MarkTripoli/skills/commit/8cb65bc5a1cc98a7b87195ad05d938dfa261184d) Thanks [@Triippz](https://github.com/Triippz)! - Add the standalone `jev-ui` skill for bounded browser and Android emulator control. Live native use requires the documented external drivers and an explicitly selected target; model-backed runs require TypeSafe credentials and a configured text helper when text entry is needed.

## 3.0.0

### Major Changes

- [#23](https://github.com/MarkTripoli/skills/pull/23) [`69d03f0`](https://github.com/MarkTripoli/skills/commit/69d03f097dd20abcde7f829221c29c0828f1436b) Thanks [@Triippz](https://github.com/Triippz)! - Replace the repository's orchestration with the optional Atomic `delivery` workflow while preserving independently installable and usable skills in Claude Code, Codex, Oh My Pi, Pi, and portable mode.

  - Installation now defaults to selected skills and runtime workers only. `--atomic` explicitly adds the complete portable collection, workflow resources, and native discovery entry; project installs keep their skills local. Atomic itself is a separately installed runtime, not a dependency of ordinary skill use.
  - The dynamic controller uses fresh native stages and artifact-only handoffs, native human approval UI, bounded revision/repair sessions, and the existing typed-judgment helper for JEV decisions. Headless runs require `gates=none`; an explicit workflow selects a deterministic chain.
  - Remove obsolete workflow packs, generated runtime-specific orchestration, and the metrics integration without adding replacement telemetry. Earlier pending release notes describing the superseded orchestration are consolidated here.
  - Preserve task/artifact formats, manual skill invocation fences, published release history, existing task records, and owner-managed worktrees. Old engine checkpoints are not converted; continue from saved artifacts in a new Atomic run.
  - Verification resolves required command arguments and build targets from repository guidance before grading; an incomplete invocation is not treated as a product failure. Scratch cleanup preserves cited acceptance and reproduction evidence, including failed attempts. Newly generated runtime evidence accidentally written into product source is relocated byte-identically into task evidence before verification finishes; existing source, tests, outputs, and staged work remain untouched, and the failed check remains failed.
  - Repair phases receive current failed verification and app-test artifacts as required feedback alongside human feedback. Stale proofs are not promoted into required repair feedback, and artifact bodies are not duplicated into the prompt.
  - Keep workspace checkpoint arguments stable when Atomic resumes a failed run with a fresh attempt ID. The cached workspace retains its original run ownership. Existing pre-fix checkpoints are preserved rather than rewritten; continue those tasks from their saved artifacts in a new run.

  This is a breaking operation/install contract change. See the README and delivery workflow reference for native Atomic commands, current inputs, and migration ownership rules.

### Minor Changes

- [#19](https://github.com/MarkTripoli/skills/pull/19) [`fb95578`](https://github.com/MarkTripoli/skills/commit/fb9557890a3b709c425985e0996b42242923a043) Thanks [@Triippz](https://github.com/Triippz)! - New `herd-next` skill: inside Herdr, it opens the next delivery phase in its own pane with the handoff command staged, so continuing a task does not require copying a command into a new session by hand. Optional workflow handoffs use Atomic's native run connection instead of a repository-owned approval steward.

- [#16](https://github.com/MarkTripoli/skills/pull/16) [`f9114bf`](https://github.com/MarkTripoli/skills/commit/f9114bfb8f18ff9f2c6436f33f25ad1f4d408921) Thanks [@Triippz](https://github.com/Triippz)! - The typed-judgment helper retries rate limits and server errors inside `JUDGE_TIMEOUT` (`JUDGE_RETRIES`, default 2), names an oversized request instead of reporting a generic outage, and prints the model version and token counts of every answered call so a skill can record them beside the verdict. The five gate questions the review, verification, and bugfix loops route on now state their true/false boundary. `review-code` scores how far each of its five axes was examined with the new `axis-coverage` command and re-examines an axis that comes back asserted or skipped, and it carries the previous round's finding identifiers forward as fixed, still open, or declined.

- [#15](https://github.com/MarkTripoli/skills/pull/15) [`719d5c0`](https://github.com/MarkTripoli/skills/commit/719d5c0ec39ba75701acc7436c283cf63bdff6d4) Thanks [@Triippz](https://github.com/Triippz)! - A task run by hand now gets its own git worktree, matching the optional Atomic run's branch behavior. The conventions' new Task worktree section is the rule: a skill that opens the task directory first runs `git worktree add ~/.agents/worktrees/<repo>/<slug> -b <slug> <target>`, where `<repo>` is the main worktree's basename and `<target>` the merge target (pull request base, `task.md` `base:`, else the default branch), so the task branch forks from the base and not from whatever the session has checked out; it creates the directory there so `task.md` and every later commit land on the task branch, and reports the path. It is the default and no skill asks about it; the only cases that skip it are a session already on the task's branch, a task directory that already existed, a project that is not a git work tree, and the user asking for the current checkout in that session. `deliver`'s by-hand reply names the worktree and its branch.

- [#19](https://github.com/MarkTripoli/skills/pull/19) [`743bc73`](https://github.com/MarkTripoli/skills/commit/743bc73179ba286410cb8f7f719e37ce3ef76ffd) Thanks [@Triippz](https://github.com/Triippz)! - `typed-judgment/judge.mjs` reads the TypeSafe key from `~/.config/typesafe/api_key` (or the file `TYPESAFE_API_KEY_FILE` names) when `TYPESAFE_API_KEY` is not in the environment, so hooks and agent-spawned shells that do not inherit an interactive shell's exports can still use typed judgments.

### Patch Changes

- [#18](https://github.com/MarkTripoli/skills/pull/18) [`ace2bcb`](https://github.com/MarkTripoli/skills/commit/ace2bcb413530dbbf9234d6c374e4e76004fb253) Thanks [@Triippz](https://github.com/Triippz)! - `describe-pr` writes the pull request title as a Conventional Commits subject and checks it with `check-commits.mjs --title` before opening or retitling the pull request, so the `Commits` check no longer fails on a title over 72 characters. `check-commits.mjs` accepts `--title` on its own.

- [#24](https://github.com/MarkTripoli/skills/pull/24) [`a4153e8`](https://github.com/MarkTripoli/skills/commit/a4153e85856160f2c41b9bfe83bcb7bb46ba2a8b) Thanks [@Triippz](https://github.com/Triippz)! - Simplify the README, setup guides, workflow reference, and testing documentation with plain English and fewer repeated explanations. Keep exact commands, approval rules, saved-work protections, and known testing limits. Clarify that avoiding JEV routing requires both an explicit workflow and `model_routing=fixed`.

- [#14](https://github.com/MarkTripoli/skills/pull/14) [`5d12056`](https://github.com/MarkTripoli/skills/commit/5d120567082c0007f5ea38120983fca8096218fd) Thanks [@Triippz](https://github.com/Triippz)! - Handoff commands now reliably name the artifact the next phase acts on.

  - `create-research-questions` and `iterate-research-questions` hand off `/create-research @<file>` instead of a bare `/create-research`, so the research phase reads the questions just written rather than guessing and reaching for the wrong file.
  - `create-plan` now honors a `@file` argument (the design-discussion and TDD phases already passed one); its documented input resolves the named artifact before falling back to the newest design artifact.
  - Every create/iterate phase output instruction now tells the model to fill `{artifact_file}` with the saved file's name only and to add no prose around the command fence, closing the gap that let a reply invent a path or point at an unrelated file.
  - `scripts/validate.mjs` gains a guard: each forward handoff fence must carry `@<file>` when the next skill acts on that specific artifact, and must be bare when the next skill reviews the whole diff or resolves the newest artifact itself. The two cases are declared in `FENCE_ARTIFACT` and kept in sync with the answer inventory.
  - Every handoff now says where to run. The fixed sentence became `Open a new session in {run_location}, then run:`, a slot every forward answer template carries; each phase fills it from observed git state (`` `<root>` on branch `<branch>` `` in a work tree, `this checkout` otherwise), never a guess. The conventions require the next session to open in that same checkout and branch, because the committed task directory and each `@<file>` are branch-local. `scripts/validate.mjs` and the eval reply check now reject a handoff whose location slot is empty, so a locationless reply cannot ship. The by-hand `deliver` reply also states the branch it committed the task on.

- [#25](https://github.com/MarkTripoli/skills/pull/25) [`32e4e12`](https://github.com/MarkTripoli/skills/commit/32e4e12c4984edd164e7eb4ebbee4bf2b364c314) Thanks [@Triippz](https://github.com/Triippz)! - Lead the README with `npx skills@latest add MarkTripoli/skills` and examples for choosing agents and skills. Distinguish its installation scope and Node requirement from the repository installer. Fix the `reproduce-bug` description's YAML syntax so the skills installer discovers all 42 skills.

Published entries below describe their releases, including retired orchestration and metrics features. They are historical records, not current installation or operation instructions; use [README.md](README.md) and [workflows/delivery.md](workflows/delivery.md) for the current optional Atomic integration and independent skills.

## 2.1.0

### Minor Changes

- [#12](https://github.com/MarkTripoli/skills/pull/12) [`60467bf`](https://github.com/MarkTripoli/skills/commit/60467bf07d9e0062d5afabc5f894e12a2caca941) Thanks [@Triippz](https://github.com/Triippz)! - Add `gather-sources`, which fetches the external docs, specs, tickets, pages, and repositories a task names into a cited `sources` artifact that research, PRD, and TDD sessions read instead of fetching again; when the request converts an existing PRD or RFC, it hands off to `create-prd` or `create-tdd`, which now convert such a document in one pass without their interviews and leave what the source does not state as `Known limits` and `Verify` items. Add `npm run evals`, which runs the conversions and the full chain against a live model, one fresh session per phase.

  The structure-outline template names its sections `## Phase N`, as the skill and the implementation loop already do.

## 2.0.0

### Major Changes

- [#10](https://github.com/MarkTripoli/skills/pull/10) [`ce032f3`](https://github.com/MarkTripoli/skills/commit/ce032f3b8f17264c4c56f327dc392fa94825ed3c) Thanks [@Triippz](https://github.com/Triippz)! - Make delivery replies state whether work has started, label real next commands, and remove misleading `/show-me` terminal sentinels.

## 1.0.0

### Major Changes

- [#7](https://github.com/MarkTripoli/skills/pull/7) [`9188e12`](https://github.com/MarkTripoli/skills/commit/9188e12a489bf1d7c9a17ad25015052bfc54b6d7) Thanks [@Triippz](https://github.com/Triippz)! - The delivery workflow now runs on Archon. Seven packs under `.archon/workflows/delivery/` (`delivery-full`, `delivery-lean`, `delivery-prd`, `delivery-oneshot`, `delivery-bugfix`, `delivery-epic`, `delivery-resolve-reviews`) drive the chain with fresh-session nodes and approval gates; `.archon/workflows/delivery-omp/` is the generated Oh My Pi flavor (`node scripts/build-packs.mjs`). The in-house orchestrator is retired: the `run-task`, `start-task`, `review-loop`, `setup-worktree`, and `configure-workspaces` skills, the Oh My Pi and Pi `run-task` extensions, the simulator, and the eval harness are removed. New skills `reproduce-bug` (artifact type `reproduction`) and `fix-bug` (artifact type `fix`) open the bugfix chain before review and pull request description. Worktrees, reply files, `with:` phases, and `max_depth` are gone from `task.md` and the conventions; `workflow` accepts `full`, `lean`, `prd`, `oneshot`, `bugfix`, `epic`. Every skill's handoff sentence is now "Start the next phase in a new session; continuing in this session carries this phase's context into the next one."; skills still run by hand in a fresh session. The installer writes the packs to `~/.archon/workflows/` and the portable skills to `~/.agents/skills/`. Requires Archon 0.10 or later.

  - `gates` input on every pack except `delivery-resolve-reviews`: `all` (default), `none`, or a comma list of the pack's gate names (full `design,plan,phases,pr`; lean `outline,phases,pr`; prd `prd,tdd,plan,phases,pr`; oneshot `pr`; bugfix `reproduce,pr`; epic `plan`). A gate that is off runs its create skill once; implementation phases run back to back until the plan has no unchecked box; the bugfix pack tries up to four reproduction sessions, then cancels the run with a pointer to the artifact's `## Missing` list. An unknown name fails the run at node `gates`.
  - Optional `scripts/metrics.mjs` exports read-only Archon run metrics to Prometheus text, an OTLP gateway (Grafana Cloud's, verified with a live stack: `OTLP_ENDPOINT`, `OTLP_AUTH`), Grafana Cloud Influx, Pushgateway, and Loki, with a Grafana dashboard and no pack changes.
  - `.agents/tasks/` is committed history. `delivery-task` commits `task.md` as `docs(task): open <slug>` and removes a stale `.agents/tasks/` line from the project `.gitignore`; a join after each phase commits only the run's task directory as `docs(task): <phase> artifacts`, and the pull request and review-round joins push when the branch has an upstream. Skills run by hand commit their artifact as `docs(task): <artifact type> artifact`; code commits stage explicit paths. `delivery-resolve-reviews` starts with `--adopt <run-id>` (or `--branch <pr branch>`) instead of running in the live checkout. `start-epic-delivery` requires an epic branch (`--branch epic-<slug>`), commits the child task files, and prints child commands with `--base <epic branch>` using shell single quotes. `record-evidence` writes `evidence/.gitignore` so recordings stay out of the artifact commits.
  - OMP flavor: a prompt node's `output_format` is appended to the generated prompt (Archon ignores the field on bash nodes) and the generated bash reads the prompt through a bash 3.2-safe heredoc (`{ prompt=$(cat); } <<DELIVERY_PROMPT`; macOS `/bin/bash` failed on prompts with an unpaired apostrophe) and runs `omp -p --auto-approve --no-session --max-time=45m`.
  - The installer writes the native pack flavor for Claude Code, Codex, Pi, or portable targets and `delivery-omp` for Oh My Pi (both when both are targets). Schema nodes in the OMP flavor filter the answer down to its JSON object, since a model wraps it in a code fence. `tests/packs.test.mjs` runs the OMP flavor for real under a scratch HOME with a fake `omp`.
  - `delivery-task` expands `~` in `skills_dir`, warns when the directory is missing, and returns it as `$task.output.skills_dir` for every later node. `--uninstall <one runtime>` keeps the packs and the `~/.agents/skills` copy; `--uninstall all` (or no target) removes them. Install prunes the other managed pack flavor and retired skill and extension paths; `--project` still writes the `~/.agents/skills` copy the packs read.
  - OMP flavor, from the first live run: generated nodes carry `timeout: 2760000` (Archon kills a bash node after 120 seconds by default) and run `omp` with stdin from `/dev/null` (`omp -p` blocks while stdin is an open pipe).
  - Pack fixtures: every pack and block carries `fixtures/*.stubs.yaml`, copied into the OMP flavor by the generator; `archon workflow test delivery` (or `delivery-omp`) runs them without an agent, and `tests/packs.test.mjs` covers the generator, the task node, the `until_bash` checkbox test, and the dry-run sweep.
  - Typed judgments: the new `typed-judgment` skill ships `judge.mjs`, which asks the TypeSafe System One model (`TYPESAFE_API_KEY`) typed questions where the packs used to parse prose: whether the plan is finished and which phase is next, whether a review or reproduction is really what its status claims (a claim only moves toward the safer status), what a "request changes" text asks for (`proceed` ends the gate loop, `stop` cancels the run), the task slug, its `complexity:` tier, and the pack the request reads like (`suggested_workflow:` in `task.md` and a warning on a mismatch), and the JSON object an `omp -p` answer contains or implies. Every call falls back to the previous deterministic rule when the key is unset or the service does not answer, so nothing requires it. `create-epic-plan` checks each child's workflow and `resolve-pr-reviews` triages threads through it; `shared/CONVENTIONS.md` "Typed judgments" states the rules.
  - Model tiers: every `prompt:` node names `model: small|medium|large` (authoring nodes add `effort: high`), bound by `archon ai tier set` or rebound per run with `--model large=<provider>/<model>`; the `-omp` flavor maps a tier to `--model="$OMP_MODEL_<TIER>"` when set and `effort` to `--thinking`. `scripts/validate.mjs` fails a prompt node without a tier. `docs/model-routing.md` covers the table and routing a run by the request's judged tier.
  - App testing: the new `test-app` skill drives the running application (web with `agent-browser`, iOS simulators and Android emulators with `maestro`, `xcrun simctl`, `adb`) through a charter derived from the task's artifacts, grades each step (`judge.mjs grade-steps`), and saves an `app-test` artifact (`passed`, `failed`, `blocked`). The `delivery-app-test` block runs it after implementation in every pack except `delivery-epic` and `delivery-resolve-reviews` when `--input app_test=web|ios|android` is set (`app_target` names the URL, bundle id, or package), fixing and retesting up to three times; `docs/app-testing.md`.
  - Installer: a non-dry install crashed on the retired-paths step (`unknown runtime "retired"`); `buildTrees` now builds only runtime and pack trees, and the install test runs through it.
  - One command: `delivery-start` judges which pack a request reads like and how much human involvement it asks for (`none`, `pr`, `plan`, `all`, mapped to each pack's gate names), pauses once to confirm only when unsure and gates are on, and runs the pack as a child run; `--input workflow=` and `--input gates=` override. The `deliver` skill does the same in an agent session and prints the command, or opens the task directory and hands off to the chain's first skill without Archon.
  - Epics run their children: `delivery-wave` finds the children whose dependencies have merged into the epic branch and launches each as its own unattended run (`--branch <slug> --base <epic branch>`), at most `max_parallel` at once; `delivery-epic` runs the first wave, `delivery-epic-wave` the later ones, and `delivery-program` chains research, PRD, TDD, epic plan, issues, and the first wave. `start-epic-delivery` opens one GitHub issue per child when `gh` is authenticated and `describe-pr` closes it.
  - Research judgments: research questions are checked for leading phrasing and tagged with the worker role that answers them (`neutral`, `route-question`); research reads locator candidates in relevance order (`rerank`), checks every `path:line` claim against the lines it cites (`cite`), and checks the finished document against its questions (`coverage`), listing what stays open.
  - Verification: the new `verify-implementation` skill re-runs, in a session that did not write the code, the repository's checks (from the manifest and CI, never from the receipts) and every acceptance item the artifacts promise (`task.md` criteria, the plan's desired end state and `### Verify` boxes, the receipts' claims, a bugfix's reproduction), diffs the test files against the merge target for weakened checks, grades each item (`judge.mjs grade-steps --kind command`, exit codes first), and saves a `verification` artifact (`passed`, `failed`, `blocked`) with a probability per verdict. The `delivery-verify` block runs it after implementation in the five implementing packs unless `--input verify=false`, fixing and re-verifying up to three times; `judge.mjs verification-status` checks the session's claim against its artifact, moving `passed` only toward `failed` or `blocked`. `review-code` and `describe-pr` read the artifact instead of re-deciding proven criteria. The bugfix reproduction's cross-check node is renamed `verify-reproduction`. `docs/verification.md` is the operator's view; `docs/research/llm-output-verification.md` collects the sources (verifier and reward-model papers, LLM-as-a-judge biases, SWE-bench grading and reward-hacking reports, claim-level factuality, vendor grader guidance) each rule rests on.

### Minor Changes

- [`55f83c2`](https://github.com/MarkTripoli/skills/commit/55f83c21aa38713143af5daf7f250801c2b55b06) Thanks [@Triippz](https://github.com/Triippz)! - Add interactive harness and searchable skill selection to the npx installer. Repeated `--skill` flags provide the same selection for scripts, partial installs include only their selected runtime files and worker definitions, and Archon packs are skipped when the complete delivery chain is not installed.

- [#8](https://github.com/MarkTripoli/skills/pull/8) [`f43f862`](https://github.com/MarkTripoli/skills/commit/f43f8629cf0e23e721360c7d27acf66dfb652a44) Thanks [@Triippz](https://github.com/Triippz)! - Judge epic child size with a typed question instead of an agent's reading. `judge.mjs size-children` asks the TypeSafe System One model the four tests of `shared/SLICING.md` as one probability each, plus whether the child's acceptance sentences name observable state and which split would apply if the child is too large, and prints `ok`, `split`, or `unclear` per child. `create-epic-plan` records the answers in a `## Sizing judgments` table and splits the children the helper calls oversize. The bars come from a calibration set of eight children, four of them one pull request each and four oversize; the effort question carries lower bars because the model cannot see the codebase. Without `TYPESAFE_API_KEY` the helper exits 3 and the skill sizes the children itself, as before.

- [#8](https://github.com/MarkTripoli/skills/pull/8) [`b723814`](https://github.com/MarkTripoli/skills/commit/b723814c25e20e048042ba9575e74a836ebf2df4) Thanks [@Triippz](https://github.com/Triippz)! - Size epic children before they become pull requests. `shared/SLICING.md` states the four tests a unit passes (one obligation, one vertical slice, one day, safe to merge alone), the split to apply when it fails one, and the EARS form of acceptance criteria. `create-epic-plan` sizes every candidate child against them and records the evidence in a `## Slice Check` table; children now carry `slice`, `acceptance`, and an optional `flag`. `start-epic-delivery` rejects children that break the rules and writes each child's acceptance criteria into its `task.md`. `create-structure-outline` sizes phases the same way, and `create-prd` records one obligation per behavior.

## 0.1.0

### Minor Changes

- [`5783403`](https://github.com/MarkTripoli/skills/commit/5783403ce9a1036b6915cc68feffa25219c45e22) Thanks [@Triippz](https://github.com/Triippz)! - First release of the collection: 38 skills forming the delivery workflow (research, design, plan, implement, pull request, with human gates and fresh-context phases), the `run-task` orchestrator with its deterministic `workflow.mjs`, the `start-task` router, worker roles, the `record-evidence` and `show-me` utilities, runtime adapters for Claude Code, Codex, Oh My Pi, and Pi, `/run-task` extensions for Oh My Pi and Pi, the `npx github:MarkTripoli/skills` installer, a Claude Code plugin manifest, the token-free simulator, and the eval harness.
