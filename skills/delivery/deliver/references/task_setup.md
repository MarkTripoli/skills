# Task setup

## Task and worktree

New task slug from the title: lowercase, punctuation to spaces, drop `a an the to of for in on and or with that this add make create please fix bug`, join the first four remaining words with `-` (fallback the first four original words, then `task`; collisions get `-2`, `-3`). Branches follow the conventions' `<dev-name>/<issue-key-if-known>-<short-description>`; an explicit or existing branch stays.

Open the task worktree per the conventions before writing `<task-root>/<slug>/task.md`: fetch `origin`, resolve `origin/main`, cut from that exact commit and record its SHA (an explicit base wins; if fetching fails or `origin/main` is missing, state the observed fallback).

`task.md` frontmatter: `slug`, `title`, `workflow`, `gates`, `routed_by: deliver`, `created`, `base`. The original request is the first body section, then `## Delivery brief`, `## Status` (the current stop condition and any unblock check) and `## Decisions` (dated: decision, owner, reason). Brief lines: `Jira source`, `Jira refinement artifact`, `Base and SHA`, `Decision authority`, `Functional requirements`, `QA repro steps`, `Acceptance criteria`, `UI surfaces`, `PR evidence`, `PR follow-up`, `Model roles`, `Delegation`, `PR sizing`, `Open gaps`. An unattended authorization is preserved in the brief.

## Workflow

Pick from the request and the size check; record a one-line reason in the brief. An existing task keeps its workflow.

| Workflow | Use when | Plan depth |
|---|---|---|
| `oneshot` | Small, stated behavior, verification available | Task-only phase, no plan document |
| `bugfix` | Observed differs from expected | `reproduce-bug`, then a fix phase |
| `lean` | Shape clear, several files | Research, structure outline |
| `full` | Competing approaches, cross-module impact, migration | Research, design discussion, plan |
| `prd` | Product requirements need definition | PRD, TDD, plan |
| `epic` | Several independently mergeable deliverables | `create-epic-plan`, `start-epic-delivery` |
| `program` | Product definition, then epic children | PRD, TDD, epic plan |
| `resolve-reviews` | Existing PR needs its threads resolved | `resolve-pr-reviews` |
| `epic-wave` | An epic has ready children | Read the epic-delivery receipt; run each ready child as its own `/deliver` |

Size before building with `shared/SLICING.md`: one independently mergeable, one-day slice per PR. A single PR near 10,000 hand-written changed lines, or one that fails a slicing test, becomes `epic` (or `program` when product definition is open) with normally two to four PRs merged in order. Count generated files and lockfile churn separately. Recheck after research and whenever the diff grows.

## Jira and Slack

For a Jira URL or key, run `jira-issue-refinement` read-only after opening the task and before planning; save its artifact and reconcile its `## Planning impact` before implementation. A sparse ticket never licenses invented behavior. Change Jira only with ticket-specific approval.

Slack, one mode per task: with the `slack-coordinator` executable and daemon configured, run `slack-coordinator run start` once and save `slack_run_id`. If it fails, note why in `## Decisions`, then use direct feature-thread mode if configured, else go on without Slack; stop only if the request made Slack a gate. With just the operator Slack file configured, use direct feature-thread mode and save `slack_channel` and `slack_thread_ts`.

## Model profile

Read exact candidates with the portable helper: `printf '%s\n' '{"skillsDir":"<skills-dir>","phase":"<phase>","cwd":"<project>"}' | node <skills-dir>/route-model/route-model.mjs --candidates <json-file> --economy <model>`. Precedence: explicit file, `SKILLS_MODEL_CANDIDATES_FILE`, `<project>/.agents/model-candidates.json`; candidates run weakest to strongest. No valid profile: Claude Code, Oh My Pi, Pi and portable users run `/configure-model-routing`, Codex users `$configure-model-routing`; then state no model was enforced.
