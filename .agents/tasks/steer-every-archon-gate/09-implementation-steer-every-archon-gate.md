---
type: implementation
completed_phase: 5
summary: "Phase 5 proved the steward loop against live Archon runs and answered the three CLI facts the design could not confirm from documents: `metadata.approval` carries `message`, `nodeId`, `type`, `captureResponse`, `decisions`, and `decisionsAuthored` while a gate is live, with `resolved` absent until the decision lands and `approved` after it; `archon workflow wait --timeout` exits 3 with `\"result\":\"deadline\"` on a genuine expiry and exits 0 at once with `\"result\":\"attention\"` on an already-paused run; `archon workflow respond <id> approve --detach` exits 0 and returns in one second, well before the next pause. The plan's 5.2 premise was wrong on this machine - the unsure request routes confidently and `confirm` is skipped - so the pause was forced by pointing `skills_dir` at a nonexistent path, which drives `delivery-start.yaml:80` down the `confident=false` branch. Every plan phase is now complete; what remains is the deferred human evidence for acceptance (a), (b), and (c), which needs a live Herdr workspace."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/steer-every-archon-gate/task.md`
- plan artifact: `.agents/tasks/steer-every-archon-gate/04-plan-steer-every-archon-gate.md`
- phase range: Phase 5 only (Prove the loop against a real paused run)

## Child Workers
- implementer: `agent-implementer`, plan path plus phase 5. Started twice and stalled both times: each run ended by handing the wait to a background monitor and returning "standing by" instead of the capture, so it produced no transcripts. The parent ran phase 5's commands itself and recorded the output below. No repository file was changed by either worker.
- reviewer: none; phase 5 changes no repository file, and its four checks were run by the parent against live Archon runs.

## Completed Work

- 5.1: two scratch repositories built per the plan, each `git init -q -b main` with a commit and a bare remote pushed to `origin/main`, under `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null DO_NOT_TRACK=1` with `TYPESAFE_API_KEY` unset.
- 5.2: the plan's request (`Make the thing better somehow`, no key, no `--input workflow=`) does **not** pause at `confirm` on this machine. The first attempt (`delivery-start` run `3beba502`) logged `node_skipped confirm` and dispatched straight to `delivery-full`. `delivery-start.yaml:66` sets `have_judge=true` whenever `judge.mjs` and `node` exist, and `route-workflow` answered with a workflow and a confidence at or above 0.8, so `:80`'s unconfident fallback never ran and `:129` left `confirm=false`. Adding `--input skills_dir=/nonexistent-skills-dir` makes `have_judge=false`, which is the only reliable way to reach the `confident=false` branch; the run then paused at `confirm` in under 30 ms.
- 5.3: the three unconfirmed facts recorded verbatim below, from run `230615b1-4fac-4c9d-9eb5-e71ef1f87f6a` (facts 1 and 2) and run `b3217cb9-cad5-429c-9b72-bf68480f1645` (fact 3, re-run only because a pipe swallowed the first exit code).
- 5.4: all three scratch runs abandoned (`230615b1`, `b3217cb9`, and the earlier `52b77ec0` `delivery-full` run), and both scratch repositories with their bare remotes removed.

### Fact 1: the `metadata.approval` shape on a live gate

`archon workflow get "$run_id" --json | jq '{status, working_path, approval: .metadata.approval}'`:

```json
{
  "status": "paused",
  "working_path": "/Users/marktripoli/.archon/workspaces/T/tmp.Fe7vM7ikBn/worktrees/scratch-steward",
  "approval": {
    "message": "This request reads like delivery-full (confidence unknown) with gates all. Approve to run it, or request changes naming the pack and optionally the gates, for example `bugfix` or `lean, outline`.",
    "nodeId": "confirm",
    "type": "approval",
    "captureResponse": false,
    "decisions": [
      { "id": "approve", "label": "Approve" },
      { "id": "reject", "label": "Request changes" }
    ],
    "decisionsAuthored": true
  }
}
```

`jq -r '.metadata.approval | keys[]'` on the same JSON: `captureResponse`, `decisions`, `decisionsAuthored`, `message`, `nodeId`, `type`. Those are the six field names. `resolved` is **absent** on a live gate rather than present and empty, which is what `.metadata.approval.resolved // empty` in `deliver/SKILL.md:74` and `herd-next/SKILL.md:92-104` already reads correctly.

