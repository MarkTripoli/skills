---
task: eng-xxxx-description
type: epic-plan
summary: "[Two to four sentences: what this epic delivers, how many children it creates, and which children gate the rest. Downstream sessions read this instead of the full file.]"
repo: [repository name]
branch: [branch name]
sha: [current commit]
---

# [Epic name] Epic Plan

## Goal

[Outcome the epic delivers once every child has merged.]

## Current State

[What exists now and the constraints that matter, taken from research with source locations.]

## Decomposition

[Why these children, at this granularity, in this order. Name the boundary that makes each child mergeable on its own, and the contract siblings share so they can run in parallel.]

## Children

```json
[
  {
    "name": "[Child outcome]",
    "workflow": "oneshot",
    "slice": "vertical",
    "depends_on": [],
    "acceptance": [
      "WHEN [trigger], the [system] shall [observable response].",
      "IF [condition], THEN the [system] shall [observable response]."
    ],
    "prompt": "[Self-contained task description: the files, the behavior, and what proves it]"
  },
  {
    "name": "[Child outcome]",
    "workflow": "full",
    "slice": "enabler",
    "flag": "[flag name; its default keeps today's behavior]",
    "depends_on": ["[Child outcome]"],
    "acceptance": ["WHILE [state], the [system] shall [observable response]."],
    "prompt": "[Self-contained task description]"
  }
]
```

## Slice Check

| Child | Observable increment | Size evidence | Merge safety |
|---|---|---|---|
| [Child outcome] | [what a caller can exercise once this merges, or the sibling that consumes this enabler] | [layers and files touched; the split applied when the first cut was larger] | [flag and its default, additive, or unreachable until the named child merges] |

## Ordering

- Wave 1: [children with no dependencies]
- Wave 2: [children whose dependencies are all in wave 1]

## Workflow judgments

| Child | Chosen | Suggested | Confidence |
|---|---|---|---|
| [Child outcome] | oneshot | oneshot | 0.00 |

[Or: `Helper unavailable; workflows chosen by this skill.`]

## Sizing judgments

| Child | Verdict | Weakest test | Probability | Criteria | Split named |
|---|---|---|---|---|---|
| [Child outcome] | ok | one_day | 0.00 | ok | none |

[Or: `Helper unavailable; sizing judged by this skill.`]

## Human Review

### Review targets

- [Child boundaries, dependency edges, and workflow type choices to inspect.]

### Verify

- [ ] [Exact check required before delivery starts.]

### Known limits

- [Known limit, or `None.`]
