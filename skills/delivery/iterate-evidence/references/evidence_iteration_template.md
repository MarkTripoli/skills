---
task: "[task slug]"
type: evidence-iteration
summary: "[Two to four factual sentences: inspected scope and application identity; verified outcomes and unresolved work; stop decision and evidence availability.]"
status: in-progress
stop_reason: none
limit: none
consumed_rounds: 0
branch: "[observed branch, or not applicable outside Git]"
current_application_revision: "[Revision ledger identity, distinct from the local receipt file]"
repair_attempt: "[saved repair attempt ID, or none]"
revision: [the quoted string that contract.mjs revision <task-dir> prints]
evidence_sha256: "[current sealed numbered evidence receipt hash]"
---

# Evidence Iteration Receipt

For an indexed task, record this as the next immutable `evidence.iteration` through the collection's Recording an artifact flow. On continuation, copy the current iteration into the newly allocated staging successor before appending; record every durable boundary as another successor. A legacy task without `index.json` keeps its numbered receipt under the collection's legacy rule. Fill every field from observations, using `None.`, `unknown`, or `not applicable` with a reason instead of invented values. Remove unneeded example rows. Change current frontmatter, finding summaries, and final coverage only in a staged successor; append supporting observations, transitions, round history, authorizations, and stop decisions without deleting earlier results. This series is loop state, not a companion JSON store.

`status`: `in-progress` | `passed` | `blocked` | `failed`. `stop_reason`: `none` | `success` | `blocker` | `no-progress` | `exhaustion`. Mirror saved shared state and preserve the original limit and consumed count. `limit: none` means no cap; an explicit owner limit, with its source, replaces it, and `0` is inspect-only. Initial inspection consumes zero; a source-changing repair reserves allowance before edits or delegation. Resume the existing attempt's first incomplete action.

## Scope

- Invocation and primary inputs: [task, request, named iteration/evidence receipt, source links]
- Repair authority: [caller/parent authorization, exact scope and source; or missing]
- Allowed source/check paths: [explicit boundaries and excluded paths]
- Application/environment: [app, URL/deployment, OS, browser/device/version, viewport, relevant data/start state]
- Launch/reload commands: [exact commands and owned process/build]
- Required checks: [commands, scope, required outcomes]
- Inspection capabilities: [capture source, recorder doctor result, viewer/tool, image/video support, actual failures/denials, limitations]
- Limit authorization: [`none`, or the explicit owner limit and its source]
- Posting destination: [requester-only, or explicitly requested destination and delivery requirement]
- Candidate recording to reuse: [receipt/session or None.; comparison of source, environment, accessibility, coverage; reuse or fresh-capture decision and reason]

### Targets and regression charter

Freeze expected outcomes and sources before repair. List each required flow/configuration separately, including neighboring flows selected under delegated authority.

| Flow ID | Role: target or regression | Surface/configuration and starting state | Action | Unchanged expected outcome | Requirement/design source | Required |
| --- | --- | --- | --- | --- | --- | --- |
| [flow] | [role] | [state] | [action] | [outcome] | [path/line or supplied authority] | [yes/no and basis] |

Visual authority: [source and tokens for any category the repair touches, or "not applicable"]

### Authorization history

| Time/source | Authorization or restored prerequisite | Prior limit/scope | Authorized limit/scope | Reason and retained consumed count |
| --- | --- | --- | --- | --- |
| [time and caller/parent citation] | [initial, continuation, or extension] | [prior or None.] | [authorized value] | [reason; consumed count] |

## Revision ledger

Append every application identity used for checks or capture. A dirty tree is never identified by base SHA alone. Receipt file updates do not alter these identities.

| Revision ID | Application SHA or base SHA | Dirty patch path/hash and relevant untracked hashes; non-Git snapshot if needed | Served build/deployment | Loaded identity verification: method, time, result/evidence | Environment |
| --- | --- | --- | --- | --- | --- |
| [identity] | [SHA or non-Git] | [retained paths and hashes, or clean] | [build/URL] | [restart/reload and served bytes/build comparison] | [scope reference or observed difference] |

## Recording ledger

One unique session directory per capture/surface. Preserve all initial and failed material beneath ignored task evidence storage. Hash raw and rendered media; rerenders remain linked to their original capture. Attribute clocks as inspection_acceptance.md describes under "Preserve time and surface identity": retain producer field/event names, sampling point, and unavailable operation times.

