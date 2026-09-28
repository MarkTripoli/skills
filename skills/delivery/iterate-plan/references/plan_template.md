---
task: eng-xxxx-description
type: plan
summary: "[Two to four sentences: what this document establishes, the decisions it fixes, and what a later phase needs from it. Downstream sessions read this instead of the full file.]"
repo: [repository name]
branch: [branch name]
sha: [current commit]
---

# [Feature or Task Name] Implementation Plan

## Overview

[Brief description of what is being implemented and why.]

## Current State Analysis

[What exists now, what is missing, and the constraints that matter.]

### Key Discoveries:

- [Observed repository fact with source location]
- [Existing approach this should match]
- [Limit or risk to preserve]

## Desired End State

[Specification of the completed state and how it will be verified.]

## What We're NOT Doing

[Out-of-scope items that prevent drift.]

## Execution Strategy

[Implementation path and tradeoffs.]

---

## Phase 1: [Phase title]

### Goal

[Result this phase must produce.]

### Required Edits:

#### 1.1 [Area to modify]

**File**: `path/to/file.ext`
**Changes**: [Concrete edit and where it belongs.]

```diff
+ [specific code shape to add]
~ [specific existing shape to change]
```

### Success Criteria:

#### Automated Verification:

- [ ] [runnable command]

human-gated: false

#### Deferred human evidence (recorded, not a gate):

Omit this section when the phase has none.

- [plain bullet, no checkbox] [evidence item and pointer to where it is recorded]

---

## Phase 2: [Phase title]

[Repeat this structure.]


## Ambiguity Disposition

| Consequential ambiguity | Disposition (source-backed inference or stakeholder choice) | Owner | Source / rationale | Acceptance impact | State |
|---|---|---|---|---|---|
| [Question] | [Inference / stakeholder choice] | [Named owner] | [Citation or rationale] | [Criteria affected] | [Open / resolved] |

Unresolved stakeholder choices are not agreed criteria and cannot authorize implementation.

## Acceptance Critique (before Human Review)

Independent reviewer: [named role/person, independent of plan author]

Review method: [How the reviewer independently compared plan phases/criteria with product and technical acceptance obligations.]

Review scope: [Criteria, phases, and applicable positive, negative, error, boundary, and failure outcomes examined; note evidence/source used.]

| Acceptance criterion / phase | Challenge and observed gap | Actionable revision | Revision applied (location/evidence) | Critique rerun (reviewer/result) |
|---|---|---|---|---|
| [Criterion] | [Outcome examined and gap, or `No gap`; explain] | [Specific change or `None`] | [Applied change and plan location, or `Not required` with rationale] | [Reviewer and result after revision, or `Not required` with rationale] |

| Lens | Applied or skipped | Evidence / concrete skip reason |
|---|---|---|
| Acceptance | Applied | [Coverage of observable outcomes, unmet criteria, and review evidence] |
| [Other relevant lens] | [Applied / skipped] | [Finding or why irrelevant] |

Resolve every actionable finding by applying the revision and recording its location/evidence, then rerun and record the independent critique result. A clean critique records that no revision was required. Unresolved findings or stakeholder choices block approval and implementation.
## Human Review

### Review targets

- [Phase boundaries, dependencies, and changed-file ownership to inspect.]

### Verify

- [ ] [Exact plan or acceptance check required before implementation.]

### Known limits

- [Known limit, or `None.`]
