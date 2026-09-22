---
task: [epic slug]
type: epic-delivery
summary: "[Two to four sentences: how many children were created, which wave starts now, and which children gate the rest.]"
epic_plan: [canonical planning.epic artifact path]
---

# [Epic name] Delivery

Epic branch: `[epic branch]`. Child task files are committed here as `docs(task): open epic children`; each child cuts its worktree from this branch and its pull request targets it.

## Children created

| Child | Slug | Workflow | Depends on | Issue |
|---|---|---|---|---|
| [Child name] | `<task-root>/[child-slug]/` | [full, lean, prd, oneshot, or bugfix] | [dependency slugs, or none] | [#number, or none] |

## Waves

- Wave 1: [child slugs with no dependencies]
- Wave 2: [child slugs whose dependencies are all in wave 1]

A wave starts after every dependency's pull request is merged. The optional Atomic workflow can launch each ready child in a separate run; by hand, start the children from the commands in the final answer.

## Human Review

### Review targets

- [Child boundaries and dependency edges to inspect before starting.]

### Verify

- [ ] [Each child directory exists and its `task.md` carries the epic plan's prompt and acceptance criteria.]

### Known limits

- [Known limit, or `None.` Name any child whose GitHub issue was not created, or say `GitHub issues were not created: <reason>.`]
