---
type: sources
summary: "Gathered one source, the rmorison/engineering-standards GitHub repository the task names for inspiration. It supplies a three-tier issue hierarchy (milestone/epic/implementation issue) with GitHub-native sub-issues, story-point sizing and task-decomposition rules, PR size targets and increment-merging guidance, and a solo + AI ticket policy where a plan file's Implementation Units track granularity instead of pre-allocated sub-issues. A later phase takes from it the concrete slicing, sizing, sequencing, and stacking conventions to compare against this collection's own issue/epic and delivery skills."
gathered: 2026-09-21
status: complete
---

# Sources

## Purpose

Find inspiration in the referenced repository for making generated issues more granular and epics better structured, so future work slices into granular, reviewable, testable merge requests that stack and deliver quickly.

## Sources

### rmorison/engineering-standards

- Location: https://github.com/rmorison/engineering-standards
- Kind: official documentation (a published set of engineering process standards)
- Authority: `rmorison`, repository owner and maintainer; first-party for these standards
- Version or date: repository status "Draft", no release tag; default branch at commit `faee532` (committed 2026-09-21). `process/issue-tracking.md` is Version 2.1 dated 2026-09-20; `process/compound-engineering-integration.md` verified against CE v3.27.0 (2026-09-19)
- Fetched: `git clone --depth 1` into a temp directory, then read tool on individual files, on 2026-09-21

#### Digest

The repository defines a lightweight, spec-driven SDLC (Intent → Spec → Plan → Execute → Validate) with a set of process standards. Five documents bear directly on the task.

`process/issue-tracking.md` (v2.1) organizes work in a three-tier hierarchy: Milestone (initiative) → Epic tracking issue → Implementation issue. Epics use GitHub's native sub-issue feature for automatic parent-child linking and progress ("5 of 6 completed"), with a single label table as the sole owner of every label. It gives epic size guidelines (optimal 5-15 sub-issues, 20-60 points; split beyond ~20 sub-issues or ~100 points) and defines epic lifecycle, amendment, splitting/merging, and cross-epic dependency handling. It distinguishes team-scale ceremony from a solo + AI mode where a plan file's Implementation Units (U-IDs) are the granular tracker and sub-issues are filed reactively.

`process/project-planning-standards.md` sets a Fibonacci story-point scale (1-13, baseline 2 points ≈ 1 day, break down anything larger than 13) and prescribes decomposition into tasks that are independently testable, incrementally valuable, right-sized (2-8 points), and clearly scoped, with a standard breakdown pattern (schema → core logic → API → UI → integration) and dependency/sequencing strategies.

`process/git-branching-strategy.md` follows GitHub Flow with issue-based branch names `{issue-number}-{slugified-title}`, targets PRs of 200-400 changed lines, and prescribes breaking large features into multiple issues/PRs merged as small increments (max ~1 week per branch), using feature flags to hide incomplete work. It lists large multi-purpose PRs and long-lived branches as anti-patterns.

`process/feature-development-workflow.md` defines six phases; Phase 3 (Planning & Sequencing) breaks work into implementable increments and Phase 5 (Implementation) requires small, scoped PRs focused on single components with tests.

`process/compound-engineering-integration.md` (§ 3-5) defines the solo + AI ticket policy: one umbrella epic per multi-phase plan, the plan (its Implementation Units) as the granular tracker, reactive sub-issues only, and an AI-review discipline that substitutes for human approval on small-scale autonomous work while reserving stricter treatment for critical (P0) changes.

#### Excerpts

> Use a three-tier structure to organize work from high-level initiatives down to specific implementation tasks:
> ```
> Milestone (Initiative)
> ├── Epic Issue (Feature Theme)
> │   ├── Implementation Issue
> │   ├── Implementation Issue
> │   └── Implementation Issue
> ```

`process/issue-tracking.md`, "Three-Tier Hierarchy".

> **Purpose**: Discrete, actionable work items that can be completed independently.
> - Reference epic in description: `Part of epic #42`
> - Point estimate using a `points-` label at team scale. Solo + AI work expresses scope through the plan's U-IDs instead

