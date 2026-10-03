# Delivery workflow

`/deliver` is one orchestrator session. It plans, delegates each unit of work to a builder, has a fresh-context reviewer on the strongest configured model check the result, and stops on a named condition. Every skill also runs by hand in its own session and saves task artifacts locally.

```text
/deliver <request | task-dir>             orchestrator: this session, strong model
  setup     worktree, task.md brief, Jira refinement, one Slack run
  plan      read-only research workers -> plan -> plan reviewer -> human gate when gates=plan
  build     per plan phase: builder implements, checks, commits
            -> slice reviewer (fresh, read-only) -> approve | findings
            repeat until approve or no progress (or an owner cap)
  final     repo checks + evidence; verify-implementation and review-code reviewers on HEAD
  publish   describe-pr, gh pr create, evidence links
  follow-up CI failures and review threads -> the same builder/reviewer pairs
  stop      done | needs-human <question> | blocked <prerequisite + unblock check> | no-progress <evidence>
```

`/deliver <task-dir>` resumes from `task.md`, the plan's `## Progress` and `contract.mjs status`. Reviewers write records checked by `contract.mjs review` (commit is HEAD, tracked files unchanged, status matches findings, blocking findings cite evidence, blocking ids shrink between rounds). Without subagents the orchestrator builds inline and prints a fresh-session handoff for each review.

`/deliver` picks the workflow from the request and the [size check](../shared/SLICING.md). Skills: `skills/delivery/<name>/`. Portable `route-model` skill owns candidate validation + JEV model pick, all harnesses.