### Fact 2: `wait --timeout` on expiry

Against a **running** run, `archon workflow wait "$run_id" --json --timeout 5`:

```json
{"ok":true,"action":"wait","runId":"52b77ec0-caef-48ce-9121-e4d8fd8291a7","result":"waiting","observedStatus":"running"}
{
  "ok": true,
  "action": "wait",
  "runId": "52b77ec0-caef-48ce-9121-e4d8fd8291a7",
  "result": "deadline",
  "observedStatus": "running"
}
```

`wait exit on expiry: 3`.

Against an already **paused** run the same command returns at once and does not expire:

```json
{
  "ok": true,
  "action": "wait",
  "runId": "230615b1-4fac-4c9d-9eb5-e71ef1f87f6a",
  "result": "attention",
  "attention": {
    "kind": "awaiting_response",
    "runId": "230615b1-4fac-4c9d-9eb5-e71ef1f87f6a",
    "respondTo": { "runId": "230615b1-4fac-4c9d-9eb5-e71ef1f87f6a", "nodeId": "confirm" },
    "message": "This request reads like delivery-full (confidence unknown) with gates all. Approve to run it, or request changes naming the pack and optionally the gates, for example `bugfix` or `lean, outline`."
  }
}
```

`wait exit: 0`.

A chunk expiry is therefore a **nonzero** exit (3), which the plan's Known limits anticipated. `deliver/SKILL.md:106`'s `|| true` is load-bearing: without it the loop would abort on every expired chunk. The `case "$status"` read on the next line is what the loop branches on, and that stays correct because `wait` distinguishes `deadline` from `attention` only in its body, not in a way the loop needs.

### Fact 3: `respond --detach`

```
$ archon workflow respond "$run_id" approve --detach
Started 'approve' for run b3217cb9-cad5-429c-9b72-bf68480f1645 in the background.
Track it with: archon workflow get b3217cb9-cad5-429c-9b72-bf68480f1645
Child output: /Users/marktripoli/.archon/logs/detached-run-b3217cb9-cad5-429c-9b72-bf68480f1645.log
respond exit: 0
elapsed: 1s
```

Immediately after, `archon workflow get "$run_id" --json | jq -r '.status, (.metadata.approval.resolved // "unresolved")'`:

```
running
approved
```

`--detach` is accepted on a decision that continues a paused interactive pack, it exits 0, and it returns in one second - far before the next pause. `resolved` becomes `approved`, so the loop's "`paused` with a non-empty `resolved`" branch has the shape the plan assumed.

## Automated Verification

- command: `archon workflow get "$run_id" --json | jq '{status, working_path, approval: .metadata.approval}'`
- result: pass - `status: paused`, `metadata.approval.nodeId: confirm`, `resolved` absent
- evidence: the JSON under Fact 1 above; full capture kept at `/tmp/steward-paused.json` for the life of the machine's temp directory

- command: `archon workflow respond "$run_id" approve --detach; echo "respond exit: $?"`
- result: pass - `respond exit: 0`, elapsed 1s
- evidence: the transcript under Fact 3 above

- command: `archon workflow get "$run_id" --json | jq -r '.status, (.metadata.approval.resolved // "unresolved")'`
- result: pass - `running` / `approved`, no longer paused with an empty `resolved`
- evidence: the transcript under Fact 3 above

- command: `npm test`
- result: pass (exit 0)
- evidence: `tests 64 / suites 3 / pass 64 / fail 0 / cancelled 0 / skipped 0 / todo 0`

- command: `node scripts/validate.mjs`
- result: pass (exit 0), re-run at phase end though phase 5 changes no file
- evidence: `ok: 42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`

