# Immutable task artifacts

An indexed task stores durable artifacts under `artifacts/<kind>/<variant>/<NNNN>.md` inside the task directory, registered in `index.json`. The index is the sole source of truth for what exists and what is current. When `index.json` is present it is authoritative: invalid JSON, an invalid schema, a dangling path, a symlinked component, a SHA-256 mismatch, or mirrored `type`/`status`/`summary` that disagrees with the file fails closed rather than falling back to a directory scan.

CLI entrypoint detection and Git source-root containment compare observed filesystem realpaths, so platform aliases such as macOS `/var` and `/private/var` do not suppress commands or invalidate source identity. This does not waive index, task-directory or artifact-component symlink checks. Slice review checkpoints retain their assigned phase labels; earlier-round lookup matches the exact checkpoint and artifact type, never a single shared slice bucket.

The task-artifact, publication-proof and delivery-contract helpers dispatch their CLIs only when `process.argv[1]` resolves to the helper's realpath, including executable symlinks. A missing entrypoint or an `ENOENT`/`ENOTDIR` error resolving that argument means library import, even if an embedded runtime's virtual filesystem reports that the argument exists. Other resolution errors propagate; failures resolving the helper itself are not suppressed. Direct calls with invalid arguments still exit with an error. This entrypoint guard does not change artifact or evidence-capture symlink enforcement.

Each artifact belongs to exactly one semantic series identified by `(kind, variant)`. Iteration `NNNN` is a four-digit contiguous number starting at `0001`; its id is `<kind>.<variant>.<NNNN>` and its path is `artifacts/<kind>/<variant>/<NNNN>.md`. A series records a `current` pointer and ordered `iterations`. Each iteration record carries `id`, `iteration`, `path`, `sha256` (the lowercase digest of the exact UTF-8 file text), `type`, `status`, and `summary` mirroring the artifact's own metadata, plus `supersedes` naming the immediately preceding iteration (omitted on the first). The index also carries a `generation` that increments by one on every recorded artifact.

The canonical series for each artifact type, exactly as `ARTIFACT_SERIES` in `shared/task-artifacts.mjs`:

| Type | Series (`kind.variant`) |
|---|---|
| `sources` | `research.sources` |
| `research-questions` | `research.questions` |
| `research` | `research.primary` |
| `design-discussion` | `design.discussion` |
| `design-prd` | `design.prd` |
| `design-tdd` | `design.tdd` |
| `structure-outline` | `planning.structure` |
| `plan` | `planning.plan` |
| `epic-plan` | `planning.epic` |
| `epic-delivery` | `delivery.epic` |
| `reproduction` | `debugging.reproduction` |
| `fix` | `implementation.fix` |
| `implementation` | `implementation.receipt` |
| `verification` | `review.verification` |
| `app-test` | `review.browser` |
| `code-review` | `review.code` |
| `code-review-fixes` | `review.fixes` |
| `comment-review` | `review.comments` |
| `pr-description` | `pull-request.description` |
| `pr-review` | `pull-request.review` |
| `evidence` | `evidence.recording` |
| `evidence-iteration` | `evidence.iteration` |
| `execution-plan` | `orchestration.execution` |
| `commit` | `delivery.commit` |
| `plan-review` | `review.plan` |
| `slice-review` | `review.slice` |
| `final-review` | `review.final` |
| `evidence-baseline` | `evidence.baseline` |
| `group-review` | `review.group` |
| `visual-reference` | `design.visual` |
| `feature-contract` | `design.contract` |
| `feature-conformance` | `review.conformance` |
| `jira-refinement` | `research.jira` |
| `delivery-disposition` | `delivery.disposition` |
| `submission-closure` | `delivery.closure` |
| `jira-breakdown` | `planning.jira` |
| `jira-story-start` | `implementation.jira` |
| `qa-readiness` | `review.qa` |
| `babysit` | `supervision.babysit` |

Distinct series never share iterations. Several general reviews of one type are iterations of one series, while different review kinds (`review.code`, `review.fixes`, `review.verification`, `review.browser`, `review.comments`, `pull-request.review`) remain separate durable series with their own current pointers.

`execution-plan` (`orchestration.execution`) remains readable for historical tasks. New orchestration uses `task.md` Status and Decisions, plan Progress, independent review records and evidence seals.

Legacy indexed `pr-description` remains readable, but new publication never writes it. New evidence-baseline and evidence receipts contain task-local provenance metadata only, never raw captures or upload data. The PR body, separate evidence comment, and direct hosted capture URL are the durable proof; scratch captures stay outside the ignored task root, remain available through inspection, publication and resumable follow-up; retire their scratch lineage only when it is no longer needed. Task-local review and verification records remain metadata, not uploads.

Keep each template's frontmatter, including `summary`. Later phases read only `summary` from artifacts they did not select as primary inputs.

Selecting the current artifact of a type: read and validate `index.json`, map the type to its canonical series, and take the iteration record the series' `current` pointer names. Never scan the directory for the newest file when an index exists. The legacy behavior, scanning the task directory for `NN-<type>-<slug>.md` files and taking the highest `NN` whose frontmatter `type` matches, applies only to a legacy task where `index.json` is genuinely absent.