| Session ID and pass | Surface/pane | Revision ID | Raw/rendered paths and hashes | Observed clocks and caveats | Availability/posting location |
| --- | --- | --- | --- | --- | --- |
| [unique session; initial inspection or reserved round] | [surface/pane/source session] | [identity] | [paths + hash algorithm/values; report, manifest, and events paths] | [producer field/event, value, sampling point; video_t mapping, offsets, held tails, gaps, cadence, alignment] | [local-only reachable paths, verified URL, or unavailable with reason] |

## Inspection ledger

Append a row per claim/sample group. Name exact inspected pixels, not only a successful viewer call. Retain readable samples and the opening tool result/trace reference. The expected outcome comes from the frozen charter; extra state probes go in the conclusion cell.

| Inspection ID/time | Tool and opening result/trace | Session and surface/pane | Sample paths and hashes | Timestamps or interval, playback rate/frame cadence | Pixels observed | Conclusion and gaps |
| --- | --- | --- | --- | --- | --- | --- |
| [inspection] | [tool + evidence] | [identities] | [retained paths/hashes] | [exact samples or start/end and method; timing limitations] | [actual visible values/state] | [passed/failed/untested claim and reason; unsampled limits; commands, identity, and results of any state probe] |

## Findings

IDs are monotonic (`IE-001`, `IE-002`, ...), never reused or renumbered. Reopen the same defect under its original ID; link duplicates to it. States: `open`, `repair-pending-verification`, `resolved`, `blocked`. Unsupported suspicions stay in observations. A `not-a-defect` disposition requires evidence/source/reason, preserves the original record, and never counts as verified repair progress. Severity reduction or renaming does not waive required work.

| ID | Flow and required scope | Actual / expected / source | Before revision/session/inspection | Severity | Current state | Repair paths/revision | After revision/session/inspection | Disposition and evidence-backed reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [stable ID] | [flow, required or justified out-of-scope] | [observed defect; unchanged expectation and authority] | [references] | [severity with basis] | [state] | [paths/identity or None.] | [references or pending] | [active, verified resolution, duplicate of ID, or not-a-defect with source] |

### Observation and state history

Append initial observations, uncertainties, duplicates, state transitions, reopenings, dismissals, and previous coverage results here or in the referenced round. Retain failed evidence after a current summary becomes passed.

| Time/boundary | Finding/flow | Prior state/result | Observation and new state/result | Revision and inspection/source evidence | Reason |
| --- | --- | --- | --- | --- | --- |
| [time/initial inspection/round] | [ID or unsupported suspicion/flow] | [prior or None.] | [observed facts and transition] | [references] | [basis] |

## Round history

The initial inspection is capture and inspection at consumed `0`, not a repair reservation. Append one record below for each reserved round and append completed steps to that record. Never replay completed edits or replace a failed round with a later success.

### Initial inspection

- Revision and reused/new sessions: [identities and recording-reuse decision]
- Inspections and per-flow results: [references, actual outcomes, gaps]
- Findings persisted before repair: [IDs and expected-behavior sources]
- Consumed rounds: `0`
- Stop evaluation/next action: [decision and evidence]

### Round [reserved number]