`process/issue-tracking.md`, "Tier 3: Implementation Issue".

> **Optimal size**: 5-15 sub-issues, 20-60 points
> - Manageable scope, clear theme, achievable in 1-2 months
> **Maximum size**: 20 sub-issues, ~100 points
> - Beyond these limits: consider splitting into multiple epics

`process/issue-tracking.md`, "Epic Size Guidelines".

> **Adding sub-issues**: ... **Splitting epics**: When epic exceeds ~20 sub-issues or has distinct themes, create new epic and move relevant sub-issues. ... **Merging epics**: When overlap is significant and combined epic <15 sub-issues, move sub-issues to primary epic and close secondary with reference.

`process/issue-tracking.md`, "Epic Amendments and Scope Changes".

> Break features into tasks that are:
> - **Independently testable**: Each task produces verifiable output
> - **Incrementally valuable**: Each task moves toward the goal
> - **Right-sized**: Typically 2-8 points; rarely >13
> - **Clearly scoped**: Obvious when "done"

`process/project-planning-standards.md`, "Task Breakdown" → "Decomposition Strategy".

> **If it's larger than 13 points, break it down.** Tasks this large carry too much risk and uncertainty.

`process/project-planning-standards.md`, "Scale Guidelines".

> **Target**: 200-400 lines of changes (excluding generated code)
> **Why**: Smaller PRs = faster, better reviews
> **How**: Break large features into multiple issues/PRs, use feature flags if needed

`process/git-branching-strategy.md`, "Pull Request Guidelines" → "PR Size".

> **Solution**:
> - Break into multiple issues/sub-features
> - Each gets own branch and PR (keep each under 1 week)
> - Use feature flags to hide incomplete UI
> - Merge small increments continuously

`process/git-branching-strategy.md`, "Common Scenarios" → "Long-Running Feature".

> ### ❌ Large, Multi-Purpose PRs
> **Problem**: Hard to review, slow feedback, risky merges
> **Solution**: One issue per PR, use feature flags for incremental merges

`process/git-branching-strategy.md`, "Anti-Patterns".

> 2. **Small, scoped changes** - Break work into reviewable increments
> 3. **Continuous validation** - Test against specs throughout development

`process/feature-development-workflow.md`, "Guiding Principles".

> The implementation-ready plan file — the one carrying `## Implementation Units`, not a requirements-only brainstorm artifact sharing the same directory — is the granular unit tracker via U-IDs; pre-allocating per-U sub-issues duplicates state and drifts from the plan.

`process/compound-engineering-integration.md`, § 3 "Solo + AI".

> - **One umbrella epic per multi-phase plan** (label: `epic`). The epic links to the plan; the plan is the granular tracker via U-IDs. Do not pre-allocate per-U sub-issues.
> - **Sub-issues are reactive**, filed when needed: `bug`, `from-review`, `from-deferred-q`, `tech-debt`, `enhancement`.

`process/compound-engineering-integration.md`, § 3 "Ticket policy at solo + AI scale".

> **Epic structure.** Earns its keep at 5+ implementation issues per feature. ... For the 3–4 band in between, solo + AI mode uses labels plus plan U-IDs — the standards' own answer for small groupings — rather than an epic.

`process/compound-engineering-integration.md`, § 5 "Solo-scale adaptations".

## Conflicts

None.

## Unreachable

None.

### Known limits

- The repository publishes no release version or tag; it is marked "Draft" and "in active development and subject to revision". The digest reflects the default branch at commit `faee532` on 2026-09-21.
- The repository was read selectively against the task: the five process documents on issues, planning, branching, feature workflow, and CE integration were digested in full. `process/technical-work-workflow.md`, `process/documentation-standards.md`, the `code/`, `ai/`, `templates/`, `docs/`, and `agent-transcripts/` trees were seen in the listing but not digested; a later phase needing bug/tech-debt classification (P0 severity tiers) or the six-layer AI architecture should read those files.
- Several conventions (solo + AI ticket policy, plan Implementation Units, AI-review discipline) assume the external compound-engineering plugin; they are inspiration for how this collection could track granularity, not a dependency to adopt.