When unattended work is requested or a prompt appears, `/deliver` runs a **tool-approval preflight** in the invoking harness. It reports the live no-prompt/auto mode when the host exposes it; when the active mode cannot be verified, it warns and gives the harness-specific check and opt-in launch command. It never reads a config file as proof of the active session or changes permissions. See [the quick-start checks](../docs/cheatsheet.md#tool-approval-preflight) and the [tool approvals](../skills/delivery/deliver/references/tool_approval.md).

## Workflow choices and manual chains

The chain names the phase skills the orchestrator delegates, in order; run by hand, the same order applies. Every chain records evidence before any PR description.

| Choice | Chain | Use when |
|---|---|---|
| `oneshot` | baseline → task-only implementation → verify-implementation → review loop → record-evidence → iterate-evidence → describe-pr | Change fully specified |
| `lean` | create-research-questions → create-research → create-structure-outline → baseline → implement-outline → verify-implementation → review loop → record-evidence → iterate-evidence → describe-pr | Shape known; many files need ordered work |
| `full` | create-research-questions → create-research → create-design-discussion → create-structure-outline → create-plan → baseline → implement-plan → verify-implementation → review loop → record-evidence → iterate-evidence → describe-pr | Designs conflict or cross modules |
| `prd` | create-research → create-prd → create-tdd → create-structure-outline → create-plan → baseline → implement-plan → verify-implementation → review loop → record-evidence → iterate-evidence → describe-pr | Need product + technical design |
| `bugfix` | baseline → reproduce-bug → fix-bug → verify-implementation → review loop → record-evidence → iterate-evidence → describe-pr | Seen behavior ≠ wanted |
| `epic` | Research → create-epic-plan → start-epic-delivery → ready children (each baseline, implementation, verification, review, recording, inspection, publication) | Deliverables merge alone, have deps |
| `program` | Research → create-prd → create-tdd → create-epic-plan → start-epic-delivery → ready children with the same complete contract | Initiative span many child PRs |
| `resolve-reviews` | Original baseline → resolve-pr-reviews → current verification/app test/review → record-evidence → iterate-evidence → update describe-pr and separate PR comment | Existing task + PR need review feedback handled |
| `epic-wave` | Recheck epic deps, run ready children through capture and PR publication | Next wave after prereq merges |

`baseline` means `/record-evidence --baseline`; an already sealed original baseline is reused. Prepare the task's evidence policy early: identify existing versus new behavior, required surfaces and target flows. Existing UI behavior requires an authentic pre-change recording, which may be captured at any time from a temporary worktree at the base commit; new behavior explicitly omits it. A required surface that cannot be captured stays `untested` with a reason and blocks ready publication; record the prerequisite and list it in Known limits.

The final recording proves the current implementation and is inspected against those same targets. Existing UI behavior also requires the labeled `BEFORE`/`AFTER` composite. CLI, API and agent-only changes use captured output or transcripts, not manufactured video. Cross-device recording is required only when the task's surface contract requires it.

### Executable delivery status

Use the installed contract, not a worker's closing paragraph, to inspect what is left:

```sh
node <skills-dir>/deliver/contract.mjs status <task-directory>
```

`status` reports each artifact type's digest-validated current semantic file, status, revision and currency, per-file problems, and what publication still lacks. It is read-only and never refuses a phase.

`evidence-policy.json` fixes the capture scope; later surfaces are appended with a reason. `seal` validates an immutable indexed provenance receipt against real files and fetched hosted bytes; `inspect` binds the recorded review to the same source and capture hashes. The helper stores revision-bound sidecars in `.delivery-evidence/` and the repair allowance in `.delivery-state.json`; an exhausted allowance is a `stop` in `status` that the owner clears with `repair-extension +N: <reason>` in `task.md` `## Decisions`. Keep these task-local files with the artifacts when handing off. Editing Markdown after sealing requires a fresh validated binding, not changing a status word.

`gather-sources` first when request names outside material. `record-evidence` is required for every delivered PR, including oneshot, bugfix, and epic children. UI requires a live interaction video; CLI needs a captured terminal session, API/performance a reproducible probe output, agent behavior its input/tool/output transcript. Record an immutable `evidence.recording` provenance receipt bound to the tested revision and source head; a failed or missing capture blocks PR publication. Authenticated Chrome-and-Android product proof: `video-iterative-development`; `video-iterative-orchestration` for Jira-epic, multi-worktree loop. Jira mode: pick Stories under epic, implementation to agent-owned Subtasks when needed, Story-level acceptance to QA, not Subtasks. KIT: standalone [`jira-issue-hierarchy`](../skills/jira-issue-hierarchy/SKILL.md) owns [local policy and issue bodies](../skills/jira-issue-hierarchy/references/jira-issue-templates/README.md) for upfront Epic/Story breakdown, Story-start Sub-tasks, and QA readiness. Jira orchestration starts from existing Epic and installs that skill as a dependency.

For `/deliver` feature requests, the standing brief in `task.md` carries: agent-owned routine decisions grounded in repository examples; a new worktree from refreshed `origin/main` unless the request specifies a base; a read-only [`jira-issue-refinement`](../skills/jira-issue-refinement/SKILL.md) pass before planning for Jira-backed work; real videos plus screenshots for the requested UI surfaces in the PR's `## UI Evidence`; and current-head pipeline/discussion follow-up through `/resolve-pr-reviews`. The refinement artifact separates confirmed functional specifications and QA steps from proposals, and its Planning impact is reconciled with an existing plan or outline before implementation. Jira description writes require explicit approval by ticket key. The brief also records a sizing decision from `shared/SLICING.md`: an estimated single PR near 10,000 hand-written changed lines or failing the one-day/reviewability tests becomes a small set of independently mergeable child PRs through `/create-epic-plan`. Explicit unattended authorization sets `gates=none` and covers in-scope repair, push, and review replies. When `slack-coordinator` is configured, `slack_run_id` in `task.md` carries one thread and owner gate across stages; direct feature-thread mode is separate.

## Gates

`gates` values: `plan` (default) and `none`; older `all` reads as `plan`.

- `plan`: the human approves the plan (or the structure outline or epic plan), recorded as a dated owner line in `task.md` `## Decisions`. Design discussion, PRD and TDD reviews stay human gates when the workflow uses them.
- `none`: no human review between skills. Only for explicitly authorized unattended work.

Tool approvals are separate from these delivery **human gates**: full-access/auto tool mode does not select `gates=none`. Run by hand, each skill handoff still requires the next invocation.

**Gate** = approval step. Read saved doc + checks + limits. Request changes → new revision session. Only human approve.

Missing JEV creds + blocked artifacts stay errors/blockers; no skip required checks.


## Typed judgments and JEV

Skills call `skills/delivery/typed-judgment/judge.mjs` via System One/`ask` integration. Cred order: `TYPESAFE_API_KEY`, then file named by `TYPESAFE_API_KEY_FILE`, then `~/.config/typesafe/api_key`. Key outside repo. [typed-judgment skill](../skills/delivery/typed-judgment/SKILL.md) document timeout, retry, evidence rules.

Skills keep a deterministic fallback when their judgment is optional. Research + design artifacts authoritative; chat is not cross-session memory. Blocked phase report missing prereq; not success.

## Verification, app testing, and review

Builders implement one plan phase or outline step at a time and read saved artifacts, not prose claims. Plan or outline unreadable: record the error and run `iterate-plan` or `iterate-structure-outline`; never restart planning from an older document.

Code changes need a fresh verification and review. Reviewers are independent: fresh context, strongest model unless one is named, write a record with `reviewed_commit` and `reviewer_model`. Blocking findings are limited to unmet acceptance criteria, wrong behavior, security, data loss or broken checks; everything else is `follow-up`. Round two and later judge only earlier findings, the builder's `fixed` or `disputed` answers and the fix diff, so a review loop ends on approval or no progress. No round cap applies unless `task.md` `## Decisions` holds an owner's `review-round-limit: N` (N >= 1); the orchestrator copies a cap stated in the request there. `review-round-limit: none` removes it. At the cap the loop stops `needs-human`.

`verify-implementation` runs repo checks and promised acceptance items itself; `test-app` exercises requested real surfaces. Failures go through `iterate-implementation` and fresh verification. `review-code` and `fix-code-review` repeat until clean, no progress, or an explicit owner cap. Then `record-evidence` captures and hosts current behavior, and `iterate-evidence` seals inspection. `describe-pr` publishes the direct capture URL in the complete description and a distinct PR comment. Missing, failed, local-only or stale capture blocks publication. Behavior-changing feedback requires recapture and both destinations updated. See [the evidence flow](../docs/verification.md).

## Task, artifact, and worktree ownership

Task = `<task-root>/<slug>/task.md` plus authoritative `index.json` and immutable semantic iterations. The default root is `.agents/tasks`; explicit task directories/configured roots follow the shared contract. Invalid indexes fail closed; only genuinely absent indexes use legacy numbered files. Raw captures stay outside the task root; provenance metadata stays local. The final PR description exists only as the hosted body. [Collection conventions](../shared/CONVENTIONS.md) own exact selection, revision, and commit rules.

New task gets its own worktree + branch `<dev-name>/<issue-key-if-known>-<short-description>`; slug = worktree/task-dir name. Existing branches reused as-is. An existing task directory reuses task + artifacts. Manual sessions continue in the same checkout + branch from handoff. Code commits stage explicit code paths and never include `.agents/tasks/` files. Never commit unrelated staged work.

User own task branches, artifacts, worktrees. Uninstall never permits deleting task records or cancelled-run worktrees.

## Epics

**Epic** split work into child tasks, each merge separate. Each child need `workflow`, `depends_on`, acceptance criteria, prompt. `start-epic-delivery` create task dirs + GitHub issues when access; child branches use issue number when available. See [task-sizing rules](../shared/SLICING.md).

Ready children run in separate worktrees. Each child PR follows its own review → record-evidence → iterate-evidence → describe-pr chain, with a capture and comment bound to that child's source revision. Prerequisite branches must be merged into the epic branch; PR descriptions do not prove merge. Merge PRs separately, then run `epic-wave` with the same epic task directory.

## Babysit an existing PR set

[`babysit`](../skills/delivery/babysit/SKILL.md) is an active-session supervisor, not a `/deliver` merge stage. It freezes full host/repository/number identities and source-backed dependencies in ignored immutable `supervision.babysit` checkpoints under the configured task root; GitLab selections retain project-scoped IIDs. GitHub is the default host. `/babysit @<checkpoint>` resolves current indexed state and the same selection; only genuine no-index legacy tasks retain numbered files. The template is a starting point, not a mandatory table/JSON schema. External prerequisites, cycles, stale heads and inaccessible requirements block affected paths while independent safe nodes continue.

Record fix and merge authority separately; observe-only grants neither. Explicit “fix and merge these until complete” scopes safe merging to the frozen selection. Prioritize frontier current-head CI, then actionable review; choose debugging, delegation and verification proportionally rather than enforcing a fixed attempt count. Preserve original task/worktree history and serialize writers in isolated selected source-branch worktrees.

Ordinary scoped repairs need actual source access and deciding checks, not original task artifacts, baseline recordings, sealed evidence or proof-helper preflight. Missing optional helpers use the ordinary workflow inline, not observe-only. Full delivery proof remains binding when explicitly required by the owner, repository or original task, including before-edit requirements; routine repairs do not automatically trigger independent review, evidence capture and publication.

Configured native trains are preferred with a source-SHA guard; ordinary merge is allowed only when train/queue requirements are verified disabled. Merge eligibility still requires current required CI/review, host protections and confirmed dependencies. Queued is not merged, and cross-project children wait for host-confirmed prerequisites. Cancel unsafe queued work and read back actual merged state. New review can race a train merge despite cancellation; full-description writes can race human edits. The skill reports those limits rather than claiming atomic safety.

Load one-level references conditionally for the next repair or merge operation. Slack/Jira/breadcrumb details are needed only when requested or configured: one coordinator-owned Slack thread gates mutations once it owns the run; direct MCP mode is explicit and pre-coordinator only. Jira annotations require named-issue authority. Stable `skills:babysit` description markers preserve unrelated body/evidence. Installation still includes existing executable proof companions, not a daemon or mandatory workflow. Monitoring ends with the active session unless an actual runtime scheduler remains active.

## Phase table

Artifact type = template frontmatter `type`. Human gates count only when enabled. Worker-role skills separate in source tree.

| Skill | Artifact type | Human gate | Runs in |
|---|---|---|---|
| babysit | babysit | Scoped fix/merge authority | By hand; ordered existing GitLab PR supervision |
| jira-issue-refinement | jira-refinement | Jira write only | Read-only `/deliver` preflight or standalone existing-ticket rewrite |
| gather-sources | sources | no | By hand before chain; outside source digest |
| create-research-questions | research-questions | no | Research |
| iterate-research-questions | research-questions | optional | Research revision or by hand |
| create-research | research | no | Research |
| iterate-research | research | optional | Research revision or by hand |
| create-design-discussion | design-discussion | yes | Full design |
| iterate-design-discussion | design-discussion | yes | Design feedback |
| create-prd | design-prd | yes | PRD or program |
| iterate-prd | design-prd | yes | PRD feedback |
| create-tdd | design-tdd | yes | PRD or program |
| iterate-tdd | design-tdd | yes | TDD feedback |
| create-structure-outline | structure-outline | yes | Lean planning |
| iterate-structure-outline | structure-outline | yes | Outline feedback |
| create-plan | plan | yes | Full or PRD planning |
| iterate-plan | plan | yes | Plan feedback |
| create-epic-plan | epic-plan | yes | Epic or program; revise plan too |
| start-epic-delivery | epic-delivery | no | Epic or program child prep |
| implement-plan | implementation | yes | One plan phase per session |
| implement-outline | implementation | yes | One outline step per session |
| iterate-implementation | implementation | yes | Implementation feedback + repairs |
| review-code | code-review | no | Review loop |
| group-review | group-review | yes | By hand; review another author's related PRs against Jira and product docs, post approved inline comments |
| fix-code-review | code-review-fixes | no | Repair review findings |
| reproduce-bug | reproduction | yes | Bugfix before product edits |
| fix-bug | fix | no | Bugfix after reproduction |
| record-evidence | evidence | no | After review, before every PR description; UI video or captured CLI/API/agent proof |
| iterate-evidence | evidence-iteration | no | Own authorized capture, inspect, repair loop |
| video-iterative-development | none | no | By hand; authenticated Chrome-and-Android E2E delivery |
| video-iterative-orchestration | none | no | By hand; Jira-epic E2E delivery orchestration |
| agent-slack-control-plane | none | no | Optional by-hand status + steering companion |
| deliver | none | no | Own entry point; the single orchestrator |
| configure-model-routing | none | no | By hand or model-invoked; create + check shared candidate profile |
| herd-next | none | no | By hand inside Herdr; stage next session |
| verify-implementation | verification | no | Before review |
| test-app | app-test | no | When the task asks for app testing |
| typed-judgment | none | no | Optional skill judgments |
| jev-ui | none | no | By hand; capped browser + Android control |
| describe-pr | pr-description | yes | Final PR description + revisions |
| resolve-pr-reviews | pr-review | no | Existing PR review round |
| ci-commit | commit | no | By hand; explicit-path commit conventions |
| review-artifact-comments | comment-review | no | By hand; artifact feedback |
| show-me | show-me | no | By hand; visual explanation |
| author-skill | none | no | By hand; create or revise a skill in this collection |
| explain | none | no | By hand; evidence-grounded audience-specific explanation and optional external HTML |
| land-pr-stack | none | Scoped merge authority | By hand; selected stack landing, GitHub by default |
| safety-dance | none | no | By hand |
| security-check | none | no | Explicit opt-in Semgrep scan with accepted-risk handling |

## Running skills by hand

Call `/<skill> @<artifact or task directory>` in Claude Code, OMP, Pi, or compatible host; `$<skill>` in Codex. Unless exception, task conventions open worktree for new task. Later phases use that checkout + branch.

`iterate-evidence` combines the installed recorder with an authorized inspect/repair loop, capped only by an owner limit. The shared delivery contract keeps the repair state across new sessions and continuation. Independent invocation remains available; a record-only request does not authorize product edits. Install through the [repository installer](../docs/getting-started.md#inspect-and-repair-recorded-behavior) so executable companion dependencies accompany the selected skill.

Phase table = guide, not must-install-all. Manual PR handoff includes `/record-evidence` after `/review-code` and any fixes, before `/describe-pr`; `oneshot` implementation and bugfix follow the same order. A passed receipt is not a published PR until the strict GitHub publication gate verifies original hosted captures, successful recorded commands, passing per-test cues, tested/current-head SHAs, the full body and a distinct same-PR comment. Optional custom hooks still run. Manual handoff names the saved artifact and ends with:

````markdown
Next action:
Open a new session in {run_location}, then run:

```text
/<next-skill> @<artifact_file>
```
````

Running next phase = approval in manual chain. Revise first → new session with right `iterate-*` skill + feedback. Terminal reply no command fence.
