---
name: record-evidence
description: Records task-scoped evidence (UI video, terminal output, API probes, agent transcripts) and seals revision-bound receipts with verified hosted captures. Use when /record-evidence or /record-evidence --baseline is run, or delivery needs a pre-mutation baseline or a final recording; not for inspecting or repairing it (use /iterate-evidence).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Record Evidence

Record the behavior against the delivered revision. UI evidence is a live video of the interaction, not assertions alone; CLI, API/performance, and agent behavior require captured terminal sessions, probe output, or tool-call transcripts with the observed result. The PR description and a distinct PR comment both link directly to the verified hosted capture.

Delivery has two capture boundaries: `/record-evidence --baseline` before the first source or check mutation, and `/record-evidence` after current verification and review. Both use the same recorder. Final recording hands off to `/iterate-evidence` for the inspection/repair gate, never directly to publication. Outside delivery, recording remains standalone and grants no repair authority.

## Inputs

- **Test targets** (required): behaviors or flows to verify, phrased as testable statements; in a task derive them from the change and acceptance criteria when not supplied.
- **Surfaces** (default: the changed behavior): live UI uses a desktop screen, Android emulator or device, iOS simulator, or headless browser; non-UI uses a captured terminal session, API/performance probe output, or agent tool transcript.
- **PR / issue** (optional outside a task): where to post. Every delivery PR requires a direct hosted capture URL in its description and a distinct comment, including when the PR is created after capture.
- **Mode**: `--baseline` freezes delivery policy and captures existing behavior before mutation. Default captures the implemented revision. A task that delivers a PR requires both receipts, including oneshot, bugfix, and epic children.

## Where evidence lives

Capture into external scratch outside the resolved task root. Durable `evidence.baseline`/`evidence.recording` iterations contain provenance metadata only; allocate, stage and record through the conventions. Never upload task files, reports or receipts. Retain baseline/current original captures and samples through inspection and repair; remove scratch after delivery completes with verified hosted PR readback.
- Existing UI uses authentic `BEFORE` and current `AFTER` sessions, composed with those labels and `--no-align`. Existing non-UI retains failing/baseline and current original output.
- New behavior needs an explicit policy exemption, never a fabricated baseline.
- The PR body and distinct same-PR comment are durable publication proof, not local receipts.

UI sessions contain `evidence.mp4`, `report.md`, `manifest.json`, raw footage under `capture/`, and `events.jsonl`. Extract bounded review frames for required state claims. Non-UI sessions retain the actual input, output, exit status, and reproducible command in addition to `report.md`. A prose report is not a capture.

## The recorder

`EVIDENCE` in the steps is `scripts/evidence.py` inside this skill's directory (for example `~/.agents/skills/record-evidence/scripts/evidence.py`). The recorder is that script; read [references/recorder.md](references/recorder.md) for commands, sources, and overlay behavior before step 1.

## Steps
Steps 1–6 apply to UI recording. Non-UI work uses captured output (see [references/non-ui-and-drivers.md](references/non-ui-and-drivers.md)), inspects that output, and joins step 7. It needs neither ffmpeg nor a synthetic video.

- [ ] 0 boundary frozen or loaded
- [ ] 1 doctor
- [ ] 2 surfaces ready
- [ ] 3 sessions started
- [ ] 4 tested live
- [ ] 5 stopped and inspected
- [ ] 6 composed (existing UI, final only)
- [ ] 7 uploaded, receipt written, sealed

### 0. Freeze or load the delivery boundary

In a task, read `task.md` and the selected plan, outline, reproduction, or implementation artifact. For delivery, read [the evidence commands](references/delivery_contract.md). Optionally run `status` to see what publication still lacks. Then follow the mode:

- Standalone: derive targets from the request; skip sealing.
- `--baseline`: derive stable surface IDs, targets, expectations and `existing`/`new` classifications from the approved task. Freeze policy through the helper with any owner repair cap (`max_repairs`, `repair_authorization`). Capture existing behavior before edits or from a temporary base-commit worktree, passing its SHA as `baseline_commit`. Inspect and seal the next immutable `evidence.baseline` receipt. A bug's failing result is valid baseline evidence. New-only work records policy and an exemption, never a fabricated old screen. Reuse reproduction captures only when source, environment, targets and hashes match.
- Final: load the sealed policy and baseline and capture the current source and build. A missing baseline is captured from the base commit in a temporary worktree, never by resetting the checkout or backdating a receipt. A repair capture never replaces the original baseline. A surface that cannot be captured is recorded `untested` with a reason.