- command: `grep -rn 'archon workflow' skills/*/references skills/*/SKILL.md skills/*/*/references skills/*/*/SKILL.md`
- result: pass - acceptance (d); every remaining hit is the agent's own command or past-tense provenance
- evidence: `deliver_archon_answer.md:7` (provenance), `deliver/SKILL.md:3,10,44,48,70,97,104,106,107` and `herd-next/SKILL.md:83,91` (the agent's own shell), `resolve-pr-reviews/SKILL.md:12` (how Archon runs the skill), `start-epic-delivery/SKILL.md:34` (the printed record of what the wave block runs). No line instructs a person to type a command.

## Deferred Human Evidence

- Acceptance (a) and (c) inside Herdr: `/deliver` in a Herdr session leaving a review pane whose agent announces the first pause, and `approve` in that pane resolving the gate and announcing the next pause. Not executed; needs a live Herdr workspace. Pointer: `skills/delivery/deliver/SKILL.md` step 4's Herdr branch and step 6, and `skills/delivery/herd-next/SKILL.md:83-115`.
- Acceptance (b) outside Herdr: the same in the starting session. Not executed; needs a live delivery run steered end to end by a session following step 6. Pointer: `skills/delivery/deliver/SKILL.md` step 4's outside-Herdr branch.
- Both are recorded here rather than run because they are agent-behavior acceptance, not a command whose output can be captured. Phase 5's live runs prove the CLI half of the loop they depend on.

## Commit Handoff
No repository file changed in phase 5, so there is no code commit. The ticked plan and this receipt are committed together as `docs(task): implementation artifact` with explicit paths.

## Human Review

### Review targets

- Fact 2 above, against `skills/delivery/deliver/SKILL.md:104-109`. A `wait --timeout` chunk that expires exits **3**, not 0. The `|| true` already in the loop absorbs it; confirm it is still there and that nothing downstream reads `wait`'s exit code.
- Fact 1's key list against `skills/delivery/deliver/SKILL.md:70-77` and `skills/delivery/herd-next/SKILL.md:91-104`. Both read `resolved` with `// empty`, which is correct for a field that is absent rather than empty on a live gate.
- The 5.2 deviation. The plan claimed an unsure request with no key pauses at `confirm`; on this machine it does not, because `delivery-start.yaml:66` only needs `judge.mjs` and `node` on disk, not a `TYPESAFE_API_KEY`. The pause was forced with `--input skills_dir=/nonexistent-skills-dir`. Decide whether the plan's claim should be corrected wherever it is restated.
- The child worker stalled twice without producing its deliverable. The parent ran phase 5 inline instead. Confirm that is acceptable for a phase whose work is live command execution rather than a code edit.

### Verify

- `metadata.approval` on a live gate carries exactly `captureResponse`, `decisions`, `decisionsAuthored`, `message`, `nodeId`, `type`; `resolved` is absent until the decision lands, then `approved`.
- `archon workflow wait --json --timeout N` exits `3` with `"result":"deadline"` on expiry and `0` with `"result":"attention"` on an already-paused run.
- `archon workflow respond <id> approve --detach` exits `0` and returns in ~1s, leaving the run `running` with `resolved: approved`.
- `npm test` passes 64 of 64; `node scripts/validate.mjs` reports 42 skills and 59 answer templates, unchanged.

### Known limits

- The gate proved is `confirm` in `delivery-start`, reached by disabling the routing helper. No artifact gate (`design`, `plan`, `pr`) was reached: the one `delivery-full` run started for that purpose (`52b77ec0`) sat in `research__research` with no logged activity for about 40 minutes and was abandoned rather than waited out. The `metadata.approval` shape is a property of the approval node, not of the pack, but an artifact gate's `message` and `decisions` were not observed directly.
- `archon workflow get` returns `null` fields when run from a directory outside the run's codebase; every capture above was run from the scratch repository root. Nothing in `deliver/SKILL.md` step 6 states that constraint, and a steward attaching with `--run` from an unrelated directory would read `null` and misbranch. Worth a follow-up.
- Archon's own worktrees for the abandoned runs remain under `~/.archon/workspaces/T/tmp.*`. `archon workflow cleanup` was not run because this task's own live run shares that tree.
- Acceptance (a), (b), and (c) remain deferred human evidence; no command can check them.