## Iteration

A recorded iteration is immutable. Every durable revision, whether reviewer feedback, a repair, or a regenerated document, creates the next iteration in the same series: allocate the next contiguous number, write the new file, record it with `supersedes` naming the previous current iteration, and advance the series' `current` pointer and the index `generation`. Nothing edits an earlier iteration's file or rewrites its record. Re-read the index before allocating when another actor may have changed it; a stale allocation aborts on conflict rather than overwriting.

Delivery review rounds are distinct from immutable iteration numbers. `deliver/contract.mjs review-next <task-dir> <review-type> <checkpoint>` derives the next round, previous valid blockers and exact rejected-receipt errors from digest-valid history. Invalid reviews, including a failed-check approval or duplicate valid round, remain immutable evidence but do not consume a round or erase earlier valid blockers. New plan digests do not reset checkpoint history. Index/path/hash failures still fail the whole ledger closed.

Receipt rounds remain monotonic across approvals; `repair_round` counts consecutive valid `changes` in the current blocking episode. No implicit review cap applies. An explicit owner `review-round-limit: N` in task.md Decisions stops at that boundary; `review-round-limit: none` removes it. Only a valid approval closes an episode; changed plan digests, rejected attempts and duplicate rounds never reset it.

For an indexed plan with `## Phase N:` sections, `deliver/contract.mjs phase-complete <task-dir> <phase-N> <slice-review-path>` validates a current-head/current-revision approval bound to that exact current plan path and SHA-256, requires committed source, and publishes the plan successor through the existing reservation/record protocol. It marks only that phase's Automated Verification or Verify checkboxes and appends dated commit/review/plan proof in Progress; the reviewer, not this helper, runs the checks. The original plan and review bytes never change. Repeating the same completed phase is idempotent. `status` returns proof-bound `resume.phases`, the first incomplete `next_phase` and `next_action` (`review-plan`, `build` or `final`); the successor needs an independent current plan approval before work continues. Legacy tasks retain manual Progress and never silently initialize an index.

## Recording an artifact

An installed runtime or portable skill may carry the adjacent helper `references/task-artifacts.mjs`. When it is present, the flow is:

1. `node references/task-artifacts.mjs init <task-dir>`: create or validate the task's `index.json`.
2. `node references/task-artifacts.mjs allocate <task-dir> <kind> <variant>`: returns a reservation with the allocated id, canonical path, and a unique staging `writePath`.
3. Write the artifact to the returned `writePath` exactly as it will be published.
4. `node references/task-artifacts.mjs record <task-dir> <kind> <variant> <type> <writePath>`: validates metadata, digests the exact UTF-8 text, publishes the file at its canonical path, registers the iteration, and returns the record. Use the returned canonical path from here on.

The helper also answers `current <task-dir> <type>` (the current record for a type) and `root <repo-root>` (the resolved task root). Distribution depends on the installation shape: canonical skills in this repository and published plugin skills use manual index mutation and cannot assume the helper; runtime and portable builds copy it beside each skill, but no skill requires it; the delivery contract uses its adjacent copy. An independently installed skill never treats the helper as mandatory.

Manual index mutation, when no helper is available, follows this exact contract (`TASK_ARTIFACT_DISTRIBUTION.canonical.contract` in `scripts/lib/build.mjs`):

- Validate the full existing index and every artifact path (relative, inside the task directory, no symlinks) before changing anything.
- Reserve the next contiguous four-digit iteration bound to the current index `generation`. Stage the file at a unique `.artifact-staging/<uuid>.md` and record the reservation with an exclusive create at `.artifact-reservations/<uuid>.json`.
- Digest the exact UTF-8 staging text with SHA-256. The record fields are `id`, `iteration`, `path`, `sha256`, `type`, `status`, `summary`; `supersedes` names the prior current iteration and is omitted on the first.
- Publish with an exclusive hard link from staging to the semantic path, set the series `current` to the new record id, and increment `generation` by one.
- Write the index through an exclusive sibling temporary file renamed atomically over `index.json`. If the index write fails, remove the published artifact; after success, remove the staging file and reservation. On any conflict (stale generation, existing path, concurrent update) abort; never force.


## Task root resolution

The task root resolves in this order:

1. An explicit existing `task_dir` is authoritative. Its parent directory is the task root and no directive is consulted.
2. Otherwise a repository-root `AGENTS.md` or `CLAUDE.md` may declare exactly one override directive: `<!-- skills:task-root=relative/path -->`. Both files may declare it (dual declarations) only when the values match. A conflict between files, more than one directive in one file, an invalid value, or a symlinked instruction file fails closed, as does a symlinked path component under the resolved root.
3. With no directive, the root is `.agents/tasks`.

A valid override is a relative POSIX path: no absolute or drive-letter form, no `~`, environment syntax, escaped bytes, backslashes, or NUL, and no empty, dot, or parent segments; every segment is lowercase `[a-z0-9._-]`. The reserved roots `.git`, `.agents/skills`, and `.atomic-delivery`, and anything beneath them, are rejected. Generic paths in this collection write the root as `<task-root>`; fill it from the resolved value, never a guess.

