---
task: "[task slug]"
type: evidence-iteration
summary: "[Two to four factual sentences: inspected scope and application identity; verified outcomes and unresolved work; stop decision and evidence availability.]"
status: in-progress
stop_reason: none
limit: 3
consumed_rounds: 0
branch: "[observed branch, or not applicable outside Git]"
current_application_revision: "[Revision ledger identity, distinct from receipt commit]"
---

# Evidence Iteration Receipt

For indexed task, record this template as next immutable `evidence.iteration`; continuation copy current iteration into newly allocated staging successor before appending state. Legacy task without `index.json` keeps one numbered receipt under collection legacy rule. Fill every field from observations, using `None.`, `unknown`, or `not applicable` with reason instead of invented values. Remove unneeded example rows. Current frontmatter, finding summaries, and final coverage can change only in staged successor; append supporting observations, transitions, round history, authorizations, stop decisions without deleting earlier results. This series is loop state, not companion JSON store.

`status`: `in-progress` | `passed` | `blocked` | `failed` — these are the ONLY valid values; any other string (e.g. `completed`, `done`, `all-resolved`, or prose) is invalid and will be rejected by the grader. `stop_reason`: `none` while active/interrupted | `success` | `blocker` | `no-progress` | `exhaustion` when terminal — these are the ONLY valid values; any other string is invalid. `limit` and `consumed_rounds` are nonnegative integers. A reserved round consumes allowance before delegation or mutation; baseline consumes zero. While active, frontmatter's consumed number selects the matching numbered round, whose scoped record owns repair state, not the last historical heading. Apply the skill's [reservation boundary](../SKILL.md#4-reserve-and-complete-one-repair-round) before action, including continuation.

**Frontmatter is append/update-only.** At reservation, update only `status`, `stop_reason`, and `consumed_rounds`; retain every other field — `type`, `limit`, `task`, `summary`, `branch`, and `current_application_revision` — unchanged and present. The entire frontmatter block must always include every previously established field. Never remove, replace with a different field, or collapse existing fields. Rewriting a frontmatter block that omits any prior field is wrong even if the intent is to update a single value.

**Initial-zero frame per session.** For every recording session — baseline and each repair pass — open the initial application state before the first action as a separately named frame (the initial-zero count before any interaction) as a distinct viewer call. This is required alongside the per-flow action result frames; do not infer the starting state from a fresh page or a probe.

## Scope

- Invocation and primary inputs: [task, request, named iteration/evidence receipt, source links]
- Repair authority: [caller/parent authorization, exact scope and source; or missing]
- Allowed source/check paths: [explicit boundaries and excluded paths]
- Application/environment: [app, URL/deployment, OS, browser/device/version, viewport, relevant data/start state]
- Launch/reload commands: [exact commands and owned process/build]
- Required checks: [commands, scope, required outcomes]
- Inspection capabilities: [capture source, recorder doctor result, viewer/tool, image/video support, actual failures/denials, limitations]
- Limit authorization: [initial limit, default or explicit source; zero means inspection-only]
- Posting destination: [requester-only, or explicitly requested destination and delivery requirement]
- Candidate baseline: [receipt/session or None.; comparison of source, environment, accessibility, coverage; reuse or fresh-capture decision and reason]

### Targets and regression charter

Freeze expected outcomes and sources before repair. List each required flow/configuration separately, including neighboring flows selected under delegated authority.

| Flow ID | Role: target or regression | Surface/configuration and starting state | Action | Unchanged expected outcome | Requirement/design source | Required |
| --- | --- | --- | --- | --- | --- | --- |
| [flow] | [role] | [state] | [action] | [outcome] | [path/line or supplied authority] | [yes/no and basis] |

### Visual authority inventory

Record the applicable source/value for every category. Missing categories are `unknown` or `not applicable` with a reason. Conflicts or unknowns needed for an affected repair remain blockers.

| Category | Source and token/value/contract, or unknown/not applicable | Conflict or limit |
| --- | --- | --- |
| Colors | [tokens or literal hex values] | [limit or None.] |
| Typography | [font, weight, scale] | [limit or None.] |
| Spacing | [scale/constraints] | [limit or None.] |
| Radius | [tokens/values] | [limit or None.] |
| Elevation | [shadows/layers] | [limit or None.] |
| Layout | [component/grid contracts] | [limit or None.] |
| Breakpoints | [responsive boundaries] | [limit or None.] |
| Themes/CSS variables | [modes and variables] | [limit or None.] |
| Framework utilities | [framework and applicable conventions] | [limit or None.] |
| Accessibility | [requirements and interaction contracts] | [limit or None.] |
| Visual baselines | [approved references and identity] | [limit or None.] |

### Authorization history

| Time/source | Authorization or restored prerequisite | Prior limit/scope | Authorized limit/scope | Reason and retained consumed count |
| --- | --- | --- | --- | --- |
| [time and caller/parent citation] | [initial, continuation, or extension] | [prior or None.] | [authorized value] | [reason; consumed count] |

## Revision ledger

Append every application identity used for checks or capture. A dirty tree is never identified by base SHA alone. Keep receipt-only commits separate from these identities.

| Revision ID | Application SHA or base SHA | Dirty patch path/hash and relevant untracked hashes; non-Git snapshot if needed | Served build/deployment | Loaded identity verification: method, time, result/evidence | Environment |
| --- | --- | --- | --- | --- | --- |
| [identity] | [SHA or non-Git] | [retained paths and hashes, or clean] | [build/URL] | [restart/reload and served bytes/build comparison] | [scope reference or observed difference] |

## Recording ledger

One unique session directory per capture/surface. Preserve all baseline/failed material beneath ignored task evidence storage. Hash raw and rendered media; rerenders remain linked to their original capture. Attribute clocks using [time and surface identity](inspection_acceptance.md#preserve-time-and-surface-identity): retain producer field/event names, sampling point, and unavailable operation times.

| Session ID and pass | Surface/pane | Revision ID | Raw/rendered paths and hashes | Report/manifest/events paths | Observed clocks and producer references | Timing and alignment caveats | Availability/posting location |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [unique session; baseline or reserved round] | [surface/pane/source session] | [identity] | [paths + hash algorithm/values] | [paths] | [field/event, value, source and sampling point; video-started-at reference; unavailable operation times] | [cards, video_t mapping, offsets, held tails, gaps, cadence, alignment] | [local-only reachable paths, verified URL, or unavailable with reason] |

## Inspection ledger

Append a row per claim/sample group. Name exact inspected pixels, not only a successful viewer call. Retain readable samples and the opening tool result/trace reference.

| Inspection ID/time | Reviewer/tool and opening result/trace | Session, surface/pane, revision | File/sample paths and hashes | Raw/rendered timestamps or interval, playback rate/frame cadence | Pixels observed | Expected outcome/source | Conclusion and gaps | Additional state/probe evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [inspection] | [actor/tool + evidence] | [identities] | [retained paths/hashes] | [exact samples or start/end and method; timing limitations] | [actual visible values/state] | [scope citation] | [passed/failed/untested claim and reason; unsampled limits] | [commands, identity, results/output paths, or not applicable] |

## Findings

IDs are monotonic (`IE-001`, `IE-002`, ...), never reused or renumbered. Reopen the same defect under its original ID; link duplicates to it. States: `open`, `repair-pending-verification`, `resolved`, `blocked`. Unsupported suspicions stay in observations. A `not-a-defect` disposition requires evidence/source/reason, preserves the original record, and never counts as verified repair progress. Severity reduction or renaming does not waive required work.

| ID | Flow and required scope | Actual / expected / source | Before revision/session/inspection | Severity | Current state | Repair paths/revision | After revision/session/inspection | Disposition and evidence-backed reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [stable ID] | [flow, required or justified out-of-scope] | [observed defect; unchanged expectation and authority] | [references] | [severity with basis] | [state] | [paths/identity or None.] | [references or pending] | [active, verified resolution, duplicate of ID, or not-a-defect with source] |

### Observation and state history

Append baseline observations, uncertainties, duplicates, state transitions, reopenings, dismissals, and previous coverage results here or in the referenced round. Retain failed evidence after a current summary becomes passed.

| Time/boundary | Finding/flow | Prior state/result | Observation and new state/result | Revision and inspection/source evidence | Reason |
| --- | --- | --- | --- | --- | --- |
| [time/baseline/round] | [ID or unsupported suspicion/flow] | [prior or None.] | [observed facts and transition] | [references] | [basis] |

## Round history

Baseline is capture and inspection at consumed `0`, not a repair reservation. Append one record below for each reserved round and append completed steps to that record. Never replay completed edits or replace a failed round with a later success.

### Baseline

- Revision and reused/new sessions: [identities and baseline decision]
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
| Serve/capture | [state] | [time] | [loaded identity check and recording commands] | [revision/result] | [new session references] |
| Pixel inspection | [state] | [time] | [viewer/extraction] | [observed results] | [inspection references] |
| Reconciliation | [state] | [time] | [compare unchanged expectations] | [resolution/result] | [finding/coverage history] |

- Newly verified resolutions of previously open required IDs: [set, with new evidence]
- Reopened / newly discovered / remaining required IDs: [separate sets]
- Progress comparison: [pre-round versus post-round; true only for a new verified required resolution]
- Current step / last completed step / next incomplete step: [actual saved boundary, also reflected in current Delivery before action; last completed need not be reservation; none pending after reconciliation]
- Interruption, continuation, or operational failure: [observed time/source or timestamp unavailable; actual state, authorization/restored prerequisite and evidence, or None.]
- Decision / next action: [precedence evaluation or reserved work to complete; label superseded pending boundaries historical and retain them]

**Frame completion self-check (required before writing any coverage row for this pass):** List every required frame before writing entries in the coverage table or round inspection summary.

| Required frame | Pass | Session | Opened path | Opener call reference | Confirmed |
| --- | --- | --- | --- | --- | --- |
| initial-zero | [this round] | [session ID] | [exact path] | [trace/tool call ref] | [yes — opened before this row] |
| [flow name] | [this round] | [session ID] | [exact path] | [trace/tool call ref] | [yes — opened before this row] |

Total opened: [N]. Required: [1 initial + M flows] = [N]. Count matches: [yes — required before writing any coverage row; a row for a flow with no opened frame in this list is a false claim].

## Guardrails

| Finding | Observed gap and original execution | Changed check/rule path and hash | Why it catches the unchanged original failure | Preserved faulty-source execution | Repaired-source execution | Verification limit |
| --- | --- | --- | --- | --- | --- | --- |
| [ID] | [missed behavior + evidence] | [path/hash and assertion] | [retained input/threshold/expected outcome/coverage] | [identity, same strengthened-check/input hash, exact command, exit, stdout/stderr] | [identity, command, exit, stdout/stderr] | [None. or why comparison is unverified; direct behavior proof; required check blocker] |

## Final coverage

Keep this seven-column schema for every terminal outcome: passed, failed, or blocked. List every required target and regression flow/configuration separately at the actual latest application revision. Bind each verdict to its evidence/checks and finding IDs; state unavailable values and reasons in their cells. Prior passing evidence is history if its revision differs. Untested is never passed. Each row's inspected evidence must cite the specific extracted frame that was individually opened for that flow by name; a contact sheet or composite view opening does not supply per-flow evidence.

| Flow/configuration | Target or regression | Latest revision | Recorded session and inspected evidence | Required checks/state probes | Result: passed/failed/untested | Reason and limits |
| --- | --- | --- | --- | --- | --- | --- |
| [flow] | [role] | [actual identity, or unknown with reason] | [session and individually opened frame path by name, observed pixel value, and timestamp; or unavailable with reason] | [result references, or unavailable/not applicable with reason] | [result] | [finding IDs or None.; actual outcome, missing proof, or limitation] |

## Stop decision

Append each evaluation, including prior terminal outcomes and later authorized continuation. Success precedes blocker, then no-progress, then exhaustion; preserve all simultaneous failed/untested results. An interruption stays `in-progress/none` at its saved boundary.

Before saving the terminal result, apply the skill's finalization boundary and the [finalization evidence rules](inspection_acceptance.md#finalize-the-receipt-against-retained-evidence). Use only observed clock/trace timestamps with their source; omit unavailable timestamp values explicitly. Keep earlier reservations, pending steps, and stop evaluations as labeled historical boundaries.

| Time/boundary | Status / stop reason | Consumed / limit | Deciding evidence | Simultaneous known failures and untested work | Next prerequisite/action |
| --- | --- | --- | --- | --- | --- |
| [time/baseline/round/continuation] | [status / reason] | [count / limit] | [coverage, resolution, check, blocker, progress, or exhaustion references] | [IDs/flows, or None.] | [state or authorized continuation prerequisite] |

## Delivery and known limits

- Current result and application identity: [receipt state and Revision ledger reference]
- Active round / consumed count / authorized limit / attempted finding IDs: [matching numbered round and frontmatter values, or baseline/terminal with reason; update at reservation before delegation/mutation]
- Current step: [repair pending / checks pending / capture pending / inspection pending / completed; or terminal result; update at each step]
- Last completed step: [reservation / baseline inspection / repair / checks / capture; the step actually persisted to disk]
- Next incomplete step: [repair / checks / capture / inspection / reconciliation; or None. after terminal; no pending round step after completion]
- Evidence availability: [local-only retained paths or verified posting links; unavailable material]
- Posting confirmation, when required: [destination, reopen/playback result, or blocker; otherwise requester-only]
- Artifact/source commit separation: [receipt commit and source commits separately, pending parent ownership, or uncommitted outside Git]
- Known limits: [uninspected configurations, temporal/sample limits, unverified guardrail comparisons, or None.]
- Required next prerequisite: [specific action or None.; no scheduled skill handoff]