In every mode, record source identity using the helper and prove the running build loaded it with observed process, build, or deployment output. Record the environment and the exact probe. HEAD alone does not identify dirty source or a stale server.

### 1. Check the toolchain

```bash
python3 $EVIDENCE doctor
```

Read `capture_sources` and `overlay_ready` before choosing a path. No overlay backend: install Pillow, or continue and keep the assertion list in `report.md` as the record (the video then carries no burned-in text; the report says so).

### 2. Prepare each surface

Follow `references/device_setup.md` for the exact commands. In short:

- **Desktop**: maximize the window, close popups and unrelated panels, navigate to the starting state before recording unless setup itself is under test.
- **Android**: `boot android <avd> --headless` (or use a running emulator from `devices`), `adb install`, `adb shell am start`. Drive with `adb shell input tap|swipe|text|keyevent`, or Maestro.
- **iOS**: `boot ios "<name>" --headless`, `xcrun simctl install`, `xcrun simctl launch`. Drive with Maestro, `idb ui tap`, or XCUITest; `simctl` has no tap command.
- **Browser without a display**: write the Playwright `record.mjs` from the reference and run it right after `start --source external`.

### 3. Start one session per surface

```bash
python3 $EVIDENCE start \
  --output <external-scratch>/<surface> \
  --title "<what is being verified>" \
  --source <screen|android|ios|external> --label "<policy surface>" \
  --commit "$(git rev-parse HEAD)" --branch "$(git branch --show-current)" \
  --environment "<OS / browser / device / deployment>"
```

Keep the printed session path. Baseline mode records only the original `BEFORE` session; final mode records only the current `AFTER` session and references the saved baseline. Net-new work records one current-state session. Use policy targets and meaningful assertions; record starting state before the first interaction. Select only requested surfaces: web-only work does not boot Android or iOS merely because `doctor` detects them.

### 4. Test live, narrating and asserting

Perform every interaction on the live surface; the recording is that session. Work at a watchable pace: let the UI settle after each action so the state change is on video.

- Before each step, `narrate` what the viewer is about to see and why it matters, in one or two sentences. Read `references/narration_guide.md` for voice and timing.
- At each named test, `annotate --type test_start --message "It should ..."`.
- After each check, look at the screen, then `annotate --type assertion --result passed|failed|untested --message "..."`.
- Multi-device: pass every session path to the same `narrate` or `annotate` call when the statement applies to all of them; call per session when it does not. In a composite, pane-specific narration lines given within 3 s of each other share one footer entry, each prefixed with its pane label.
- When `doctor` lists an input tool for a surface (Maestro, idb, adb), use it. Mark a flow `untested` only when no actuator can drive it, or when driving it needs data you must not record.

Assertion rules: one assertion per meaningful state change; use "Precondition: ..." for starting state; keep messages high-signal (the recorder rejects over 80 characters); a test that cannot run is `untested` with the reason, never skipped silently; the timestamp records when you asserted, not whether it was true.

### 5. Stop and review

```bash
python3 $EVIDENCE stop "$SESSION" --caveats "<untested items and why; timing notes; or None.>"
python3 $EVIDENCE frames "$SESSION"
```

`verified: true` proves media finalization, not correct behavior. Read [inspection acceptance](../iterate-evidence/references/inspection_acceptance.md), then open each required target's recorded state and the initial state of each session. Inspect intervals rather than sparse stills for temporal claims. Save exact sample paths, hashes, timestamps, observed pixels, and viewer/tool trace references. For non-UI evidence, read the retained output and cite decisive lines. Missing viewing capability blocks the affected proof.

On `finalization_failed` or `recorder_lost`, preserve the failure and name the repair/access prerequisite. For shifted timestamps, use manifest timing and rerender the same footage, or correct external import with observed offset. A rerender is not a new capture. Keep the original media and explain the correction.

### 6. Compose the required comparison

```bash
python3 $EVIDENCE compose --output <external-scratch>/composite \
  "$BEFORE" "$AFTER" --label "BEFORE" --label "AFTER" \
  --no-align --caveats "<per-session caveats>"
```

Existing UI final evidence uses this comparison, selecting the original sealed baseline and current session for the same surface. `--no-align` starts both at their own zero; wall-clock alignment would insert the entire development gap. Inspect the resulting composite and its `BEFORE`/`AFTER` labels before upload. Baseline mode and new-only work skip this step.

Cross-device composition is separate and only applies when the task requires several devices. Keep surface identities, source sessions, and per-pane results; do not substitute a cross-device montage for the required before/after comparison. Review frames stay local.

