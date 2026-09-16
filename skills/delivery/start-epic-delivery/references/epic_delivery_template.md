---
task: [epic slug]
type: epic-delivery
summary: "[Two to four sentences: how many children were created, which wave starts now, and which children gate the rest.]"
epic_plan: [NN-epic-plan-<slug>.md]
---

# [Epic name] Delivery

Epic branch: `[epic branch]`. Child task files are committed here as `docs(task): open epic children`; each child cuts its worktree from this branch and its pull request targets it.

## Children created

| Child | Slug | Workflow | Depends on |
|---|---|---|---|
| [Child name] | `.agents/tasks/[child-slug]/` | [full, lean, prd, oneshot, or bugfix] | [dependency slugs, or none] |

## Waves

- Wave 1: [child slugs with no dependencies]
- Wave 2: [child slugs whose dependencies are all in wave 1]

A wave starts after every dependency's pull request is merged.

## Human Review

### Review targets

- [Child boundaries and dependency edges to inspect before starting.]

### Verify

- [ ] [Each child directory exists and its `task.md` body matches the epic plan prompt.]

### Known limits

- [Known limit, or `None.`]