- Reservation persisted at: [saved receipt/trace boundary before mutation/delegation; observed timestamp and source, or timestamp unavailable; independent of the last completed step's name]
- Reservation persisted before any edit or worker delegation: [yes — confirmed on disk (consumed_rounds read back and "Reservation persisted" entry present in this round record) before first source/check edit, worker spawn, or any other delegating command; or blocked with reason. This checkpoint applies to direct edits and to bounded-delegation rounds.]
- Consumed count / authorized limit: [count / limit]
- Attempted finding IDs: [existing inspected required findings]
- Pre-round unresolved required IDs: [set]
- Before application identity: [revision]
- Authorized repair/delegation boundary: [paths, actor, scope]
- Pre-action reconciliation: [saved frontmatter, this round, and current Delivery agree on identity, consumed/limit, findings and pending step; retained boundary before delegation/mutation]

| Step | State: pending/completed/interrupted/blocked | Time | Action and exact command, where applicable | Revision and result/exit code | Retained output or evidence |
| --- | --- | --- | --- | --- | --- |
| Repair | [state] | [time] | [edits/paths or bounded delegation] | [revision/result] | [patch/trace] |
| Checks | [state] | [time] | [each exact command; add rows as needed] | [revision, exit code, observed outcome] | [stdout/stderr/output paths] |
| Delivery verification/review | [state] | [time] | [fresh required skill/check commands, or standalone not applicable] | [current revision and artifact statuses] | [verification/review receipt paths] |
| Serve/capture | [state] | [time] | [loaded identity check and recording commands] | [revision/result] | [new session references] |
| Pixel inspection | [state] | [time] | [viewer/extraction] | [observed results] | [inspection references] |
| Reconciliation | [state] | [time] | [compare unchanged expectations] | [resolution/result] | [finding/coverage history] |

- Newly verified resolutions of previously open required IDs: [set, with new evidence]
- Reopened / newly discovered / remaining required IDs: [separate sets]
- Progress comparison: [pre-round versus post-round; true only for a new verified required resolution]
- Current step / last completed step / next incomplete step: [actual saved boundary, also reflected in current Delivery before action; last completed need not be reservation; none pending after reconciliation]
- Interruption, continuation, or operational failure: [observed time/source or timestamp unavailable; actual state, authorization/restored prerequisite and evidence, or None.]
- Decision / next action: [precedence evaluation or reserved work to complete; label superseded pending boundaries historical and retain them]

## Guardrails

| Finding | Observed gap and original execution | Changed check/rule path and hash | Why it catches the unchanged original failure | Preserved faulty-source execution | Repaired-source execution | Verification limit |
| --- | --- | --- | --- | --- | --- | --- |
| [ID] | [missed behavior + evidence] | [path/hash and assertion] | [retained input/threshold/expected outcome/coverage] | [identity, same strengthened-check/input hash, exact command, exit, stdout/stderr] | [identity, command, exit, stdout/stderr] | [None. or why comparison is unverified; direct behavior proof; required check blocker] |

## Final coverage

Keep this seven-column schema for passed, failed, and blocked outcomes. List every required target/regression configuration at the actual current revision. UI rows cite individually opened recorded samples; non-UI rows cite read capture output and decisive lines. Missing current proof is untested and blocks completion; prior proof remains history.

| Flow/configuration | Target or regression | Latest revision | Recorded session and inspected evidence | Required checks/state probes | Result: passed/failed/untested | Reason and limits |
| --- | --- | --- | --- | --- | --- | --- |
| [flow] | [role] | [actual identity, or unknown with reason] | [session and individually opened frame path by name, observed pixel value, and timestamp; or unavailable with reason] | [result references, or unavailable/not applicable with reason] | [result] | [finding IDs or None.; actual outcome, missing proof, or limitation] |

## Stop decision

Append each evaluation, including prior terminal outcomes and later authorized continuation. Success precedes blocker, then no-progress, then exhaustion; preserve all simultaneous failed/untested results. An interruption stays `in-progress/none` at its saved boundary.

Before saving the terminal result, apply the skill's finalization boundary and the finalization rules in inspection_acceptance.md. Use only observed clock/trace timestamps with their source; omit unavailable timestamp values explicitly. Keep earlier reservations, pending steps, and stop evaluations as labeled historical boundaries.

| Time/boundary | Status / stop reason | Consumed / limit | Deciding evidence | Simultaneous known failures and untested work | Next prerequisite/action |
| --- | --- | --- | --- | --- | --- |
| [time/initial inspection/round/continuation] | [status / reason] | [count / limit] | [coverage, resolution, check, blocker, progress, or exhaustion references] | [IDs/flows, or None.] | [state or authorized continuation prerequisite] |

## Delivery and known limits

- Current result and application identity: [receipt state and Revision ledger reference]
- Active round / consumed count / authorized limit / attempted finding IDs: [matching numbered round and frontmatter values, or initial inspection/terminal with reason; update at reservation before delegation/mutation]
- Current step: [repair pending / checks pending / capture pending / inspection pending / completed; or terminal result; update at each step]
- Last completed step: [reservation / initial inspection / repair / checks / capture; the step actually persisted to disk]
- Next incomplete step: [repair / checks / capture / inspection / reconciliation; or None. after terminal; no pending round step after completion]
- Evidence availability: [local-only retained paths or verified posting links; unavailable material]
- Posting confirmation, when required: [destination, reopen/playback result, or blocker; otherwise requester-only]
- Artifact/source separation: [receipt remains local; source commits separately; pending parent ownership; or outside Git]
- Known limits: [uninspected configurations, temporal/sample limits, unverified guardrail comparisons, or None.]
- Required next prerequisite: [specific action or None.; delivery mode names the next skill from the receipt state, standalone has no scheduled handoff]