For a `/deliver` UI task, capture tablet and mobile as separate real sessions, with start, changed-state, and final screenshots for each. Record device name and viewport. A cross-device composite may supplement those sessions, but cannot replace either. If a required surface cannot be exercised, mark it `untested` with the reason; it does not block sealing and is listed under the PR `### Known limits`. The PR description's `## UI Evidence` section must contain the direct media URLs; a comment alone is insufficient.


1. Save `report.md` with tested source/build, environment, commands/interactions, observed results and timestamps or output lines, device/viewport and capture filenames when relevant, and limits. Include the result line, per-test table, narration transcript, and caveats. Standalone recording stops at its report and requested attachment procedure; items 2–7 are delivery checkpoints only.
2. Record the next immutable evidence receipt from `references/evidence_template.md`. Baseline uses `type: evidence-baseline`; final uses `type: evidence`. List each requested tablet/mobile session and its video and screenshot paths and direct URLs. Retain failed and blocked outcomes; `untested` results keep their reason.
3. Build the JSON record in [the contract reference](references/delivery_contract.md) from actual files and observations.
4. Final delivery only: upload each required surface's video and representative screenshots to an authorized host with direct links.
   - An authenticated PR upload box or another host returning direct URLs works; `glab mr note` cannot attach local media. Remove any placeholder upload comment.
   - Open every direct file URL and inspect playback and readability; retain that observation in the finished receipt.
   - Add the URLs and local captures to the input.
5. Run `seal`. It computes hashes and verifies hosted bytes, media, policy, and revision (baseline mode needs no upload). A comment permalink, upload response, or URL string alone is insufficient.
6. On a missing capture without a reason, missing inspection, or revision mismatch, save the blocker and stop. A hosted capture that cannot be read back (no `glab` login for the host) is sealed `unverified` with its reason and listed under the PR `### Known limits`. A failed behavior result retains its recording and routes to repair; do not repair product source inside this skill.
7. Keep returned seal details in the reply without changing the sealed receipt. Baseline hands back to the caller; final hands off to `/iterate-evidence`. Only successful current-revision inspection supports `/describe-pr`.

`describe-pr` later publishes the selected direct URLs in both the PR description and a distinct comment, then verifies both. Leave the sealed evidence receipt unchanged; publication links belong in the PR description. A standalone recording posts only to explicitly requested destinations, reopens them, and has no automatic delivery handoff. Attach the same video to the tracker issue with a one-line result when the task requests it, and send the report and recording to the requester when requested.

For CLI, API, rendering, or agent changes, or when no computer-use tool is available, read [references/non-ui-and-drivers.md](references/non-ui-and-drivers.md).

## Guardrails

- The video shows the actual session being driven live. Never present scripted playback, stitched clips, or synthetic footage as a recording.
- Never record a half-covered or tiled window; maximize first.
- Never record a screen showing secrets, tokens, customer data, or payment details; mark that flow `untested` and say why.
- Narration describes what the viewer sees and what it proves; it never claims what the screen does not show.
- When verifying a fix, show or reference the old failure alongside the new success.
- Always state the exact commit, branch, or deployment tested against.

## Capture hygiene

- Confirm the server or build you probe is yours: `lsof -i :<port>` (or `ss -ltnp "sport = :<port>"`), then `ps -p <pid> -o args=`; on devices, `adb shell dumpsys package <id> | grep versionName` or `xcrun simctl get_app_container <udid> <bundle>`.
- Evidence complements the repository's checks (typecheck, build, tests); it never replaces them.
- Evidence directories remain ignored; their recordings are not committed.

## Final response

Choose the template by situation and use it only:

- Delivery baseline sealed: use `references/evidence_baseline_answer.md`, filling `{next_command}` with `/iterate-implementation` (task-only) or the plan's implementation skill. Report the policy, baseline receipt, inspected targets/exemptions, and source revision. If called inside a mutation skill, return the checkpoint to that caller before it dispatches any edits.
- Delivery final sealed: `references/evidence_final_answer.md` hands off to `/iterate-evidence` for inspection, including captured failures. No default repair cap; this skill consumes none.
- Missing capture/inspection/hosting/baseline: report the exact blocked prerequisite and saved partial artifacts, without a publication handoff.
- Standalone: `references/evidence_standalone_answer.md`, with observed state and requested attachment action only.

`{artifact_link}` is the full task-root-relative canonical receipt path selected through index.json. `{report_link}` is a relative Markdown link to `report.md` of the session (or the composite), relative to the repository root, or to the current directory when there is no task directory. `{summary}` is the receipt's `summary`.
